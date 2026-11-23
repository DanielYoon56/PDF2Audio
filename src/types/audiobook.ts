export type ConversionMode = 'ko-translate' | 'original-clean';

export type PlaybackRate = 0.8 | 1.0 | 1.2 | 1.5;

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export type DetectedLanguage = 'ko-KR' | 'en-US';

export interface GeneratedScriptResult {
  script: string;
  paragraphs: string[];
  detectedLanguage: DetectedLanguage;
  fileName: string;
  mode: ConversionMode;
  generatedAt: string;
}

export interface WaitlistFormValues {
  email: string;
  expectedFeatures: string[];
  pricingTier: string;
  comment: string;
}

export interface WaitlistEntry extends WaitlistFormValues {
  id: string;
  submittedAt: string;
}

export const EXPECTED_FEATURE_OPTIONS: readonly string[] = [
  '자연스러운 고품질 AI 성우 음성 (MP3 다운로드)',
  '애플 팟캐스트 / 스포티파이 자동 연동 (프라이빗 RSS)',
  '50페이지 이상 대용량 논문/책 일괄 변환',
  '원문 + 한국어 번역 싱크 대본 뷰어',
] as const;

export const PRICING_TIER_OPTIONS: readonly string[] = [
  '월 9,900원 (논문 5편 내외)',
  '월 12,900원 (논문 10편 내외)',
  '월 29,900원 (논문 20편 + 팟캐스트 RSS 무제한)',
  '무료 버전만 사용 예정',
] as const;
