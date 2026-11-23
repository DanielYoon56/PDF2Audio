import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileAudio2,
  Loader2,
  Play,
  Volume2,
} from 'lucide-react';
import type { GeneratedScriptResult, PlaybackStatus } from '../types/audiobook';
import { downloadTextFile, estimateReadingMinutes } from '../utils/fileHelpers';

interface ScriptViewerProps {
  result: GeneratedScriptResult | null;
  isGenerating: boolean;
  activeIndex: number | null;
  playbackStatus: PlaybackStatus;
  onSelectParagraph: (index: number) => void;
  onTriggerUpload: () => void;
}

export function ScriptViewer({
  result,
  isGenerating,
  activeIndex,
  playbackStatus,
  onSelectParagraph,
  onTriggerUpload,
}: ScriptViewerProps) {
  const [copied, setCopied] = useState(false);
  const paragraphRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Scroll active paragraph smoothly into view during playback
  useEffect(() => {
    if (activeIndex === null) return;
    const node = paragraphRefs.current[activeIndex];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeIndex]);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy method if Clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = result.script;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    downloadTextFile(result.script, result.fileName);
  };

  if (isGenerating) {
    return (
      <div className="p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              PDF 분석 및 낭독 대본 생성 중...
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              2단 레이아웃 순서 정리, 인용 제거 및 구어체 변환을 진행하고 있습니다.
            </p>
          </div>
        </div>

        <div className="space-y-6 animate-pulse" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-start gap-4">
              <div className="w-6 h-4 rounded bg-slate-100 mt-1 shrink-0" />
              <div className="flex-1 space-y-2.5">
                <div className="h-4 bg-slate-100 rounded w-full" />
                <div className="h-4 bg-slate-100 rounded w-[94%]" />
                <div className="h-4 bg-slate-100 rounded w-[78%]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="px-6 py-16 sm:py-24 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500">
          <FileAudio2 className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          변환된 오디오북 대본이 여기에 표시됩니다
        </h2>
        <p className="mt-2 max-w-md text-sm text-slate-500 leading-relaxed">
          좌측 패널에서 PDF 논문이나 리포트를 업로드하고 대본을 생성하면, 문단별 싱크 하이라이트와 함께 바로 샘플 음성을 들어보실 수 있습니다.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>01. PDF 업로드</span>
          <span aria-hidden="true">·</span>
          <span>02. Gemini 전체 낭독 대본 생성</span>
          <span aria-hidden="true">·</span>
          <span>03. 문단 클릭 즉시 재생</span>
        </div>

        <button
          type="button"
          onClick={onTriggerUpload}
          className="mt-6 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-800 transition-colors"
        >
          PDF 파일 선택하기
        </button>
      </div>
    );
  }

  const estimatedMinutes = estimateReadingMinutes(
    result.script,
    result.detectedLanguage === 'ko-KR'
  );
  const displayTitle = result.fileName.replace(/\.pdf$/i, '');
  const modeLabel =
    result.mode === 'ko-translate' ? '한국어 번역 정제' : '원문 낭독 정제';

  return (
    <div className="flex flex-col">
      {/* Document Toolbar */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-base font-bold text-slate-900 truncate"
            title={displayTitle}
          >
            {displayTitle}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="tabular-nums">{result.paragraphs.length}개 문단</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">예상 청취 약 {estimatedMinutes}분</span>
            <span aria-hidden="true">·</span>
            <span>{modeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>문단을 클릭하면 해당 위치부터 재생됩니다</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-700">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>대본 복사</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>.txt 다운로드</span>
          </button>
        </div>
      </div>

      {/* Synced Paragraph List */}
      <div className="px-3 sm:px-6 py-5 sm:py-6">
        <div className="max-w-[72ch] mx-auto space-y-2">
          {result.paragraphs.map((paragraph, index) => {
            const isActive = activeIndex === index;
            const isPlayingThis = isActive && playbackStatus === 'playing';
            const paddedIndex = String(index + 1).padStart(2, '0');

            return (
              <button
                key={`${index}-${paragraph.slice(0, 24)}`}
                ref={(el) => {
                  paragraphRefs.current[index] = el;
                }}
                type="button"
                onClick={() => onSelectParagraph(index)}
                aria-current={isActive ? 'true' : undefined}
                className={`group w-full text-left rounded-lg px-3.5 py-3.5 transition-colors duration-150 flex items-start gap-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? 'bg-blue-50/85 ring-1 ring-blue-200 text-slate-950'
                    : 'bg-transparent hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="w-7 pt-1 shrink-0 flex items-center justify-center">
                  {isPlayingThis ? (
                    <Volume2
                      className="w-4 h-4 text-blue-600"
                      aria-label="현재 재생 중"
                    />
                  ) : (
                    <>
                      <span
                        className={`text-xs font-mono tabular-nums group-hover:hidden ${
                          isActive ? 'text-blue-700 font-medium' : 'text-slate-400'
                        }`}
                      >
                        {paddedIndex}
                      </span>
                      <Play
                        className="w-3.5 h-3.5 text-blue-600 hidden group-hover:block fill-current"
                        aria-hidden="true"
                      />
                    </>
                  )}
                </span>

                <span
                  className={`text-[15.5px] sm:text-[16px] leading-[1.85] tracking-[-0.01em] break-keep ${
                    isActive ? 'text-slate-950 font-medium' : 'text-slate-800'
                  }`}
                >
                  {paragraph}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
