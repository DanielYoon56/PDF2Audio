import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  AlertCircle,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { ConversionMode } from '../types/audiobook';
import { formatFileSize, isPdfFile } from '../utils/fileHelpers';

interface UploadPanelProps {
  selectedFile: File | null;
  mode: ConversionMode;
  isGenerating: boolean;
  fileError: string | null;
  onFileSelect: (file: File | null, validationError?: string | null) => void;
  onModeChange: (mode: ConversionMode) => void;
  onGenerate: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const MAX_RECOMMENDED_BYTES = 25 * 1024 * 1024; // 25MB

export function UploadPanel({
  selectedFile,
  mode,
  isGenerating,
  fileError,
  onFileSelect,
  onModeChange,
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
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col gap-6 transition-colors duration-300"
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
            className={`group rounded-lg border border-dashed px-4 py-8 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
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
              원본 PDF 레이아웃을 직접 분석하여 누락 없이 읽습니다
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
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono tabular-nums">
                    {formatFileSize(selectedFile.size)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>PDF 문서</span>
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
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          02. 변환 모드 선택
        </span>
        <div
          role="radiogroup"
          aria-label="오디오북 변환 모드"
          className="grid grid-cols-1 gap-2"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'ko-translate'}
            disabled={isGenerating}
            onClick={() => onModeChange('ko-translate')}
            className={`text-left rounded-lg border px-3.5 py-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${
              mode === 'ko-translate'
                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/35 text-slate-900 dark:text-slate-100'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                  mode === 'ko-translate'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-600 dark:bg-blue-500'
                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                }`}
              >
                {mode === 'ko-translate' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </span>
              <span className="text-sm font-semibold">
                한국어 번역 + 낭독용 정제
              </span>
            </div>
            <p className="mt-1 pl-6 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              영문·외국어 논문을 자연스러운 한국어 구어체로 번역해 낭독 대본을 만듭니다.
            </p>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={mode === 'original-clean'}
            disabled={isGenerating}
            onClick={() => onModeChange('original-clean')}
            className={`text-left rounded-lg border px-3.5 py-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${
              mode === 'original-clean'
                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/35 text-slate-900 dark:text-slate-100'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                  mode === 'original-clean'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-600 dark:bg-blue-500'
                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                }`}
              >
                {mode === 'original-clean' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </span>
              <span className="text-sm font-semibold">
                원문 그대로 낭독용 정제
              </span>
            </div>
            <p className="mt-1 pl-6 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              원문 언어를 유지하면서 인용 표기, 각주, 수식 기호만 듣기 편하게 다듬습니다.
            </p>
          </button>
        </div>
      </div>

      {/* Step 3: Action Button */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!selectedFile || isGenerating}
          className="w-full min-h-11 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 dark:focus-visible:ring-offset-slate-900"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              <span>PDF 분석 및 낭독 대본 생성 중...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>오디오북 대본 생성하기</span>
            </>
          )}
        </button>

        {isGenerating && (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
            분량에 따라 15~40초 정도 소요될 수 있습니다. 원문을 요약하지 않고 전체를 변환합니다.
          </p>
        )}
      </div>

      {/* Quiet rules summary */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 transition-colors duration-300">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          자동 정제 규칙
        </p>
        <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          <li>· 요약 및 생략 없이 논문·리포트 본문 전체 변환</li>
          <li>· 머리글, 페이지 번호, [1] 인용 표기, 참고문헌 제거</li>
          <li>· 수식 및 기호(%, ≥, α 등)를 구어체 설명으로 변환</li>
        </ul>
      </div>
    </section>
  );
}
