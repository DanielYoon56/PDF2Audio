import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

type ConversionMode = 'ko-translate' | 'original-clean';

interface GenerateScriptBody {
  pdfBase64?: unknown;
  fileName?: unknown;
  mode?: unknown;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSystemInstruction(mode: ConversionMode): string {
  const commonRules = [
    '당신은 학술 논문과 전문 리포트를 귀로 듣기 좋은 오디오북 낭독 대본으로 변환하는 전문 편집자입니다.',
    '1. 원문의 내용, 논리 흐름, 세부 설명, 실험 수치, 예시를 절대 요약하거나 임의로 생략하지 말고 문서 전체 본문을 처음부터 끝까지 빠짐없이 변환하세요.',
    '2. 2단 편집이나 복잡한 레이아웃이 있는 PDF라도 사람이 읽는 정확한 순서대로 문맥을 이어서 변환하세요.',
    '3. 머리글(Header), 바닥글(Footer), 페이지 번호, [1], [2, 3] 또는 (Smith et al., 2020) 같은 본문 내 인용 표기, URL/DOI 링크, 그리고 문서 끝의 참고문헌(References / Bibliography) 섹션은 완전히 제거하세요.',
    '4. 수식, 기호(%, ≥, ≤, α, β, ±, ×, ≈ 등), 약어 및 표의 수치는 귀로 들었을 때 자연스럽게 이해할 수 있는 일상적인 말로 풀어서 작성하세요.',
    '5. 마크다운 기호(*, **, #, -, _, ` 등), 글머리 기호, 인사말("안녕하세요", "다음은 대본입니다" 등), 메타 설명 없이 오직 낭독할 순수 본문 텍스트만 문단별로 빈 줄 하나(\\n\\n)로 구분해 출력하세요.',
  ];

  if (mode === 'ko-translate') {
    return [
      ...commonRules,
      '6. 원문이 영어 등 외국어이더라도 전체 본문을 자연스러운 한국어로 번역하세요. 딱딱한 직역이나 번역투를 피하고, 청취자에게 친절하고 전문적으로 설명하듯 정중한 한국어 구어체("~합니다", "~습니다", "~입니다")로 작성하세요.',
    ].join('\n');
  }

  return [
    ...commonRules,
    '6. 원문의 언어(영어, 한국어 등)를 그대로 유지하면서 귀로 듣기에 매끄럽고 자연스러운 낭독용 문장으로 정제하세요. 원문이 한국어라면 정중한 구어체("~합니다", "~습니다")로 다듬고, 원문이 영어라면 자연스러운 Spoken English 내레이션 문체로 정제하세요.',
  ].join('\n');
}

function buildUserPrompt(mode: ConversionMode, fileName?: string): string {
  const safeName = fileName ? ` (파일명: ${fileName})` : '';
  if (mode === 'ko-translate') {
    return `첨부된 PDF 문서${safeName}의 전체 본문을 빠짐없이 한국어로 번역하고, 귀로 듣기 자연스러운 오디오북 낭독 대본으로 변환해 주세요. 요약이나 생략, 마크다운 기호, 인사말 없이 낭독할 문단들만 빈 줄로 구분해 출력하세요.`;
  }
  return `첨부된 PDF 문서${safeName}의 전체 본문을 원문 언어 그대로 유지하면서 빠짐없이 귀로 듣기 자연스러운 오디오북 낭독 대본으로 정제해 주세요. 요약이나 생략, 마크다운 기호, 인사말 없이 낭독할 문단들만 빈 줄로 구분해 출력하세요.`;
}

function sanitizeScriptOutput(rawText: string): string {
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/^```[\s\S]*?\n/, '')
    .replace(/\n```$/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function detectScriptLanguage(script: string, mode: ConversionMode): 'ko-KR' | 'en-US' {
  if (mode === 'ko-translate') {
    return 'ko-KR';
  }
  const hangulMatches = script.match(/[가-힣]/g);
  const latinMatches = script.match(/[A-Za-z]/g);
  const hangulCount = hangulMatches ? hangulMatches.length : 0;
  const latinCount = latinMatches ? latinMatches.length : 0;
  return hangulCount >= latinCount * 0.25 ? 'ko-KR' : 'en-US';
}

function parseApiError(error: unknown): { status: number; message: string; code: string } {
  if (error instanceof Error && error.message === 'GEMINI_API_KEY_MISSING') {
    return {
      status: 500,
      code: 'API_KEY_MISSING',
      message: '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 확인해 주세요.',
    };
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const statusMatch =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : undefined;

  if (
    statusMatch === 403 ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API_KEY_INVALID') ||
    rawMessage.includes('API key not valid')
  ) {
    return {
      status: 403,
      code: 'API_KEY_INVALID',
      message: 'Gemini API 인증에 실패했습니다. Settings > Secrets 패널에서 유효한 API 키가 설정되어 있는지 확인해 주세요.',
    };
  }

  if (statusMatch === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: '현재 API 요청 한도를 초과했습니다. 잠시 후 다시 시도하거나 API 키의 사용량 한도를 확인해 주세요.',
    };
  }

  if (statusMatch === 400 || rawMessage.includes('INVALID_ARGUMENT')) {
    return {
      status: 400,
      code: 'INVALID_PDF',
      message: 'PDF 파일을 처리할 수 없습니다. 암호가 걸려 있거나 손상된 PDF, 또는 지원 용량을 초과한 파일인지 확인해 주세요.',
    };
  }

  if (statusMatch === 503 || rawMessage.includes('UNAVAILABLE') || rawMessage.includes('overloaded')) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Gemini 모델 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  return {
    status: 500,
    code: 'GENERATION_FAILED',
    message: `대본 생성 중 오류가 발생했습니다. (${rawMessage.slice(0, 180)})`,
  };
}

async function generateWithRetry(
  ai: GoogleGenAI,
  pdfBase64: string,
  mode: ConversionMode,
  fileName?: string
): Promise<string> {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              text: buildUserPrompt(mode, fileName),
            },
          ],
        },
        config: {
          systemInstruction: buildSystemInstruction(mode),
        },
      });

      const text = response.text;
      if (!text || !text.trim()) {
        throw new Error('모델이 빈 응답을 반환했습니다. 텍스트가 포함된 정상적인 PDF인지 확인해 주세요.');
      }

      return sanitizeScriptOutput(text);
    } catch (error) {
      lastError = error;
      const errText = error instanceof Error ? error.message : String(error);
      const isTransient =
        errText.includes('503') ||
        errText.includes('UNAVAILABLE') ||
        errText.includes('fetch failed') ||
        errText.includes('ECONNRESET');

      if (attempt < maxAttempts && isTransient) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/generate-script', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as GenerateScriptBody;
      const pdfBase64 = typeof body.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
      const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : undefined;
      const mode: ConversionMode =
        body.mode === 'original-clean' ? 'original-clean' : 'ko-translate';

      if (!pdfBase64) {
        res.status(400).json({
          code: 'MISSING_PDF',
          error: '변환할 PDF 데이터가 전달되지 않았습니다. PDF 파일을 다시 선택해 주세요.',
        });
        return;
      }

      // Base64 length check (~28MB raw PDF ≈ 38MB base64)
      if (pdfBase64.length > 42_000_000) {
        res.status(413).json({
          code: 'FILE_TOO_LARGE',
          error: 'PDF 용량이 너무 큽니다. 데모 환경에서는 25MB 이하의 PDF 파일을 업로드해 주세요.',
        });
        return;
      }

      const ai = getGeminiClient();
      const script = await generateWithRetry(ai, pdfBase64, mode, fileName);
      const paragraphs = script
        .split(/\n{2,}|\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const detectedLanguage = detectScriptLanguage(script, mode);

      res.json({
        script: paragraphs.join('\n\n'),
        paragraphs,
        detectedLanguage,
        model: 'gemini-2.5-flash',
      });
    } catch (error) {
      const parsed = parseApiError(error);
      res.status(parsed.status).json({
        code: parsed.code,
        error: parsed.message,
      });
    }
  });

  // Handle JSON payload too large error gracefully
  app.use((err: unknown, _req: Request, res: Response, next: express.NextFunction) => {
    if (
      typeof err === 'object' &&
      err !== null &&
      'type' in err &&
      (err as { type?: string }).type === 'entity.too.large'
    ) {
      res.status(413).json({
        code: 'FILE_TOO_LARGE',
        error: '업로드한 PDF 파일 용량이 허용 한도를 초과했습니다. 25MB 이하의 PDF 파일을 사용해 주세요.',
      });
      return;
    }
    next(err);
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PaperAudio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
