import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type {
  ConversionMode,
  LlmProviderPreference,
  PdfFileMetadata,
} from '../types/audiobook';
import { formatFileSize, isPdfFile } from '../utils/fileHelpers';

interface UploadPanelProps {
  selectedFile: File | null;
  fileMetadata: PdfFileMetadata | null;
  isInspectingPdf: boolean;
  mode: ConversionMode;
  provider: LlmProviderPreference;
  isGenerating: boolean;
  fileError: string | null;
  onFileSelect: (file: File | null, validationError?: string | null) => void;
  onModeChange: (mode: ConversionMode) => void;
  onProviderChange: (provider: LlmProviderPreference) => void;
  onGenerate: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const MAX_RECOMMENDED_BYTES = 25 * 1024 * 1024; // 25MB

const SAMPLE_PAPERS = [
  {
    label: 'Attention Is All You Need (15p)',
    href: 'https://arxiv.org/pdf/1706.03762.pdf',
  },
  {
    label: 'ResNet 2단 논문 (12p)',
    href: 'https://arxiv.org/pdf/1512.03385.pdf',
  },
] as const;

const CONVERSION_MODES: {
  id: ConversionMode;
  title: string;
  description: string;
}[] = [
  {
    id: 'ko-translate',
    title: '한국어 번역 + 낭독용 정제',
    description:
      '영문·외국어 논문 전체를 요약 없이 자연스러운 한국어 구어체로 번역합니다.',
  },
  {
    id: 'ko-summary',
    title: '핵심 요약 모드 (약 30% 분량)',
    description:
      '논문의 논리 구조와 핵심 수치를 유지하면서 전체 분량을 30% 내외로 압축합니다.',
  },
  {
    id: 'original-clean',
    title: '원문 그대로 낭독용 정제',
    description:
      '원문 언어를 유지하면서 인용 표기, 각주, 수식 기호만 듣기 편하게 다듬습니다.',
  },
];

const PROVIDER_OPTIONS: {
  id: LlmProviderPreference;
  label: string;
}[] = [
  { id: 'auto', label: '자동 (Gemini→Claude)' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'Claude' },
];

export function UploadPanel({
  selectedFile,
  fileMetadata,
  isInspectingPdf,
  mode,
  provider,
  isGenerating,
  fileError,
  onFileSelect,
  onModeChange,
  onProviderChange,
  onGenerate,
  inputRef,
}: UploadPanelProps) {
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = inputRef ?? internalInputRef;
  const [isDragging, setIsDragging] = useState(false);

  const validateAndSelect = (file: File | undefined) => {
    if (!file) return;

    if (!isPdfFile(file)) {
      onFileSelect(
        null,
        'PDF 파일만 업로드할 수 있습니다. (.pdf 형식의 논문 또는 리포트 파일을 선택해 주세요.)'
      );
      return;
    }

    if (file.size > MAX_RECOMMENDED_BYTES) {
      onFileSelect(
        null,
        `파일 용량이 ${formatFileSize(file.size)}입니다. 데모에서는 25MB 이하의 PDF 파일만 변환할 수 있습니다.`
      );
      return;
    }

    onFileSelect(file, null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    validateAndSelect(file);
    event.target.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    validateAndSelect(droppedFile);
  };

  const triggerFilePicker = () => {
    if (isGenerating) return;
    fileInputRef.current?.click();
  };

  return (
    <section
      aria-label="PDF 업로드 및 변환 설정"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col gap-5 transition-colors duration-300"
    >
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 transition-colors duration-300">
          PDF 오디오북 변환
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed transition-colors duration-300">
          2단 논문이나 리포트 PDF를 올리면 귀로 듣기 좋은 낭독 대본으로 변환합니다.
        </p>
      </div>

      {/* Step 1: PDF Upload */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            01. PDF 문서 선택
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            최대 25MB · PDF
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          className="sr-only"
          aria-label="PDF 파일 업로드"
          disabled={isGenerating}
        />

        {!selectedFile ? (
          <div
            role="button"
            tabIndex={0}
            onClick={triggerFilePicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerFilePicker();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-disabled={isGenerating}
            className={`group rounded-lg border border-dashed px-4 py-7 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:border-slate-400 dark:hover:border-slate-600'
            } ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <div className="mx-auto w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:border-blue-200 dark:group-hover:border-blue-500/40 transition-colors duration-200">
              <Upload className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-200">
              PDF 파일을 이곳에 드래그하거나 클릭하세요
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              원본 PDF 레이아웃을 직접 분석하여 정확하게 읽습니다
            </p>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-lg border p-3.5 transition-colors duration-200 ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 transition-colors duration-300">
                <FileText className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
                  title={selectedFile.name}
                >
                  {selectedFile.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono tabular-nums">
                    {formatFileSize(selectedFile.size)}
                  </span>
                  <span aria-hidden="true">·</span>
                  {isInspectingPdf ? (
                    <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                      페이지 분석 중...
                    </span>
                  ) : fileMetadata?.totalPages ? (
                    <span className="font-mono tabular-nums">
                      총 {fileMetadata.totalPages}페이지
                    </span>
                  ) : (
                    <span>PDF 문서</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onFileSelect(null, null)}
                disabled={isGenerating}
                aria-label="선택한 PDF 제거"
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {fileMetadata?.willAutoSplit && fileMetadata.totalPages && (
              <div className="mt-3 rounded-md border border-blue-200/80 dark:border-blue-800/70 bg-blue-50/80 dark:bg-blue-950/40 px-3 py-2 flex items-start gap-2 text-[11.5px] text-blue-900 dark:text-blue-200 leading-relaxed">
                <Layers
                  className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-semibold">
                    대용량 자동 분할 적용 (첫 {fileMetadata.chunkSize}페이지 우선 변환)
                  </p>
                  <p className="mt-0.5 text-blue-800/90 dark:text-blue-300/90">
                    2MB 이상 · {fileMetadata.totalPages}페이지 문서입니다. 대기 시간을 줄이기 위해 1~{fileMetadata.chunkSize}페이지를 먼저 변환하며, 재생 중에도 나머지 구간을 이어서 변환할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

            {fileMetadata?.isLargeFile &&
              !fileMetadata.willAutoSplit &&
              fileMetadata.totalPages && (
                <div className="mt-3 rounded-md border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 px-3 py-1.5 flex items-center gap-1.5 text-[11.5px] text-slate-600 dark:text-slate-300">
                  <Layers
                    className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    2MB 이상 파일 · {fileMetadata.totalPages}페이지(15p 이내)로 한 번에 빠르게 변환됩니다.
                  </span>
                </div>
              )}

            <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-end">
              <button
                type="button"
                onClick={triggerFilePicker}
                disabled={isGenerating}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-40"
              >
                다른 PDF 선택하기
              </button>
            </div>
          </div>
        )}

        {/* Sample Papers Download Bar */}
        <div className="rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 px-3.5 py-2.5 flex flex-col gap-2 transition-colors duration-300">
          <p className="text-[11.5px] text-slate-600 dark:text-slate-400 leading-snug">
            테스트할 PDF가 없으신가요? 유명 AI 논문을 받아 바로 올려보세요:
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {SAMPLE_PAPERS.map((paper) => (
              <a
                key={paper.href}
                href={paper.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-500/60 hover:text-blue-700 dark:hover:text-blue-300 text-[11.5px] font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                <span>{paper.label}</span>
                <ExternalLink className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        {fileError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-xs text-red-700 dark:text-red-300 leading-relaxed transition-colors duration-300"
          >
            <AlertCircle
              className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400"
              aria-hidden="true"
            />
            <span>{fileError}</span>
          </div>
        )}
      </div>

      {/* Step 2: Conversion Mode */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          02. 변환 모드 선택
        </span>
        <div
          role="radiogroup"
          aria-label="오디오북 변환 모드"
          className="grid grid-cols-1 gap-2"
        >
          {CONVERSION_MODES.map((option) => {
            const active = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={isGenerating}
                onClick={() => onModeChange(option.id)}
                className={`text-left rounded-lg border px-3.5 py-2.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${
                  active
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/35 text-slate-900 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      active
                        ? 'border-blue-600 dark:border-blue-500 bg-blue-600 dark:bg-blue-500'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                    }`}
                  >
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  <span className="text-sm font-semibold">{option.title}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 3: LLM Engine */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            03. AI 엔진
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            한도 초과 시 자동 전환
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label="AI 엔진 선택"
          className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100/90 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80"
        >
          {PROVIDER_OPTIONS.map((option) => {
            const active = provider === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={isGenerating}
                onClick={() => onProviderChange(option.id)}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                }`}
                title={option.label}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {provider === 'auto'
            ? 'Gemini 2.5 Flash를 우선 사용하고, 여유가 없으면 OpenRouter(Claude)로 자동 전환합니다.'
            : provider === 'gemini'
              ? 'Google Gemini 2.5 Flash 모델만 사용합니다.'
              : 'OpenRouter의 Claude 모델로 직접 PDF를 변환합니다.'}
        </p>
      </div>

      {/* Step 4: Action Button */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!selectedFile || isGenerating || isInspectingPdf}
          className="w-full min-h-11 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 dark:focus-visible:ring-offset-slate-900"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              <span>
                {fileMetadata?.willAutoSplit
                  ? `첫 ${fileMetadata.chunkSize}페이지 분할 및 대본 생성 중...`
                  : 'PDF 분석 및 낭독 대본 생성 중...'}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {fileMetadata?.willAutoSplit
                  ? `첫 ${fileMetadata.chunkSize}페이지 우선 변환하기`
                  : '오디오북 대본 생성하기'}
              </span>
            </>
          )}
        </button>

        {isGenerating && (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
            분량에 따라 15~40초 정도 소요될 수 있습니다.
            {fileMetadata?.willAutoSplit
              ? ` 대용량 PDF의 첫 ${fileMetadata.chunkSize}페이지를 먼저 추출해 빠르게 변환 중입니다.`
              : mode === 'ko-summary'
                ? ' 핵심 논리와 수치를 유지하며 약 30% 분량으로 요약 중입니다.'
                : ' 원문을 요약하지 않고 전체를 변환합니다.'}
          </p>
        )}
      </div>

      {/* Quiet rules summary */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 transition-colors duration-300">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          자동 정제 규칙
        </p>
        <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          <li>· 2MB 이상 대용량 PDF는 첫 15페이지 우선 자동 분할 변환</li>
          <li>
            ·{' '}
            {mode === 'ko-summary'
              ? '논문의 구조·핵심 수치를 유지한 30% 내외 요약 대본 생성'
              : '요약 및 생략 없이 논문·리포트 본문 전체 변환'}
          </li>
          <li>· 머리글, 페이지 번호, [1] 인용 표기, 참고문헌 제거</li>
          <li>· 수식 및 기호(%, ≥, α 등)를 구어체 설명으로 변환</li>
        </ul>
      </div>
    </section>
  );
}
