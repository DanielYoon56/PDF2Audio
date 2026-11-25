import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';

dotenv.config({ path: '.env.local' });
dotenv.config();
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
function normalizeOpenRouterModel(raw?: string): string {
  const fallback = 'anthropic/claude-sonnet-4.5';
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();

  if (trimmed.includes('/') && !/\s/.test(trimmed)) {
    if (trimmed === 'anthropic/claude-3.5-sonnet') {
      return fallback;
    }
    return trimmed;
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (normalized.startsWith('claude-')) {
    return `anthropic/${normalized}`;
  }

  return normalized.includes('/') ? normalized : fallback;
}

const DEFAULT_OPENROUTER_MODEL = normalizeOpenRouterModel(
  process.env.OPENROUTER_MODEL
);

type ConversionMode = 'ko-translate' | 'ko-summary' | 'original-clean';
type LlmProviderPreference = 'auto' | 'gemini' | 'openrouter';

interface PageRangeInfo {
  startPage: number;
  endPage: number;
  totalPages: number;
}

interface GenerateScriptBody {
  pdfBase64?: unknown;
  fileName?: unknown;
  mode?: unknown;
  provider?: unknown;
  pageRange?: unknown;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
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
  const sharedCleanupRules = [
    '2단 편집이나 복잡한 레이아웃이 있는 PDF라도 사람이 읽는 정확한 순서대로 문맥을 이어서 변환하세요.',
    '머리글(Header), 바닥글(Footer), 페이지 번호, [1], [2, 3] 또는 (Smith et al., 2020) 같은 본문 내 인용 표기, URL/DOI 링크, 그리고 문서 끝의 참고문헌(References / Bibliography) 섹션은 완전히 제거하세요.',
    '수식, 기호(%, ≥, ≤, α, β, ±, ×, ≈ 등), 약어 및 표의 수치는 귀로 들었을 때 자연스럽게 이해할 수 있는 일상적인 말로 풀어서 작성하세요.',
    '마크다운 기호(*, **, #, -, _, ` 등), 글머리 기호, 인사말("안녕하세요", "다음은 대본입니다" 등), 메타 설명 없이 오직 낭독할 순수 본문 텍스트만 문단별로 빈 줄 하나(\\n\\n)로 구분해 출력하세요.',
  ];

  if (mode === 'ko-summary') {
    return [
      '당신은 긴 학술 논문과 전문 리포트를 논리 구조를 유지한 채 핵심만 명쾌하게 들려주는 오디오북 전문 요약 편집자입니다.',
      '1. 원문의 전체 논리 흐름과 구조(연구 배경 및 문제 제기 → 핵심 아이디어 및 방법론 → 주요 실험 조건 및 핵심 수치 결과 → 결론 및 시사점)를 충실히 유지하되, 전체 분량을 원문 대비 약 30% 내외로 압축하여 핵심 요약 낭독 대본을 작성하세요.',
      '2. 단순 개요에 그치지 말고 논문의 핵심 주장, 차별화된 기법, 중요한 실험 수치와 비교 결과를 반드시 포함하세요.',
      '3. 원문이 영어 등 외국어이더라도 자연스러운 한국어로 번역하며, 딱딱한 번역투를 피하고 청취자에게 명확히 설명하듯 정중한 한국어 구어체("~합니다", "~습니다", "~입니다")로 작성하세요.',
      ...sharedCleanupRules.map((rule, i) => `${i + 4}. ${rule}`),
    ].join('\n');
  }

  if (mode === 'ko-translate') {
    return [
      '당신은 학술 논문과 전문 리포트를 귀로 듣기 좋은 오디오북 낭독 대본으로 변환하는 전문 편집자입니다.',
      '1. 원문의 내용, 논리 흐름, 세부 설명, 실험 수치, 예시를 절대 요약하거나 임의로 생략하지 말고 문서 전체 본문을 처음부터 끝까지 빠짐없이 변환하세요.',
      '2. 원문이 영어 등 외국어이더라도 전체 본문을 자연스러운 한국어로 번역하세요. 딱딱한 직역이나 번역투를 피하고, 청취자에게 친절하고 전문적으로 설명하듯 정중한 한국어 구어체("~합니다", "~습니다", "~입니다")로 작성하세요.',
      ...sharedCleanupRules.map((rule, i) => `${i + 3}. ${rule}`),
    ].join('\n');
  }

  return [
    '당신은 학술 논문과 전문 리포트를 귀로 듣기 좋은 오디오북 낭독 대본으로 변환하는 전문 편집자입니다.',
    '1. 원문의 내용, 논리 흐름, 세부 설명, 실험 수치, 예시를 절대 요약하거나 임의로 생략하지 말고 문서 전체 본문을 처음부터 끝까지 빠짐없이 변환하세요.',
    '2. 원문의 언어(영어, 한국어 등)를 그대로 유지하면서 귀로 듣기에 매끄럽고 자연스러운 낭독용 문장으로 정제하세요. 원문이 한국어라면 정중한 구어체("~합니다", "~습니다")로 다듬고, 원문이 영어라면 자연스러운 Spoken English 내레이션 문체로 정제하세요.',
    ...sharedCleanupRules.map((rule, i) => `${i + 3}. ${rule}`),
  ].join('\n');
}

function buildUserPrompt(
  mode: ConversionMode,
  fileName?: string,
  pageRange?: PageRangeInfo
): string {
  const safeName = fileName ? ` (파일명: ${fileName})` : '';
  let splitHint = '';
  if (pageRange && pageRange.totalPages > 0) {
    if (pageRange.startPage === 1 && pageRange.endPage < pageRange.totalPages) {
      splitHint = ` 이 파일은 전체 ${pageRange.totalPages}페이지 중 우선 변환 구간인 1~${pageRange.endPage}페이지입니다. 문서가 분할되었다는 메타 안내나 마무리 인사 없이 해당 구간 본문만 자연스럽게 변환하세요.`;
    } else if (pageRange.startPage > 1) {
      splitHint = ` 이 파일은 전체 ${pageRange.totalPages}페이지 중 이어지는 ${pageRange.startPage}~${pageRange.endPage}페이지 구간입니다. 앞선 대본에 자연스럽게 이어지도록 인사말이나 도입 소개 없이 바로 본문 낭독 대본을 이어서 출력하세요.`;
    }
  }

  if (mode === 'ko-summary') {
    return `첨부된 PDF 문서${safeName}의 논리 구조와 핵심 수치·결론을 유지하면서 전체 분량을 약 30% 내외로 압축한 한국어 핵심 요약 오디오북 낭독 대본을 작성해 주세요. 마크다운 기호나 인사말 없이 낭독할 문단들만 빈 줄로 구분해 출력하세요.${splitHint}`;
  }
  if (mode === 'ko-translate') {
    return `첨부된 PDF 문서${safeName}의 전체 본문을 빠짐없이 한국어로 번역하고, 귀로 듣기 자연스러운 오디오북 낭독 대본으로 변환해 주세요. 요약이나 생략, 마크다운 기호, 인사말 없이 낭독할 문단들만 빈 줄로 구분해 출력하세요.${splitHint}`;
  }
  return `첨부된 PDF 문서${safeName}의 전체 본문을 원문 언어 그대로 유지하면서 빠짐없이 귀로 듣기 자연스러운 오디오북 낭독 대본으로 정제해 주세요. 요약이나 생략, 마크다운 기호, 인사말 없이 낭독할 문단들만 빈 줄로 구분해 출력하세요.${splitHint}`;
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
  if (mode === 'ko-translate' || mode === 'ko-summary') {
    return 'ko-KR';
  }
  const hangulMatches = script.match(/[가-힣]/g);
  const latinMatches = script.match(/[A-Za-z]/g);
  const hangulCount = hangulMatches ? hangulMatches.length : 0;
  const latinCount = latinMatches ? latinMatches.length : 0;
  return hangulCount >= latinCount * 0.25 ? 'ko-KR' : 'en-US';
}

function inferDocumentCategory(script: string, fileName?: string): string {
  const sample = `${fileName ?? ''} ${script.slice(0, 2500)}`.toLowerCase();

  const rules: { category: string; pattern: RegExp }[] = [
    {
      category: 'AI · 머신러닝',
      pattern:
        /transformer|attention|resnet|neural|deep learning|llm|gpt|diffusion|인공지능|딥러닝|신경망|트랜스포머|강화학습|머신러닝|언어 모델/,
    },
    {
      category: '컴퓨터공학 · SW',
      pattern:
        /algorithm|compiler|distributed|database|kubernetes|security|encryption|알고리즘|분산 시스템|데이터베이스|보안|소프트웨어|네트워크/,
    },
    {
      category: '의학 · 바이오',
      pattern:
        /clinical|patient|protein|genome|cancer|therapy|cell|임상|환자|단백질|유전체|바이오|의학|치료|세포/,
    },
    {
      category: '경제 · 비즈니스',
      pattern:
        /market|revenue|gdp|inflation|finance|investment|strategy|시장|매출|금융|투자|경제|경영|전략|리포트/,
    },
    {
      category: '자연과학 · 공학',
      pattern:
        /quantum|physics|chemistry|material|energy|semiconductor|양자|물리|화학|소재|에너지|반도체|공학/,
    },
    {
      category: '인문 · 사회과학',
      pattern:
        /policy|education|psychology|sociology|history|ethics|정책|교육|심리|사회|역사|윤리|법률/,
    },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(sample)) {
      return rule.category;
    }
  }
  return '일반 논문 · 리포트';
}

function shouldFallbackToOpenRouter(error: unknown): boolean {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const statusMatch =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : undefined;

  return (
    rawMessage === 'GEMINI_API_KEY_MISSING' ||
    statusMatch === 429 ||
    statusMatch === 500 ||
    statusMatch === 502 ||
    statusMatch === 503 ||
    statusMatch === 504 ||
    rawMessage.includes('RESOURCE_EXHAUSTED') ||
    rawMessage.includes('UNAVAILABLE') ||
    rawMessage.includes('overloaded') ||
    rawMessage.includes('quota') ||
    rawMessage.includes('rate limit') ||
    rawMessage.includes('429') ||
    rawMessage.includes('503')
  );
}

function parseApiError(
  error: unknown,
  hasOpenRouterKey: boolean
): { status: number; message: string; code: string } {
  if (error instanceof Error && error.message === 'GEMINI_API_KEY_MISSING') {
    return {
      status: 500,
      code: 'API_KEY_MISSING',
      message:
        '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 확인해 주세요.',
    };
  }

  if (error instanceof Error && error.message === 'OPENROUTER_API_KEY_MISSING') {
    return {
      status: 500,
      code: 'OPENROUTER_KEY_MISSING',
      message:
        '서버에 OPENROUTER_API_KEY가 설정되어 있지 않습니다. Settings > Secrets 패널에 OpenRouter API 키를 추가해 주세요.',
    };
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const statusMatch =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : undefined;

  if (rawMessage.startsWith('OpenRouter 오류:')) {
    const detail = rawMessage.replace(/^OpenRouter 오류:\s*/, '').trim();
    if (statusMatch === 401 || statusMatch === 403) {
      return {
        status: statusMatch,
        code: 'OPENROUTER_AUTH_FAILED',
        message: `OpenRouter API 키 인증에 실패했습니다. Settings > Secrets의 OPENROUTER_API_KEY를 확인해 주세요. (${detail})`,
      };
    }
    if (statusMatch === 402) {
      return {
        status: 402,
        code: 'OPENROUTER_INSUFFICIENT_CREDITS',
        message: `OpenRouter 계정의 크레딧(잔액)이 부족합니다. OpenRouter 잔액을 확인해 주세요. (${detail})`,
      };
    }
    if (statusMatch === 429) {
      return {
        status: 429,
        code: 'OPENROUTER_RATE_LIMITED',
        message: `OpenRouter 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요. (${detail})`,
      };
    }
    if (statusMatch === 400 || statusMatch === 404) {
      return {
        status: statusMatch,
        code: 'OPENROUTER_BAD_REQUEST',
        message: `OpenRouter 모델 또는 요청 설정 오류입니다. (${detail})`,
      };
    }
    return {
      status: statusMatch && statusMatch >= 400 ? statusMatch : 502,
      code: 'OPENROUTER_ERROR',
      message: `OpenRouter(Claude) 호출 중 오류가 발생했습니다. (${detail})`,
    };
  }

  if (
    statusMatch === 403 ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API_KEY_INVALID') ||
    rawMessage.includes('API key not valid')
  ) {
    return {
      status: 403,
      code: 'API_KEY_INVALID',
      message:
        'AI API 인증에 실패했습니다. Settings > Secrets 패널에서 유효한 API 키가 설정되어 있는지 확인해 주세요.',
    };
  }

  if (statusMatch === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    const fallbackTip = hasOpenRouterKey
      ? ''
      : ' (Settings > Secrets에 OPENROUTER_API_KEY를 설정하면 한도 초과 시 OpenRouter Claude로 자동 전환됩니다.)';
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: `현재 Gemini API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.${fallbackTip}`,
    };
  }

  if (statusMatch === 400 || rawMessage.includes('INVALID_ARGUMENT')) {
    return {
      status: 400,
      code: 'INVALID_PDF',
      message:
        'PDF 파일을 처리할 수 없습니다. 암호가 걸려 있거나 손상된 PDF, 또는 지원 용량을 초과한 파일인지 확인해 주세요.',
    };
  }

  if (
    statusMatch === 503 ||
    rawMessage.includes('UNAVAILABLE') ||
    rawMessage.includes('overloaded')
  ) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'AI 모델 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  return {
    status: 500,
    code: 'GENERATION_FAILED',
    message: `대본 생성 중 오류가 발생했습니다. (${rawMessage.slice(0, 200)})`,
  };
}

async function generateWithGemini(
  pdfBase64: string,
  mode: ConversionMode,
  fileName?: string,
  pageRange?: PageRangeInfo
): Promise<{ script: string; model: string }> {
  const ai = getGeminiClient();
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
              text: buildUserPrompt(mode, fileName, pageRange),
            },
          ],
        },
        config: {
          systemInstruction: buildSystemInstruction(mode),
        },
      });

      const text = response.text;
      if (!text || !text.trim()) {
        throw new Error(
          '모델이 빈 응답을 반환했습니다. 텍스트가 포함된 정상적인 PDF인지 확인해 주세요.'
        );
      }

      return { script: sanitizeScriptOutput(text), model: 'gemini-2.5-flash' };
    } catch (error) {
      lastError = error;
      const errText = error instanceof Error ? error.message : String(error);
      const isTransient =
        errText.includes('503') ||
        errText.includes('UNAVAILABLE') ||
        errText.includes('fetch failed') ||
        errText.includes('ECONNRESET');

      if (attempt < maxAttempts && isTransient) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

async function generateWithOpenRouter(
  pdfBase64: string,
  mode: ConversionMode,
  fileName?: string,
  pageRange?: PageRangeInfo
): Promise<{ script: string; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY_MISSING');
  }

  const model = DEFAULT_OPENROUTER_MODEL;
  const referer =
    process.env.APP_URL?.trim() || 'https://github.com/DanielYoon56/PDF2Audio';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer,
      'X-Title': 'PDF2Audio',
    },
    body: JSON.stringify({
      model,
      max_tokens: mode === 'ko-summary' ? 8192 : 16000,
      messages: [
        {
          role: 'system',
          content: buildSystemInstruction(mode),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildUserPrompt(mode, fileName, pageRange),
            },
            {
              type: 'file',
              file: {
                filename: fileName || 'document.pdf',
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
          ],
        },
      ],
      plugins: [
        {
          id: 'file-parser',
          pdf: {
            engine: 'native',
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as {
        error?: { message?: string };
      };
      if (errJson?.error?.message) {
        detail = errJson.error.message;
      }
    } catch {
      // Ignore parse errors
    }
    const err = new Error(`OpenRouter 오류: ${detail}`) as Error & {
      status?: number;
    };
    err.status = response.status;
    throw err;
  }

  const payload = (await response.json()) as {
    model?: string;
    choices?: Array<{
      message?: {
        content?:
          | string
          | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  let rawText = '';
  if (typeof content === 'string') {
    rawText = content;
  } else if (Array.isArray(content)) {
    rawText = content
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('\n');
  }

  if (!rawText.trim()) {
    throw new Error(
      'OpenRouter(Claude) 모델이 빈 응답을 반환했습니다. PDF 파일 상태를 확인해 주세요.'
    );
  }

  return {
    script: sanitizeScriptOutput(rawText),
    model: payload.model || model,
  };
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      providers: {
        gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
        openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
        openrouterModel: DEFAULT_OPENROUTER_MODEL,
      },
    });
  });

  app.post('/api/generate-script', async (req: Request, res: Response) => {
    const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());

    try {
      const body = (req.body ?? {}) as GenerateScriptBody;
      const pdfBase64 =
        typeof body.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
      const fileName =
        typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : undefined;
      const mode: ConversionMode =
        body.mode === 'original-clean'
          ? 'original-clean'
          : body.mode === 'ko-summary'
          ? 'ko-summary'
          : 'ko-translate';
      const providerPref: LlmProviderPreference =
        body.provider === 'gemini'
          ? 'gemini'
          : body.provider === 'openrouter'
          ? 'openrouter'
          : 'auto';

      let pageRange: PageRangeInfo | undefined;
      if (
        body.pageRange &&
        typeof body.pageRange === 'object' &&
        body.pageRange !== null
      ) {
        const rawRange = body.pageRange as Record<string, unknown>;
        const startPage = Number(rawRange.startPage);
        const endPage = Number(rawRange.endPage);
        const totalPages = Number(rawRange.totalPages);
        if (
          Number.isFinite(startPage) &&
          Number.isFinite(endPage) &&
          Number.isFinite(totalPages) &&
          startPage >= 1 &&
          endPage >= startPage &&
          totalPages >= endPage
        ) {
          pageRange = { startPage, endPage, totalPages };
        }
      }

      if (!pdfBase64) {
        res.status(400).json({
          code: 'MISSING_PDF',
          error:
            '변환할 PDF 데이터가 전달되지 않았습니다. PDF 파일을 다시 선택해 주세요.',
        });
        return;
      }

      if (pdfBase64.length > 42_000_000) {
        res.status(413).json({
          code: 'FILE_TOO_LARGE',
          error:
            'PDF 용량이 너무 큽니다. 데모 환경에서는 25MB 이하의 PDF 파일을 업로드해 주세요.',
        });
        return;
      }

      let generated: { script: string; model: string };
      let providerUsed: 'gemini' | 'openrouter' = 'gemini';
      let fallbackUsed = false;
      let fallbackReason: string | undefined;

      if (providerPref === 'openrouter') {
        generated = await generateWithOpenRouter(
          pdfBase64,
          mode,
          fileName,
          pageRange
        );
        providerUsed = 'openrouter';
      } else if (providerPref === 'gemini') {
        generated = await generateWithGemini(
          pdfBase64,
          mode,
          fileName,
          pageRange
        );
        providerUsed = 'gemini';
      } else {
        // Auto mode: Gemini primary -> automatic fallback to OpenRouter Claude when Gemini lacks capacity/quota
        try {
          generated = await generateWithGemini(
            pdfBase64,
            mode,
            fileName,
            pageRange
          );
          providerUsed = 'gemini';
        } catch (geminiError) {
          if (hasOpenRouterKey && shouldFallbackToOpenRouter(geminiError)) {
            console.warn(
              'Gemini unavailable or rate-limited; falling back to OpenRouter (Claude).'
            );
            generated = await generateWithOpenRouter(
              pdfBase64,
              mode,
              fileName,
              pageRange
            );
            providerUsed = 'openrouter';
            fallbackUsed = true;
            fallbackReason =
              'Gemini 요청 한도 또는 일시적 혼잡으로 OpenRouter(Claude)로 자동 전환되어 대본을 생성했습니다.';
          } else {
            throw geminiError;
          }
        }
      }

      const paragraphs = generated.script
        .split(/\n{2,}|\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const detectedLanguage = detectScriptLanguage(generated.script, mode);
      const category = inferDocumentCategory(generated.script, fileName);

      res.json({
        script: paragraphs.join('\n\n'),
        paragraphs,
        detectedLanguage,
        category,
        model: generated.model,
        providerUsed,
        fallbackUsed,
        fallbackReason,
      });
    } catch (error) {
      const parsed = parseApiError(error, hasOpenRouterKey);
      res.status(parsed.status).json({
        code: parsed.code,
        error: parsed.message,
      });
    }
  });

  app.use(
    (err: unknown, _req: Request, res: Response, next: express.NextFunction) => {
      if (
        typeof err === 'object' &&
        err !== null &&
        'type' in err &&
        (err as { type?: string }).type === 'entity.too.large'
      ) {
        res.status(413).json({
          code: 'FILE_TOO_LARGE',
          error:
            '업로드한 PDF 파일 용량이 허용 한도를 초과했습니다. 25MB 이하의 PDF 파일을 사용해 주세요.',
        });
        return;
      }
      next(err);
    }
  );

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
    console.log(`PDF2Audio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
