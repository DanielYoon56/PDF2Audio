import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';

dotenv.config({ path: '.env.local' });
dotenv.config();
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

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
  stream?: unknown;
}

interface GenerateAudioBody {
  text?: unknown;
  language?: unknown;
  stream?: unknown;
}

interface RegenerateParagraphBody {
  paragraph?: unknown;
  paragraphIndex?: unknown;
  previousParagraph?: unknown;
  nextParagraph?: unknown;
  mode?: unknown;
  language?: unknown;
  provider?: unknown;
  fileName?: unknown;
  pdfBase64?: unknown;
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

interface AudiobookJsonPayload {
  title?: string;
  language?: string;
  category?: string;
  paragraphs: string[];
  isComplete: boolean;
}

interface ContinuationJsonPayload {
  completedLastParagraph?: string;
  remainingParagraphs: string[];
  isComplete: boolean;
}

interface VerifiedGenerationResult {
  script: string;
  paragraphs: string[];
  detectedLanguage: 'ko-KR' | 'en-US';
  category: string;
  model: string;
  integrityVerified: boolean;
}

const VALID_CATEGORIES = [
  'AI · 머신러닝',
  '컴퓨터공학 · SW',
  '의학 · 바이오',
  '경제 · 비즈니스',
  '자연과학 · 공학',
  '인문 · 사회과학',
  '일반 논문 · 리포트',
] as const;

const GEMINI_AUDIOBOOK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: '문서의 핵심 제목',
    },
    language: {
      type: Type.STRING,
      description: '낭독 대본의 언어 코드 ("ko-KR" 또는 "en-US")',
    },
    category: {
      type: Type.STRING,
      description:
        '문서 분야 ("AI · 머신러닝", "컴퓨터공학 · SW", "의학 · 바이오", "경제 · 비즈니스", "자연과학 · 공학", "인문 · 사회과학", "일반 논문 · 리포트" 중 하나)',
    },
    paragraphs: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '문장이 도중에 끊기지 않는 완전한 낭독용 문단 문자열 배열. 각 문단은 2~4개의 완전한 문장으로 구성하며 반드시 마침표 등 종결 부호로 끝냅니다.',
    },
    isComplete: {
      type: Type.BOOLEAN,
      description:
        '문서의 마지막 결론 문장까지 끊김 없이 완전히 작성했으면 true, 도중에 끊겼으면 false',
    },
  },
  required: ['title', 'language', 'category', 'paragraphs', 'isComplete'],
};

const GEMINI_CONTINUATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    completedLastParagraph: {
      type: Type.STRING,
      description:
        '직전에 도중에 끊긴 마지막 문단 전체를 자연스럽게 이어서 완성한 완전한 단일 문단 문자열 (이전 문단이 이미 완성되어 있다면 빈 문자열 "")',
    },
    remainingParagraphs: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        '그 이후 문서 끝까지 이어지는 나머지 완전한 낭독용 문단 배열 (각 요소는 반드시 완전한 문장으로 종결)',
    },
    isComplete: {
      type: Type.BOOLEAN,
      description: '문서 끝까지 빠짐없이 마무리되었으면 true',
    },
  },
  required: ['completedLastParagraph', 'remainingParagraphs', 'isComplete'],
};

const OPENROUTER_AUDIOBOOK_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'audiobook_script',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        language: { type: 'string', enum: ['ko-KR', 'en-US'] },
        category: { type: 'string' },
        paragraphs: {
          type: 'array',
          items: { type: 'string' },
        },
        isComplete: { type: 'boolean' },
      },
      required: ['title', 'language', 'category', 'paragraphs', 'isComplete'],
    },
  },
};

const OPENROUTER_CONTINUATION_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'audiobook_continuation',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        completedLastParagraph: { type: 'string' },
        remainingParagraphs: {
          type: 'array',
          items: { type: 'string' },
        },
        isComplete: { type: 'boolean' },
      },
      required: ['completedLastParagraph', 'remainingParagraphs', 'isComplete'],
    },
  },
};

const GEMINI_PARAGRAPH_REPAIR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    repairedParagraph: {
      type: Type.STRING,
      description:
        '중간에 끊기거나 마침표 없이 비정상 종결된 단일 문단을 문맥에 맞게 완전한 종결 부호(마침표 등)로 끝나는 하나의 자연스러운 낭독 문단으로 재작성한 문자열',
    },
  },
  required: ['repairedParagraph'],
};

const OPENROUTER_PARAGRAPH_REPAIR_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'repaired_paragraph',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        repairedParagraph: { type: 'string' },
      },
      required: ['repairedParagraph'],
    },
  },
};

function buildSystemInstruction(mode: ConversionMode): string {
  const sharedCleanupRules = [
    '2단 편집이나 복잡한 레이아웃이 있는 PDF라도 사람이 읽는 정확한 순서대로 문맥을 이어서 변환하세요.',
    '머리글(Header), 바닥글(Footer), 페이지 번호, [1], [2, 3] 또는 (Smith et al., 2020) 같은 본문 내 인용 표기, URL/DOI 링크, 그리고 문서 끝의 참고문헌(References / Bibliography) 섹션은 완전히 제거하세요.',
    '수식, 기호(%, ≥, ≤, α, β, ±, ×, ≈ 등), 약어 및 표의 수치는 귀로 들었을 때 자연스럽게 이해할 수 있는 일상적인 말로 풀어서 작성하세요.',
    '반드시 지정된 JSON 스키마({"title", "language", "category", "paragraphs", "isComplete"}) 형식의 순수 JSON 객체 하나만 반환하세요. JSON 바깥에 설명, 인사말, 마크다운 코드블록(```)을 절대 출력하지 마세요.',
    '[문단 무결성 필수 규칙] paragraphs 배열의 각 요소는 듣기 편한 2~4문장 길이의 완전한 낭독 문단이어야 합니다. 절대로 하나의 문장을 두 배열 요소로 쪼개지 말고, 모든 문단은 반드시 마침표(.), 물음표(?), 느낌표(!) 같은 완전한 종결 부호로 끝내세요.',
    '[끊김 방지 필수 규칙] 각 문단 문자열 안에 마크다운 기호(*, **, #, -, _, `), 글머리 기호, 줄바꿈(\\n)을 넣지 마세요. 문서의 처음부터 마지막 결론 문장까지 단 한 문장도 도중에 잘리지 않도록 완전하게 마무리한 뒤에만 "isComplete": true를 설정하세요.',
  ];

  if (mode === 'ko-summary') {
    return [
      '당신은 긴 학술 논문과 전문 리포트를 논리 구조를 유지한 채 핵심만 명쾌하게 들려주는 오디오북 전문 요약 편집자입니다.',
      '1. 원문의 전체 논리 흐름과 구조(연구 배경 및 문제 제기 → 핵심 아이디어 및 방법론 → 주요 실험 조건 및 핵심 수치 결과 → 결론 및 시사점)를 충실히 유지하되, 전체 분량을 원문 대비 약 30% 내외로 압축하여 핵심 요약 낭독 대본을 작성하세요.',
      '2. 단순 개요에 그치지 말고 논문의 핵심 주장, 차별화된 기법, 중요한 실험 수치와 비교 결과를 반드시 포함하세요.',
      '3. 원문이 영어 등 외국어이더라도 자연스러운 한국어로 번역하며, 딱딱한 번역투를 피하고 청취자에게 명확히 설명하듯 정중한 한국어 구어체("~합니다", "~습니다", "~입니다")로 작성하세요. language 필드는 "ko-KR"로 설정하세요.',
      ...sharedCleanupRules.map((rule, i) => `${i + 4}. ${rule}`),
    ].join('\n');
  }

  if (mode === 'ko-translate') {
    return [
      '당신은 학술 논문과 전문 리포트를 귀로 듣기 좋은 오디오북 낭독 대본으로 변환하는 전문 편집자입니다.',
      '1. 원문의 내용, 논리 흐름, 세부 설명, 실험 수치, 예시를 절대 요약하거나 임의로 생략하지 말고 문서 전체 본문을 처음부터 끝까지 빠짐없이 변환하세요.',
      '2. 원문이 영어 등 외국어이더라도 전체 본문을 자연스러운 한국어로 번역하세요. 딱딱한 직역이나 번역투를 피하고, 청취자에게 친절하고 전문적으로 설명하듯 정중한 한국어 구어체("~합니다", "~습니다", "~입니다")로 작성하세요. language 필드는 "ko-KR"로 설정하세요.',
      ...sharedCleanupRules.map((rule, i) => `${i + 3}. ${rule}`),
    ].join('\n');
  }

  return [
    '당신은 학술 논문과 전문 리포트를 귀로 듣기 좋은 오디오북 낭독 대본으로 변환하는 전문 편집자입니다.',
    '1. 원문의 내용, 논리 흐름, 세부 설명, 실험 수치, 예시를 절대 요약하거나 임의로 생략하지 말고 문서 전체 본문을 처음부터 끝까지 빠짐없이 변환하세요.',
    '2. 원문의 언어(영어, 한국어 등)를 그대로 유지하면서 귀로 듣기에 매끄럽고 자연스러운 낭독용 문장으로 정제하세요. 원문이 한국어라면 정중한 구어체("~합니다", "~습니다")로 다듬고 language를 "ko-KR"로, 원문이 영어라면 자연스러운 Spoken English 내레이션 문체로 정제하고 language를 "en-US"로 설정하세요.',
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
      splitHint = ` 이 파일은 전체 ${pageRange.totalPages}페이지 중 우선 변환 구간인 1~${pageRange.endPage}페이지입니다. 문서가 분할되었다는 메타 안내나 마무리 인사 없이 해당 구간 본문만 완전한 문장들로 변환하세요.`;
    } else if (pageRange.startPage > 1) {
      splitHint = ` 이 파일은 전체 ${pageRange.totalPages}페이지 중 이어지는 ${pageRange.startPage}~${pageRange.endPage}페이지 구간입니다. 앞선 대본에 자연스럽게 이어지도록 인사말이나 도입 소개 없이 바로 본문 문단 배열을 출력하세요.`;
    }
  }

  if (mode === 'ko-summary') {
    return `첨부된 PDF 문서${safeName}의 논리 구조와 핵심 수치·결론을 유지하면서 전체 분량을 약 30% 내외로 압축한 한국어 핵심 요약 오디오북 낭독 대본을 지정된 JSON 스키마로 작성해 주세요. 모든 문단이 도중에 끊기지 않도록 완전한 종결 문장으로 마무리하세요.${splitHint}`;
  }
  if (mode === 'ko-translate') {
    return `첨부된 PDF 문서${safeName}의 전체 본문을 빠짐없이 한국어로 번역하고, 귀로 듣기 자연스러운 오디오북 낭독 대본을 지정된 JSON 스키마로 작성해 주세요. 모든 문단이 도중에 끊기지 않도록 완전한 종결 문장으로 마무리하세요.${splitHint}`;
  }
  return `첨부된 PDF 문서${safeName}의 전체 본문을 원문 언어 그대로 유지하면서 빠짐없이 귀로 듣기 자연스러운 오디오북 낭독 대본을 지정된 JSON 스키마로 정제해 주세요. 모든 문단이 도중에 끊기지 않도록 완전한 종결 문장으로 마무리하세요.${splitHint}`;
}

function sanitizeParagraphText(rawText: string): string {
  return rawText
    .replace(/\r\n/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s{2,}/g, ' ')
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

function isSentenceComplete(text: string): boolean {
  const trimmed = text.trimEnd();
  if (!trimmed) return false;
  return /[.!?。！？…]["'”’)\]」』》】]*$/.test(trimmed);
}

function stitchFragments(existing: string, addition: string): string {
  const base = existing.replace(/\s+$/, '');
  const next = addition.replace(/^\s+/, '');
  if (!base) return next;
  if (!next) return base;

  const maxCheck = Math.min(160, base.length, next.length);
  for (let len = maxCheck; len >= 8; len -= 1) {
    if (base.slice(base.length - len) === next.slice(0, len)) {
      return base + next.slice(len);
    }
  }

  const needsSpace =
    /[A-Za-z0-9,;:]$/.test(base) && /^[A-Za-z0-9가-힣]/.test(next);
  return needsSpace ? `${base} ${next}` : `${base}${next}`;
}

function extractJsonObjectString(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1);
  }
  return stripped;
}

function salvageTruncatedAudiobookJson(raw: string): {
  paragraphs: string[];
  truncatedTail: string;
  title?: string;
  language?: string;
  category?: string;
} {
  const paragraphs: string[] = [];
  let truncatedTail = '';

  const titleMatch = raw.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const langMatch = raw.match(/"language"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const catMatch = raw.match(/"category"\s*:\s*"((?:\\.|[^"\\])*)"/);

  const decodeJsonStr = (s?: string): string | undefined => {
    if (!s) return undefined;
    try {
      return JSON.parse(`"${s}"`) as string;
    } catch {
      return s;
    }
  };

  const arrKeyIdx = raw.indexOf('"paragraphs"');
  if (arrKeyIdx !== -1) {
    const bracketIdx = raw.indexOf('[', arrKeyIdx);
    if (bracketIdx !== -1) {
      let i = bracketIdx + 1;
      while (i < raw.length) {
        while (i < raw.length && /[\s,]/.test(raw[i])) i += 1;
        if (i >= raw.length || raw[i] === ']') break;
        if (raw[i] !== '"') {
          i += 1;
          continue;
        }

        // Scan JSON string literal
        const start = i;
        i += 1;
        let escaped = false;
        let closed = false;
        while (i < raw.length) {
          const ch = raw[i];
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            closed = true;
            i += 1;
            break;
          }
          i += 1;
        }

        const slice = raw.slice(start, i);
        if (closed) {
          try {
            const val = JSON.parse(slice);
            if (typeof val === 'string' && val.trim()) {
              paragraphs.push(sanitizeParagraphText(val));
            }
          } catch {
            // Skip malformed element
          }
        } else {
          // Unclosed trailing string due to truncation
          const partialRaw = slice.slice(1).replace(/\\$/, '');
          try {
            truncatedTail = sanitizeParagraphText(
              JSON.parse(`"${partialRaw}"`) as string
            );
          } catch {
            truncatedTail = sanitizeParagraphText(partialRaw);
          }
          break;
        }
      }
    }
  }

  return {
    paragraphs,
    truncatedTail,
    title: decodeJsonStr(titleMatch?.[1]),
    language: decodeJsonStr(langMatch?.[1]),
    category: decodeJsonStr(catMatch?.[1]),
  };
}

function parseStructuredAudiobookResponse(raw: string): {
  payload: AudiobookJsonPayload;
  wasValidJson: boolean;
  truncatedTail: string;
} {
  const candidate = extractJsonObjectString(raw);
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.paragraphs)
    ) {
      const cleanedParagraphs = parsed.paragraphs
        .filter((item): item is string => typeof item === 'string')
        .map(sanitizeParagraphText)
        .filter((p) => p.length > 0);

      return {
        payload: {
          title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
          language:
            typeof parsed.language === 'string' ? parsed.language.trim() : undefined,
          category:
            typeof parsed.category === 'string' ? parsed.category.trim() : undefined,
          paragraphs: cleanedParagraphs,
          isComplete: parsed.isComplete === true,
        },
        wasValidJson: true,
        truncatedTail: '',
      };
    }
  } catch {
    // Fall through to JSON salvage
  }

  // Attempt structured salvage from truncated JSON stream
  const salvaged = salvageTruncatedAudiobookJson(raw);
  if (salvaged.paragraphs.length > 0 || salvaged.truncatedTail) {
    const combined = [...salvaged.paragraphs];
    if (salvaged.truncatedTail) {
      combined.push(salvaged.truncatedTail);
    }
    return {
      payload: {
        title: salvaged.title,
        language: salvaged.language,
        category: salvaged.category,
        paragraphs: combined,
        isComplete: false,
      },
      wasValidJson: false,
      truncatedTail: salvaged.truncatedTail,
    };
  }

  // Last-resort plain text fallback (never returns empty if model wrote prose)
  const fallbackParagraphs = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}|\n/)
    .map(sanitizeParagraphText)
    .filter((p) => p.length > 0);

  return {
    payload: {
      paragraphs: fallbackParagraphs,
      isComplete: false,
    },
    wasValidJson: false,
    truncatedTail: '',
  };
}

function parseStructuredContinuationResponse(
  raw: string
): ContinuationJsonPayload {
  const candidate = extractJsonObjectString(raw);
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const completedLast =
        typeof parsed.completedLastParagraph === 'string'
          ? sanitizeParagraphText(parsed.completedLastParagraph)
          : '';
      const remaining = Array.isArray(parsed.remainingParagraphs)
        ? parsed.remainingParagraphs
            .filter((item): item is string => typeof item === 'string')
            .map(sanitizeParagraphText)
            .filter((p) => p.length > 0)
        : [];
      return {
        completedLastParagraph: completedLast,
        remainingParagraphs: remaining,
        isComplete: parsed.isComplete === true,
      };
    }
  } catch {
    // Fall through to salvage
  }

  const salvaged = salvageTruncatedAudiobookJson(
    raw.replace('"remainingParagraphs"', '"paragraphs"')
  );
  const combined = [...salvaged.paragraphs];
  if (salvaged.truncatedTail) combined.push(salvaged.truncatedTail);

  return {
    completedLastParagraph: '',
    remainingParagraphs: combined,
    isComplete: false,
  };
}

function validateAndRepairParagraphBoundaries(paragraphs: string[]): string[] {
  const repaired: string[] = [];
  for (const raw of paragraphs) {
    const cleaned = sanitizeParagraphText(raw);
    if (!cleaned) continue;

    if (
      repaired.length > 0 &&
      !isSentenceComplete(repaired[repaired.length - 1])
    ) {
      // Previous paragraph was split mid-sentence — stitch it cleanly
      repaired[repaired.length - 1] = stitchFragments(
        repaired[repaired.length - 1],
        cleaned
      );
    } else {
      repaired.push(cleaned);
    }
  }
  return repaired;
}

function applyStructuredContinuation(
  existingParagraphs: string[],
  continuation: ContinuationJsonPayload
): string[] {
  const next = [...existingParagraphs];

  if (continuation.completedLastParagraph) {
    if (next.length > 0) {
      const prevLast = next[next.length - 1];
      // If model returned the full rewritten last paragraph starting with our prefix, replace it; otherwise stitch it
      const prefixCheck = prevLast.slice(0, Math.min(24, prevLast.length));
      if (
        prefixCheck.length >= 8 &&
        continuation.completedLastParagraph.startsWith(prefixCheck)
      ) {
        next[next.length - 1] = continuation.completedLastParagraph;
      } else if (!isSentenceComplete(prevLast)) {
        next[next.length - 1] = stitchFragments(
          prevLast,
          continuation.completedLastParagraph
        );
      } else {
        next.push(continuation.completedLastParagraph);
      }
    } else {
      next.push(continuation.completedLastParagraph);
    }
  }

  for (const p of continuation.remainingParagraphs) {
    if (!p) continue;
    // Skip duplicate of last paragraph
    if (next.length > 0 && next[next.length - 1] === p) continue;
    next.push(p);
  }

  return validateAndRepairParagraphBoundaries(next);
}

function buildIntegrityVerifiedResult(
  payload: AudiobookJsonPayload,
  mode: ConversionMode,
  model: string,
  fileName?: string
): VerifiedGenerationResult {
  const paragraphs = validateAndRepairParagraphBoundaries(payload.paragraphs);
  if (paragraphs.length === 0) {
    throw new Error(
      '데이터 무결성 검증 실패: 유효한 낭독 문단을 추출하지 못했습니다. 텍스트가 포함된 PDF인지 확인해 주세요.'
    );
  }

  const script = paragraphs.join('\n\n');
  const detectedLanguage: 'ko-KR' | 'en-US' =
    payload.language === 'ko-KR' || payload.language === 'en-US'
      ? mode === 'ko-translate' || mode === 'ko-summary'
        ? 'ko-KR'
        : payload.language
      : detectScriptLanguage(script, mode);

  const normalizedCategory =
    payload.category &&
    (VALID_CATEGORIES as readonly string[]).includes(payload.category)
      ? payload.category
      : inferDocumentCategory(script, fileName);

  const lastParagraphComplete = isSentenceComplete(
    paragraphs[paragraphs.length - 1]
  );
  const integrityVerified = payload.isComplete && lastParagraphComplete;

  return {
    script,
    paragraphs,
    detectedLanguage,
    category: normalizedCategory,
    model,
    integrityVerified,
  };
}

function buildContinuationPrompt(paragraphs: string[]): string {
  const recentContext = paragraphs.slice(-3);
  const lastParagraph = paragraphs[paragraphs.length - 1] ?? '';
  const lastIsCutOff = !isSentenceComplete(lastParagraph);

  return [
    '직전 JSON 응답이 도중에 끊기거나 마지막 문단이 완전히 마무리되지 않았습니다.',
    '아래 [직전 마지막 문단들] 바로 다음부터 문서 끝까지 중복 없이 이어서 JSON 형식으로 완성해 주세요.',
    `[직전 마지막 문단들]\n${recentContext.map((p, i) => `(${i + 1}) ${p}`).join('\n')}`,
    lastIsCutOff
      ? '마지막 문단이 도중에 끊겨 있습니다. "completedLastParagraph"에 끊긴 마지막 문단 전체를 자연스럽게 끝까지 완성해 넣고, 그 뒤 이어지는 나머지 문단들을 "remainingParagraphs" 배열에 넣은 뒤 문서가 완전히 끝나면 "isComplete": true로 설정하세요.'
      : '직전 마지막 문단은 완성되어 있으므로 "completedLastParagraph"는 빈 문자열("")로 두고, 그 다음 내용부터 끝까지 "remainingParagraphs" 배열에 담아 "isComplete": true로 마무리하세요.',
    '반드시 지정된 JSON 객체만 반환하고, 모든 문단을 완전한 종결 부호로 끝내세요.',
  ].join('\n\n');
}

async function generateWithGemini(
  pdfBase64: string,
  mode: ConversionMode,
  fileName?: string,
  pageRange?: PageRangeInfo,
  onProgress?: (chars: number) => void,
  onStatus?: (message: string) => void
): Promise<VerifiedGenerationResult> {
  const ai = getGeminiClient();
  const maxAttempts = 2;
  const maxContinuations = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const pdfPart = {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64,
        },
      };
      const initialPrompt = buildUserPrompt(mode, fileName, pageRange);

      const streamJsonTurn = async (
        contents: unknown,
        responseSchema: Record<string, unknown>,
        baseChars: number
      ) => {
        const streamResponse = await ai.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents: contents as Parameters<
            typeof ai.models.generateContentStream
          >[0]['contents'],
          config: {
            systemInstruction: buildSystemInstruction(mode),
            responseMimeType: 'application/json',
            responseSchema,
          },
        });

        let turnText = '';
        let turnFinishReason: string | undefined;
        for await (const chunk of streamResponse) {
          const piece = chunk.text ?? '';
          if (piece) {
            turnText += piece;
            onProgress?.(baseChars + turnText.length);
          }
          const candidateFinish = chunk.candidates?.[0]?.finishReason;
          if (candidateFinish) {
            turnFinishReason = String(candidateFinish);
          }
        }
        return { turnText, turnFinishReason };
      };

      const first = await streamJsonTurn(
        { parts: [pdfPart, { text: initialPrompt }] },
        GEMINI_AUDIOBOOK_SCHEMA,
        0
      );

      if (!first.turnText.trim()) {
        throw new Error(
          '모델이 빈 응답을 반환했습니다. 텍스트가 포함된 정상적인 PDF인지 확인해 주세요.'
        );
      }

      const parsedFirst = parseStructuredAudiobookResponse(first.turnText);
      const state: AudiobookJsonPayload = {
        ...parsedFirst.payload,
        paragraphs: validateAndRepairParagraphBoundaries(
          parsedFirst.payload.paragraphs
        ),
      };

      let finishReason = first.turnFinishReason;
      let cont = 0;

      while (cont < maxContinuations && state.paragraphs.length > 0) {
        const lastComplete = isSentenceComplete(
          state.paragraphs[state.paragraphs.length - 1]
        );
        const needsRepair =
          !parsedFirst.wasValidJson ||
          !state.isComplete ||
          !lastComplete ||
          finishReason === 'MAX_TOKENS';

        if (!needsRepair) break;

        cont += 1;
        onStatus?.(
          `JSON 데이터 무결성 검증: 미완성 문단을 감지해 끝까지 이어서 완성 중입니다... (${cont}/${maxContinuations})`
        );

        const contTurn = await streamJsonTurn(
          {
            parts: [pdfPart, { text: buildContinuationPrompt(state.paragraphs) }],
          },
          GEMINI_CONTINUATION_SCHEMA,
          state.paragraphs.join('\n\n').length
        );

        if (!contTurn.turnText.trim()) break;
        const parsedCont = parseStructuredContinuationResponse(contTurn.turnText);
        state.paragraphs = applyStructuredContinuation(
          state.paragraphs,
          parsedCont
        );
        state.isComplete = parsedCont.isComplete;
        finishReason = contTurn.turnFinishReason;
        onProgress?.(state.paragraphs.join('\n\n').length);

        if (
          state.isComplete &&
          isSentenceComplete(state.paragraphs[state.paragraphs.length - 1])
        ) {
          break;
        }
      }

      return buildIntegrityVerifiedResult(
        state,
        mode,
        'gemini-2.5-flash',
        fileName
      );
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
  pageRange?: PageRangeInfo,
  onProgress?: (chars: number) => void,
  onStatus?: (message: string) => void
): Promise<VerifiedGenerationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY_MISSING');
  }

  const model = DEFAULT_OPENROUTER_MODEL;
  const referer =
    process.env.APP_URL?.trim() || 'https://github.com/DanielYoon56/PDF2Audio';
  const systemPrompt = buildSystemInstruction(mode);
  const pdfFileBlock = {
    type: 'file',
    file: {
      filename: fileName || 'document.pdf',
      file_data: `data:application/pdf;base64,${pdfBase64}`,
    },
  };

  const runOpenRouterJsonTurn = async (
    messages: Array<{ role: string; content: unknown }>,
    responseFormat: Record<string, unknown>,
    preferredMaxTokens: number,
    baseCharCount: number
  ): Promise<{
    text: string;
    resolvedModel: string;
    finishReason?: string;
  }> => {
    const requestOpenRouter = async (
      maxTokens: number,
      fmt: Record<string, unknown> | undefined
    ) =>
      fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'PDF2Audio',
        },
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: maxTokens,
          ...(fmt ? { response_format: fmt } : {}),
          messages,
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

    let maxTokens = preferredMaxTokens;
    let activeFormat: Record<string, unknown> | undefined = responseFormat;
    let response = await requestOpenRouter(maxTokens, activeFormat);

    // If provider route rejects strict json_schema (or json_object), cascade cleanly down:
    // json_schema -> json_object -> prompt-enforced JSON (parsed & verified strictly on server)
    const fallbackFormats: Array<Record<string, unknown> | undefined> = [
      { type: 'json_object' },
      undefined,
    ];
    for (const nextFormat of fallbackFormats) {
      if (response.status !== 400 || activeFormat === undefined) break;
      let detail = '';
      try {
        const errJson = (await response.json()) as {
          error?: { message?: string };
        };
        detail = errJson?.error?.message ?? '';
      } catch {
        // Ignore parse errors
      }
      if (
        /response_format|json_schema|json_object|structured/i.test(detail)
      ) {
        activeFormat = nextFormat;
        response = await requestOpenRouter(maxTokens, activeFormat);
      } else {
        const err = new Error(
          `OpenRouter 오류: ${detail || 'HTTP 400'}`
        ) as Error & { status?: number };
        err.status = 400;
        throw err;
      }
    }

    // If OpenRouter returns 402 because max_tokens reservation exceeds remaining credits, retry with affordable limit
    if (response.status === 402) {
      let detail = `HTTP 402`;
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

      const affordMatch = detail.match(/can only afford\s+(\d+)/i);
      const affordable = affordMatch ? Number(affordMatch[1]) : 0;
      if (affordable >= 1024 && affordable < maxTokens) {
        maxTokens = Math.max(1024, Math.floor(affordable * 0.9));
        response = await requestOpenRouter(maxTokens, activeFormat);
      } else {
        const err = new Error(`OpenRouter 오류: ${detail}`) as Error & {
          status?: number;
        };
        err.status = 402;
        throw err;
      }
    }

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

    if (!response.body) {
      throw new Error(
        'OpenRouter 오류: 스트림 응답 본문을 읽을 수 없습니다.'
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let turnText = '';
    let resolvedModel = model;
    let finishReason: string | undefined;

    const processSseLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) return;
      if (!trimmed.startsWith('data:')) return;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') return;

      let parsed: {
        model?: string;
        error?: { message?: string; code?: number | string };
        choices?: Array<{
          finish_reason?: string | null;
          native_finish_reason?: string | null;
          delta?: { content?: string | Array<{ type?: string; text?: string }> };
          message?: { content?: string | Array<{ type?: string; text?: string }> };
        }>;
      };
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        return;
      }

      if (parsed.error?.message) {
        const err = new Error(`OpenRouter 오류: ${parsed.error.message}`) as Error & {
          status?: number;
        };
        const codeNum = Number(parsed.error.code);
        if (Number.isFinite(codeNum) && codeNum >= 400) {
          err.status = codeNum;
        }
        throw err;
      }

      if (parsed.model) {
        resolvedModel = parsed.model;
      }

      const choice = parsed.choices?.[0];
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      } else if (choice?.native_finish_reason) {
        finishReason = choice.native_finish_reason;
      }

      const deltaContent =
        choice?.delta?.content ?? choice?.message?.content;

      if (typeof deltaContent === 'string' && deltaContent.length > 0) {
        turnText += deltaContent;
        onProgress?.(baseCharCount + turnText.length);
      } else if (Array.isArray(deltaContent)) {
        const piece = deltaContent
          .map((part) => (typeof part.text === 'string' ? part.text : ''))
          .join('');
        if (piece) {
          turnText += piece;
          onProgress?.(baseCharCount + turnText.length);
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        processSseLine(line);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        processSseLine(line);
      }
    }

    return {
      text: turnText,
      resolvedModel,
      finishReason,
    };
  };

  const preferredMaxTokens = mode === 'ko-summary' ? 14000 : 24000;
  const firstTurn = await runOpenRouterJsonTurn(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildUserPrompt(mode, fileName, pageRange),
          },
          pdfFileBlock,
        ],
      },
    ],
    OPENROUTER_AUDIOBOOK_RESPONSE_FORMAT,
    preferredMaxTokens,
    0
  );

  if (!firstTurn.text.trim()) {
    throw new Error(
      'OpenRouter(Claude) 모델이 빈 응답을 반환했습니다. PDF 파일 상태를 확인해 주세요.'
    );
  }

  const parsedFirst = parseStructuredAudiobookResponse(firstTurn.text);
  const state: AudiobookJsonPayload = {
    ...parsedFirst.payload,
    paragraphs: validateAndRepairParagraphBoundaries(
      parsedFirst.payload.paragraphs
    ),
  };

  let resolvedModel = firstTurn.resolvedModel;
  let finishReason = firstTurn.finishReason;

  // Server-side integrity verification & automatic structured continuation if JSON or last paragraph is incomplete
  const maxContinuations = 2;
  let cont = 0;

  while (cont < maxContinuations && state.paragraphs.length > 0) {
    const lastComplete = isSentenceComplete(
      state.paragraphs[state.paragraphs.length - 1]
    );
    const needsRepair =
      !parsedFirst.wasValidJson ||
      !state.isComplete ||
      !lastComplete ||
      finishReason === 'length' ||
      finishReason === 'max_tokens';

    if (!needsRepair) break;

    cont += 1;
    onStatus?.(
      `JSON 데이터 무결성 검증: 미완성 문단을 감지해 끝까지 이어서 완성 중입니다... (${cont}/${maxContinuations})`
    );

    try {
      const contTurn = await runOpenRouterJsonTurn(
        [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildContinuationPrompt(state.paragraphs),
              },
              pdfFileBlock,
            ],
          },
        ],
        OPENROUTER_CONTINUATION_RESPONSE_FORMAT,
        Math.min(preferredMaxTokens, 12000),
        state.paragraphs.join('\n\n').length
      );

      if (!contTurn.text.trim()) break;
      const parsedCont = parseStructuredContinuationResponse(contTurn.text);
      state.paragraphs = applyStructuredContinuation(
        state.paragraphs,
        parsedCont
      );
      state.isComplete = parsedCont.isComplete;
      resolvedModel = contTurn.resolvedModel;
      finishReason = contTurn.finishReason;
      onProgress?.(state.paragraphs.join('\n\n').length);

      if (
        state.isComplete &&
        isSentenceComplete(state.paragraphs[state.paragraphs.length - 1])
      ) {
        break;
      }
    } catch (contError) {
      console.warn(
        'OpenRouter structured continuation skipped due to error:',
        contError instanceof Error ? contError.message : contError
      );
      break;
    }
  }

  return buildIntegrityVerifiedResult(state, mode, resolvedModel, fileName);
}

function buildParagraphRepairPrompts(params: {
  paragraph: string;
  previousParagraph?: string;
  nextParagraph?: string;
  mode: ConversionMode;
  language: 'ko-KR' | 'en-US';
  fileName?: string;
  hasPdf: boolean;
}): { system: string; user: string } {
  const isKorean =
    params.language === 'ko-KR' ||
    params.mode === 'ko-translate' ||
    params.mode === 'ko-summary';

  const system = [
    '당신은 오디오북 낭독 대본의 미완성 문단을 매끄럽고 정확하게 복구하는 전문 편집자입니다.',
    '1. 제공된 [불완전한 문단]은 문장이 도중에 잘렸거나 마침표 없이 비정상적으로 끝난 상태입니다.',
    isKorean
      ? '2. 앞뒤 문맥과 원문 PDF(제공된 경우)를 바탕으로, 해당 문단의 원래 내용을 자연스럽게 이어서 반드시 완전한 한국어 구어체("~합니다", "~습니다", "~입니다")와 마침표(.)로 종결되는 단일 문단으로 완성하세요.'
      : '2. Using the surrounding context and attached PDF (if provided), complete this cut-off paragraph into a single natural, complete spoken-English paragraph ending with proper terminal punctuation (period, question mark, or exclamation mark).',
    '3. 앞 문단이나 다음 문단의 내용을 중복해서 반복하지 말고, 오직 해당 문단 하나만 완성하세요.',
    '4. 마크다운 기호(*, **, #, -, `), 번호 매기기, 줄바꿈(\\n)을 절대 포함하지 마세요.',
    '5. 반드시 {"repairedParagraph": "..."} 형식의 순수 JSON 객체만 반환하세요.',
  ].join('\n');

  const contextLines: string[] = [];
  if (params.fileName) {
    contextLines.push(`[문서 파일명] ${params.fileName}`);
  }
  if (params.hasPdf) {
    contextLines.push(
      '[참고] 첨부된 원문 PDF에서 해당 문단이 다루는 정확한 사실을 확인해 누락된 뒷부분을 충실하게 완성하세요.'
    );
  }
  if (params.previousParagraph) {
    contextLines.push(`[바로 앞 문단]\n${params.previousParagraph}`);
  }
  contextLines.push(`[복구할 불완전한 문단]\n${params.paragraph}`);
  if (params.nextParagraph) {
    contextLines.push(`[바로 다음 문단]\n${params.nextParagraph}`);
  }
  contextLines.push(
    '위 [복구할 불완전한 문단] 전체를 문맥에 맞게 매끄럽게 완성하여 JSON의 repairedParagraph 필드로 반환하세요. 반드시 마침표 등 종결 부호로 끝내야 합니다.'
  );

  return { system, user: contextLines.join('\n\n') };
}

function parseRepairedParagraphJson(raw: string): string {
  const candidate = extractJsonObjectString(raw);
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (parsed && typeof parsed.repairedParagraph === 'string') {
      return sanitizeParagraphText(parsed.repairedParagraph);
    }
  } catch {
    // Try regex extraction from partial JSON
    const match = raw.match(/"repairedParagraph"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (match) {
      try {
        return sanitizeParagraphText(JSON.parse(`"${match[1]}"`) as string);
      } catch {
        return sanitizeParagraphText(match[1]);
      }
    }
  }
  return sanitizeParagraphText(raw);
}

async function regenerateParagraphWithGemini(params: {
  paragraph: string;
  previousParagraph?: string;
  nextParagraph?: string;
  mode: ConversionMode;
  language: 'ko-KR' | 'en-US';
  fileName?: string;
  pdfBase64?: string;
}): Promise<{ repairedParagraph: string; model: string }> {
  const ai = getGeminiClient();
  const { system, user } = buildParagraphRepairPrompts({
    ...params,
    hasPdf: Boolean(params.pdfBase64),
  });

  const parts: Array<Record<string, unknown>> = [];
  if (params.pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: params.pdfBase64,
      },
    });
  }
  parts.push({ text: user });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts } as Parameters<
      typeof ai.models.generateContent
    >[0]['contents'],
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_PARAGRAPH_REPAIR_SCHEMA,
    },
  });

  const rawText = response.text ?? '';
  const repaired = parseRepairedParagraphJson(rawText);
  if (!repaired) {
    throw new Error('Gemini가 빈 문단 복구 결과를 반환했습니다.');
  }

  return {
    repairedParagraph: isSentenceComplete(repaired) ? repaired : `${repaired}.`,
    model: 'gemini-2.5-flash',
  };
}

async function regenerateParagraphWithOpenRouter(params: {
  paragraph: string;
  previousParagraph?: string;
  nextParagraph?: string;
  mode: ConversionMode;
  language: 'ko-KR' | 'en-US';
  fileName?: string;
  pdfBase64?: string;
}): Promise<{ repairedParagraph: string; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY_MISSING');
  }

  const model = DEFAULT_OPENROUTER_MODEL;
  const referer =
    process.env.APP_URL?.trim() || 'https://github.com/DanielYoon56/PDF2Audio';
  const { system, user } = buildParagraphRepairPrompts({
    ...params,
    hasPdf: Boolean(params.pdfBase64),
  });

  const userContent: unknown = params.pdfBase64
    ? [
        { type: 'text', text: user },
        {
          type: 'file',
          file: {
            filename: params.fileName || 'document.pdf',
            file_data: `data:application/pdf;base64,${params.pdfBase64}`,
          },
        },
      ]
    : user;

  const requestBody = (fmt: Record<string, unknown> | undefined) => ({
    model,
    stream: false,
    max_tokens: 2048,
    ...(fmt ? { response_format: fmt } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    ...(params.pdfBase64
      ? {
          plugins: [
            {
              id: 'file-parser',
              pdf: { engine: 'native' },
            },
          ],
        }
      : {}),
  });

  const sendReq = (fmt: Record<string, unknown> | undefined) =>
    fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': 'PDF2Audio',
      },
      body: JSON.stringify(requestBody(fmt)),
    });

  let activeFormat: Record<string, unknown> | undefined =
    OPENROUTER_PARAGRAPH_REPAIR_FORMAT;
  let response = await sendReq(activeFormat);

  const fallbacks: Array<Record<string, unknown> | undefined> = [
    { type: 'json_object' },
    undefined,
  ];
  for (const nextFmt of fallbacks) {
    if (response.status !== 400 || activeFormat === undefined) break;
    let detail = '';
    try {
      const errJson = (await response.json()) as {
        error?: { message?: string };
      };
      detail = errJson?.error?.message ?? '';
    } catch {
      // Ignore parse errors
    }
    if (/response_format|json_schema|json_object|structured/i.test(detail)) {
      activeFormat = nextFmt;
      response = await sendReq(activeFormat);
    } else {
      const err = new Error(`OpenRouter 오류: ${detail || 'HTTP 400'}`) as Error & {
        status?: number;
      };
      err.status = 400;
      throw err;
    }
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as {
        error?: { message?: string };
      };
      if (errJson?.error?.message) detail = errJson.error.message;
    } catch {
      // Ignore
    }
    const err = new Error(`OpenRouter 오류: ${detail}`) as Error & {
      status?: number;
    };
    err.status = response.status;
    throw err;
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: Array<{
      message?: { content?: string | Array<{ type?: string; text?: string }> };
    }>;
  };
  const rawContent = data.choices?.[0]?.message?.content;
  const rawText =
    typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
      ? rawContent
          .map((p) => (typeof p.text === 'string' ? p.text : ''))
          .join('')
      : '';

  const repaired = parseRepairedParagraphJson(rawText);
  if (!repaired) {
    throw new Error('OpenRouter(Claude)가 빈 문단 복구 결과를 반환했습니다.');
  }

  return {
    repairedParagraph: isSentenceComplete(repaired) ? repaired : `${repaired}.`,
    model: data.model || model,
  };
}

function splitTextForTts(text: string, maxChunkChars: number): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
  };

  for (const para of paragraphs) {
    if (para.length <= maxChunkChars) {
      const candidate = current ? `${current}\n\n${para}` : para;
      if (candidate.length <= maxChunkChars) {
        current = candidate;
      } else {
        flush();
        current = para;
      }
      continue;
    }

    // Split long paragraph by sentence boundaries
    flush();
    const sentences = para.split(/(?<=[.!?。！？])\s+/);
    for (const sentence of sentences) {
      if (sentence.length <= maxChunkChars) {
        const candidate = current ? `${current} ${sentence}` : sentence;
        if (candidate.length <= maxChunkChars) {
          current = candidate;
        } else {
          flush();
          current = sentence;
        }
      } else {
        flush();
        for (let i = 0; i < sentence.length; i += maxChunkChars) {
          chunks.push(sentence.slice(i, i + maxChunkChars).trim());
        }
      }
    }
    flush();
  }

  flush();
  return chunks;
}

function extractWavPcmData(wav: Buffer): { header: Buffer; pcm: Buffer } {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
    return { header: Buffer.alloc(0), pcm: wav };
  }
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      const dataStart = offset + 8;
      const dataEnd = Math.min(wav.length, dataStart + chunkSize);
      return {
        header: wav.subarray(0, dataStart),
        pcm: wav.subarray(dataStart, dataEnd),
      };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return { header: wav.subarray(0, 44), pcm: wav.subarray(44) };
}

function concatWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0);
  if (buffers.length === 1) return buffers[0];

  const first = extractWavPcmData(buffers[0]);
  if (first.header.length < 44) {
    return Buffer.concat(buffers);
  }

  const pcmParts: Buffer[] = [first.pcm];
  for (let i = 1; i < buffers.length; i += 1) {
    pcmParts.push(extractWavPcmData(buffers[i]).pcm);
  }

  const mergedPcm = Buffer.concat(pcmParts);
  const header = Buffer.from(first.header);
  const dataSizeOffset = header.length - 4;
  header.writeUInt32LE(header.length - 8 + mergedPcm.length, 4);
  header.writeUInt32LE(mergedPcm.length, dataSizeOffset);

  return Buffer.concat([header, mergedPcm]);
}

async function synthesizeChunkWithGeminiTts(
  text: string,
  language: 'ko-KR' | 'en-US'
): Promise<Buffer> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: {
              style:
                language === 'ko-KR'
                  ? 'Clear, calm, natural Korean audiobook narrator'
                  : 'Clear, calm, natural English audiobook narrator',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Gemini TTS returned empty audio');
  }
  return Buffer.from(base64Audio, 'base64');
}

async function synthesizeChunkWithEdgeTts(
  text: string,
  language: 'ko-KR' | 'en-US'
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  const voiceName =
    language === 'ko-KR' ? 'ko-KR-SunHiNeural' : 'en-US-JennyNeural';

  try {
    await tts.setMetadata(
      voiceName,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    );

    const { audioStream } = tts.toStream(text);

    const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        reject(new Error('Edge TTS synthesis timeout'));
      }, 25000);

      audioStream.on('data', (chunk: Buffer | Uint8Array) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      audioStream.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
      audioStream.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    if (audioBuffer.length === 0) {
      throw new Error('Edge TTS returned empty audio');
    }
    return audioBuffer;
  } finally {
    try {
      tts.close();
    } catch {
      // Ignore close errors
    }
  }
}

async function synthesizeChunkWithGoogleTts(
  text: string,
  language: 'ko-KR' | 'en-US'
): Promise<Buffer> {
  const tl = language === 'ko-KR' ? 'ko' : 'en';
  const subChunks = splitTextForTts(text, 175);
  const parts: Buffer[] = [];

  for (const sub of subChunks) {
    const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${tl}&q=${encodeURIComponent(
      sub
    )}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!res.ok) {
      throw new Error(`Fallback TTS HTTP ${res.status}`);
    }
    parts.push(Buffer.from(await res.arrayBuffer()));
  }

  return Buffer.concat(parts);
}

async function generateAudioForScript(
  text: string,
  language: 'ko-KR' | 'en-US',
  onStatus?: (message: string) => void,
  onProgress?: (currentChunk: number, totalChunks: number, provider: string) => void
): Promise<{
  audioBuffer: Buffer;
  mimeType: string;
  extension: string;
  providerUsed: string;
}> {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  // 1) Try Gemini 3.8 Flash Lite TTS first (if GEMINI_API_KEY is configured)
  if (hasGeminiKey) {
    const geminiChunks = splitTextForTts(text, 1100);
    try {
      onStatus?.('Gemini AI 성우 음성(WAV) 합성을 시작합니다...');
      const wavParts: Buffer[] = [];
      for (let i = 0; i < geminiChunks.length; i += 1) {
        onProgress?.(i + 1, geminiChunks.length, 'Gemini AI 성우');
        const wavChunk = await synthesizeChunkWithGeminiTts(
          geminiChunks[i],
          language
        );
        wavParts.push(wavChunk);
      }
      return {
        audioBuffer: concatWavBuffers(wavParts),
        mimeType: 'audio/wav',
        extension: 'wav',
        providerUsed: 'Gemini 3.8 Flash Lite TTS',
      };
    } catch (geminiTtsError) {
      console.warn(
        'Gemini TTS unavailable or rate-limited; falling back to Neural Edge TTS:',
        geminiTtsError instanceof Error ? geminiTtsError.message : geminiTtsError
      );
      onStatus?.(
        'Gemini 음성 한도 초과로 뉴럴 AI 성우(MP3) 엔진으로 자동 전환합니다...'
      );
    }
  }

  // 2) Fallback: Microsoft Neural TTS (Edge TTS, MP3)
  const edgeChunks = splitTextForTts(text, 1600);
  try {
    const mp3Parts: Buffer[] = [];
    for (let i = 0; i < edgeChunks.length; i += 1) {
      onProgress?.(i + 1, edgeChunks.length, 'Neural AI 성우');
      const mp3Chunk = await synthesizeChunkWithEdgeTts(edgeChunks[i], language);
      mp3Parts.push(mp3Chunk);
    }
    return {
      audioBuffer: Buffer.concat(mp3Parts),
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      providerUsed:
        language === 'ko-KR'
          ? 'Neural TTS (SunHi)'
          : 'Neural TTS (Jenny)',
    };
  } catch (edgeError) {
    console.warn(
      'Edge TTS failed; falling back to standard MP3 TTS:',
      edgeError instanceof Error ? edgeError.message : edgeError
    );
    onStatus?.('보조 MP3 음성 합성 엔진으로 전환하여 생성 중입니다...');
  }

  // 3) Ultimate fallback: Standard Google TTS MP3
  const fallbackChunks = splitTextForTts(text, 500);
  const fallbackParts: Buffer[] = [];
  for (let i = 0; i < fallbackChunks.length; i += 1) {
    onProgress?.(i + 1, fallbackChunks.length, '기본 MP3 성우');
    const mp3Chunk = await synthesizeChunkWithGoogleTts(
      fallbackChunks[i],
      language
    );
    fallbackParts.push(mp3Chunk);
  }
  return {
    audioBuffer: Buffer.concat(fallbackParts),
    mimeType: 'audio/mpeg',
    extension: 'mp3',
    providerUsed: 'Standard MP3 TTS',
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
    const body = (req.body ?? {}) as GenerateScriptBody;
    const wantsStream =
      body.stream === true ||
      Boolean(req.headers.accept?.includes('text/event-stream'));

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

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let streamStarted = false;
    let lastProgressSentAt = 0;

    const sendSseEvent = (eventName: string, payload: unknown) => {
      if (!streamStarted || res.writableEnded) return;
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const emitProgress = (chars: number, providerLabel: string) => {
      if (!streamStarted) return;
      const now = Date.now();
      if (now - lastProgressSentAt < 350) return;
      lastProgressSentAt = now;
      sendSseEvent('progress', { chars, provider: providerLabel });
    };

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      streamStarted = true;

      sendSseEvent('status', {
        message:
          providerPref === 'openrouter'
            ? 'OpenRouter(Claude)로 PDF 분석을 시작합니다...'
            : 'PDF 분석 및 낭독 대본 생성을 시작합니다...',
      });

      heartbeatTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 5000);

      res.on('close', () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });
    }

    try {
      let generated: VerifiedGenerationResult;
      let providerUsed: 'gemini' | 'openrouter' = 'gemini';
      let fallbackUsed = false;
      let fallbackReason: string | undefined;

      if (providerPref === 'openrouter') {
        generated = await generateWithOpenRouter(
          pdfBase64,
          mode,
          fileName,
          pageRange,
          (chars) => emitProgress(chars, 'OpenRouter (Claude)'),
          (message) => sendSseEvent('status', { message })
        );
        providerUsed = 'openrouter';
      } else if (providerPref === 'gemini') {
        generated = await generateWithGemini(
          pdfBase64,
          mode,
          fileName,
          pageRange,
          (chars) => emitProgress(chars, 'Gemini 2.5 Flash'),
          (message) => sendSseEvent('status', { message })
        );
        providerUsed = 'gemini';
      } else {
        // Auto mode: Gemini primary -> automatic fallback to OpenRouter Claude when Gemini lacks capacity/quota
        try {
          generated = await generateWithGemini(
            pdfBase64,
            mode,
            fileName,
            pageRange,
            (chars) => emitProgress(chars, 'Gemini 2.5 Flash'),
            (message) => sendSseEvent('status', { message })
          );
          providerUsed = 'gemini';
        } catch (geminiError) {
          if (hasOpenRouterKey && shouldFallbackToOpenRouter(geminiError)) {
            console.warn(
              'Gemini unavailable or rate-limited; falling back to OpenRouter (Claude).'
            );
            sendSseEvent('status', {
              message:
                'Gemini 한도 초과로 OpenRouter(Claude)로 자동 전환해 대본을 생성 중입니다...',
            });
            generated = await generateWithOpenRouter(
              pdfBase64,
              mode,
              fileName,
              pageRange,
              (chars) => emitProgress(chars, 'OpenRouter (Claude)'),
              (message) => sendSseEvent('status', { message })
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

      const finalPayload = {
        script: generated.script,
        paragraphs: generated.paragraphs,
        detectedLanguage: generated.detectedLanguage,
        category: generated.category,
        model: generated.model,
        providerUsed,
        fallbackUsed,
        fallbackReason,
        integrityVerified: generated.integrityVerified,
      };

      if (streamStarted) {
        sendSseEvent('done', finalPayload);
        res.end();
      } else {
        res.json(finalPayload);
      }
    } catch (error) {
      const parsed = parseApiError(error, hasOpenRouterKey);
      if (streamStarted) {
        sendSseEvent('error', {
          code: parsed.code,
          error: parsed.message,
        });
        res.end();
      } else {
        res.status(parsed.status).json({
          code: parsed.code,
          error: parsed.message,
        });
      }
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
  });

  app.post('/api/generate-audio', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as GenerateAudioBody;
    const rawText = typeof body.text === 'string' ? body.text.trim() : '';
    const language: 'ko-KR' | 'en-US' =
      body.language === 'en-US' ? 'en-US' : 'ko-KR';
    const wantsStream =
      body.stream === true ||
      Boolean(req.headers.accept?.includes('text/event-stream'));

    if (!rawText) {
      res.status(400).json({
        code: 'MISSING_TEXT',
        error: '음성으로 변환할 대본 텍스트가 비어 있습니다.',
      });
      return;
    }

    if (rawText.length > 35_000) {
      res.status(413).json({
        code: 'TEXT_TOO_LONG',
        error:
          '음성 파일 변환은 한 번에 최대 35,000자까지 지원합니다. 핵심 요약 모드를 사용하거나 대본을 나누어 저장해 주세요.',
      });
      return;
    }

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let streamStarted = false;

    const sendSseEvent = (eventName: string, payload: unknown) => {
      if (!streamStarted || res.writableEnded) return;
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      streamStarted = true;

      sendSseEvent('status', {
        message: '오디오북 음성 파일 생성을 준비 중입니다...',
      });

      heartbeatTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n');
        }
      }, 5000);

      res.on('close', () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      });
    }

    try {
      const synthesized = await generateAudioForScript(
        rawText,
        language,
        (message) => sendSseEvent('status', { message }),
        (currentChunk, totalChunks, provider) =>
          sendSseEvent('progress', { currentChunk, totalChunks, provider })
      );

      const finalPayload = {
        audioBase64: synthesized.audioBuffer.toString('base64'),
        mimeType: synthesized.mimeType,
        extension: synthesized.extension,
        providerUsed: synthesized.providerUsed,
      };

      if (streamStarted) {
        sendSseEvent('done', finalPayload);
        res.end();
      } else {
        res.json(finalPayload);
      }
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : '음성 파일 생성 중 오류가 발생했습니다.';
      if (streamStarted) {
        sendSseEvent('error', {
          code: 'AUDIO_GENERATION_FAILED',
          error: `음성 파일 생성에 실패했습니다. (${msg.slice(0, 180)})`,
        });
        res.end();
      } else {
        res.status(500).json({
          code: 'AUDIO_GENERATION_FAILED',
          error: `음성 파일 생성에 실패했습니다. (${msg.slice(0, 180)})`,
        });
      }
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
  });

  app.post('/api/regenerate-paragraph', async (req: Request, res: Response) => {
    const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
    const body = (req.body ?? {}) as RegenerateParagraphBody;

    const paragraph =
      typeof body.paragraph === 'string' ? body.paragraph.trim() : '';
    const previousParagraph =
      typeof body.previousParagraph === 'string'
        ? body.previousParagraph.trim().slice(0, 4000)
        : undefined;
    const nextParagraph =
      typeof body.nextParagraph === 'string'
        ? body.nextParagraph.trim().slice(0, 4000)
        : undefined;
    const mode: ConversionMode =
      body.mode === 'original-clean'
        ? 'original-clean'
        : body.mode === 'ko-summary'
        ? 'ko-summary'
        : 'ko-translate';
    const language: 'ko-KR' | 'en-US' =
      body.language === 'en-US' ? 'en-US' : 'ko-KR';
    const providerPref: LlmProviderPreference =
      body.provider === 'gemini'
        ? 'gemini'
        : body.provider === 'openrouter'
        ? 'openrouter'
        : 'auto';
    const fileName =
      typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : undefined;
    const rawPdfBase64 =
      typeof body.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
    // Keep single-paragraph repair fast: attach PDF only when <= ~15MB base64
    const pdfBase64 =
      rawPdfBase64.length > 0 && rawPdfBase64.length <= 20_000_000
        ? rawPdfBase64
        : undefined;

    if (!paragraph) {
      res.status(400).json({
        code: 'MISSING_PARAGRAPH',
        error: '다시 생성할 문단 내용이 전달되지 않았습니다.',
      });
      return;
    }

    const repairParams = {
      paragraph: paragraph.slice(0, 6000),
      previousParagraph,
      nextParagraph,
      mode,
      language,
      fileName,
      pdfBase64,
    };

    try {
      if (providerPref === 'openrouter') {
        const repaired = await regenerateParagraphWithOpenRouter(repairParams);
        res.json({
          repairedParagraph: repaired.repairedParagraph,
          providerUsed: 'openrouter',
          model: repaired.model,
        });
        return;
      }

      try {
        const repaired = await regenerateParagraphWithGemini(repairParams);
        res.json({
          repairedParagraph: repaired.repairedParagraph,
          providerUsed: 'gemini',
          model: repaired.model,
        });
        return;
      } catch (geminiError) {
        if (
          providerPref === 'auto' &&
          hasOpenRouterKey &&
          shouldFallbackToOpenRouter(geminiError)
        ) {
          const repaired = await regenerateParagraphWithOpenRouter(repairParams);
          res.json({
            repairedParagraph: repaired.repairedParagraph,
            providerUsed: 'openrouter',
            model: repaired.model,
            fallbackUsed: true,
          });
          return;
        }
        throw geminiError;
      }
    } catch (error) {
      console.error('Error regenerating paragraph:', error);
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
