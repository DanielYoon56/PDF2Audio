import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Header } from './components/Header';
import { UploadPanel } from './components/UploadPanel';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { EarlyBirdBanner } from './components/EarlyBirdBanner';
import { ScriptViewer } from './components/ScriptViewer';
import { FaqSection } from './components/FaqSection';
import { WaitlistModal } from './components/WaitlistModal';
import { UsageDashboardModal } from './components/UsageDashboardModal';
import { Footer } from './components/Footer';
import { useSpeechPlayer } from './hooks/useSpeechPlayer';
import type {
  ConversionMode,
  DetectedLanguage,
  GeneratedScriptResult,
  LlmProviderPreference,
  PdfFileMetadata,
  ThemeMode,
  UsageHistoryItem,
  WaitlistFormValues,
} from './types/audiobook';
import { estimateReadingMinutes, fileToBase64 } from './utils/fileHelpers';
import { exportScriptToAudio } from './utils/audioExport';
import {
  extractPdfPageChunkBase64,
  inspectPdfMetadata,
  LARGE_PDF_THRESHOLD_BYTES,
  SPLIT_CHUNK_PAGES,
} from './utils/pdfSplitter';
import { exportWaitlistCsv, submitWaitlistEntry } from './utils/waitlistStorage';
import {
  clearUsageHistory,
  loadUsageHistory,
  recordUsageEntry,
} from './utils/usageStorage';

// 외부 폼/웹훅 연동 URL (비워두어도 localStorage에 안전하게 저장됩니다)
const WEBHOOK_URL = 'https://formspree.io/f/xgakpoyg';
const THEME_STORAGE_KEY = 'paperaudio_theme';

interface GenerateApiResponse {
  script?: string;
  paragraphs?: string[];
  detectedLanguage?: DetectedLanguage;
  category?: string;
  model?: string;
  providerUsed?: 'gemini' | 'openrouter';
  fallbackUsed?: boolean;
  fallbackReason?: string;
  integrityVerified?: boolean;
  error?: string;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage access errors
  }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileMetadata, setFileMetadata] = useState<PdfFileMetadata | null>(null);
  const [isInspectingPdf, setIsInspectingPdf] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<ConversionMode>('ko-translate');
  const [provider, setProvider] = useState<LlmProviderPreference>('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState<string | null>(null);
  const [generatingChars, setGeneratingChars] = useState(0);
  const [isConvertingNextChunk, setIsConvertingNextChunk] = useState(false);
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [audioExportStatus, setAudioExportStatus] = useState<string | null>(null);
  const [regeneratingIndices, setRegeneratingIndices] = useState<number[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedScriptResult | null>(null);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [isUsageDashboardOpen, setIsUsageDashboardOpen] = useState(false);
  const [usageHistory, setUsageHistory] = useState<UsageHistoryItem[]>(() =>
    typeof window !== 'undefined' ? loadUsageHistory() : []
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const inspectTokenRef = useRef(0);
  const lastPdfBase64Ref = useRef<{ fileName: string; base64: string } | null>(
    null
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const targetLanguage: DetectedLanguage =
    result?.detectedLanguage ??
    (mode === 'original-clean' ? 'en-US' : 'ko-KR');

  const player = useSpeechPlayer({
    paragraphs: result?.paragraphs ?? [],
    targetLanguage,
  });

  // Global keyboard shortcuts for audio playback (Space, ArrowLeft/ArrowRight, Esc)
  useEffect(() => {
    if (!result || result.paragraphs.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isWaitlistOpen || isUsageDashboardOpen) return;
      if (isEditableElement(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === 'Space') {
        event.preventDefault();
        player.togglePlayPause();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        player.skipPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        player.skipNext();
      } else if (event.key === 'Escape') {
        if (player.status !== 'idle') {
          event.preventDefault();
          player.stop();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    result,
    isWaitlistOpen,
    isUsageDashboardOpen,
    player.togglePlayPause,
    player.skipPrev,
    player.skipNext,
    player.stop,
    player.status,
  ]);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  };

  const handleFileSelect = (file: File | null, validationError?: string | null) => {
    const token = ++inspectTokenRef.current;
    setSelectedFile(file);
    setFileError(validationError ?? null);
    setFileMetadata(null);

    if (!file) {
      setIsInspectingPdf(false);
      return;
    }

    setApiError(null);
    setIsInspectingPdf(true);

    void inspectPdfMetadata(file).then((meta) => {
      if (inspectTokenRef.current !== token) return;
      setFileMetadata(meta);
      setIsInspectingPdf(false);
    });
  };

  const requestGenerateScriptStream = async (
    payload: {
      pdfBase64: string;
      fileName: string;
      mode: ConversionMode;
      provider: LlmProviderPreference;
      pageRange?: { startPage: number; endPage: number; totalPages: number };
    },
    onStatus?: (message: string) => void,
    onProgress?: (chars: number, providerLabel?: string) => void
  ): Promise<GenerateApiResponse> => {
    const response = await fetch('/api/generate-script', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
      },
      body: JSON.stringify({
        ...payload,
        stream: true,
      }),
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok || !contentType.includes('text/event-stream')) {
      let data: GenerateApiResponse = {};
      try {
        data = (await response.json()) as GenerateApiResponse;
      } catch {
        // Non-JSON response fallback
      }
      if (!response.ok) {
        throw new Error(
          data.error ||
            `서버 응답 오류가 발생했습니다. (HTTP ${response.status})`
        );
      }
      return data;
    }

    if (!response.body) {
      throw new Error('서버 스트림 응답을 읽을 수 없습니다.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalResult: GenerateApiResponse | null = null;

    const handleBlock = (block: string) => {
      const lines = block.split(/\r?\n/);
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) return;
      const dataStr = dataLines.join('\n');
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(dataStr) as Record<string, unknown>;
      } catch {
        return;
      }

      if (eventName === 'status' && typeof parsed.message === 'string') {
        onStatus?.(parsed.message);
      } else if (eventName === 'progress') {
        const chars = Number(parsed.chars) || 0;
        const providerLabel =
          typeof parsed.provider === 'string' ? parsed.provider : undefined;
        onProgress?.(chars, providerLabel);
      } else if (eventName === 'error') {
        const msg =
          typeof parsed.error === 'string'
            ? parsed.error
            : '대본 생성 중 오류가 발생했습니다.';
        throw new Error(msg);
      } else if (eventName === 'done') {
        finalResult = parsed as unknown as GenerateApiResponse;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (block.trim()) {
          handleBlock(block);
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      handleBlock(buffer);
    }

    if (!finalResult) {
      throw new Error(
        '서버 연결이 완료되기 전에 종료되었습니다. 잠시 후 다시 시도해 주세요.'
      );
    }

    return finalResult;
  };

  const handleGenerate = async () => {
    if (!selectedFile || isGenerating) return;

    player.stop();
    setApiError(null);
    setFileError(null);
    setRegeneratingIndices([]);
    setIsGenerating(true);
    setGeneratingStatus('PDF 문서를 준비하고 있습니다...');
    setGeneratingChars(0);

    try {
      let pdfBase64: string;
      let pageRange:
        | { startPage: number; endPage: number; totalPages: number }
        | undefined;
      let splitProgress: GeneratedScriptResult['splitProgress'];

      if (selectedFile.size >= LARGE_PDF_THRESHOLD_BYTES) {
        const extraction = await extractPdfPageChunkBase64(
          selectedFile,
          1,
          SPLIT_CHUNK_PAGES
        );
        pdfBase64 = extraction.base64;

        if (extraction.wasSplit && extraction.totalPages) {
          pageRange = {
            startPage: extraction.startPage,
            endPage: extraction.endPage,
            totalPages: extraction.totalPages,
          };
          splitProgress = {
            isAutoSplit: true,
            totalPages: extraction.totalPages,
            convertedUpToPage: extraction.endPage,
            chunkSize: SPLIT_CHUNK_PAGES,
          };
        }
      } else {
        pdfBase64 = await fileToBase64(selectedFile);
      }

      lastPdfBase64Ref.current = {
        fileName: selectedFile.name,
        base64: pdfBase64,
      };

      const data = await requestGenerateScriptStream(
        {
          pdfBase64,
          fileName: selectedFile.name,
          mode,
          provider,
          pageRange,
        },
        (msg) => setGeneratingStatus(msg),
        (chars, providerLabel) => {
          setGeneratingChars(chars);
          if (providerLabel) {
            setGeneratingStatus(`${providerLabel}에서 대본을 실시간 생성 중입니다...`);
          }
        }
      );

      const paragraphs =
        Array.isArray(data.paragraphs) && data.paragraphs.length > 0
          ? data.paragraphs
          : (data.script ?? '')
              .split(/\n{2,}|\n/)
              .map((p) => p.trim())
              .filter(Boolean);

      if (paragraphs.length === 0) {
        throw new Error(
          'PDF에서 낭독할 텍스트를 추출하지 못했습니다. 텍스트가 포함된 PDF 파일인지 확인해 주세요.'
        );
      }

      const scriptText = paragraphs.join('\n\n');
      const detectedLang: DetectedLanguage =
        data.detectedLanguage === 'en-US' ? 'en-US' : 'ko-KR';
      const category = data.category || '일반 논문 · 리포트';

      setResult({
        script: scriptText,
        paragraphs,
        detectedLanguage: detectedLang,
        category,
        fileName: selectedFile.name,
        mode,
        generatedAt: new Date().toISOString(),
        providerUsed: data.providerUsed === 'openrouter' ? 'openrouter' : 'gemini',
        model: data.model,
        fallbackUsed: Boolean(data.fallbackUsed),
        fallbackReason: data.fallbackReason,
        splitProgress,
        integrityVerified: data.integrityVerified,
      });

      const estimatedMinutes = estimateReadingMinutes(
        scriptText,
        detectedLang === 'ko-KR'
      );
      const updatedHistory = recordUsageEntry({
        fileName: selectedFile.name,
        category,
        mode,
        estimatedMinutes,
        charCount: scriptText.length,
        paragraphCount: paragraphs.length,
      });
      setUsageHistory(updatedHistory);

      if (splitProgress?.isAutoSplit) {
        showToast(
          `대용량 자동 분할: 첫 ${splitProgress.convertedUpToPage}페이지(전체 ${splitProgress.totalPages}p 중) 변환 완료! 바로 재생해 보세요.`
        );
      } else if (data.fallbackUsed) {
        showToast('Gemini 여유 부족으로 OpenRouter(Claude)로 자동 전환되었습니다.');
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '알 수 없는 오류로 대본 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      setApiError(message);
    } finally {
      setIsGenerating(false);
      setGeneratingStatus(null);
      setGeneratingChars(0);
    }
  };

  const handleContinueNextChunk = async () => {
    if (
      !selectedFile ||
      !result?.splitProgress ||
      isGenerating ||
      isConvertingNextChunk
    ) {
      return;
    }

    const { totalPages, convertedUpToPage, chunkSize } = result.splitProgress;
    if (convertedUpToPage >= totalPages) return;

    const startPage = convertedUpToPage + 1;
    const endPage = Math.min(totalPages, convertedUpToPage + chunkSize);

    setApiError(null);
    setIsConvertingNextChunk(true);

    try {
      const extraction = await extractPdfPageChunkBase64(
        selectedFile,
        startPage,
        endPage
      );

      const data = await requestGenerateScriptStream({
        pdfBase64: extraction.base64,
        fileName: selectedFile.name,
        mode: result.mode,
        provider,
        pageRange: {
          startPage: extraction.startPage,
          endPage: extraction.endPage,
          totalPages: extraction.totalPages ?? totalPages,
        },
      });

      const nextParagraphs =
        Array.isArray(data.paragraphs) && data.paragraphs.length > 0
          ? data.paragraphs
          : (data.script ?? '')
              .split(/\n{2,}|\n/)
              .map((p) => p.trim())
              .filter(Boolean);

      setResult((prev) => {
        if (!prev) return prev;
        const mergedParagraphs = [...prev.paragraphs, ...nextParagraphs];
        return {
          ...prev,
          paragraphs: mergedParagraphs,
          script: mergedParagraphs.join('\n\n'),
          splitProgress: prev.splitProgress
            ? {
                ...prev.splitProgress,
                convertedUpToPage: extraction.endPage,
              }
            : undefined,
        };
      });

      showToast(
        `${extraction.startPage}~${extraction.endPage}페이지 대본이 이어서 추가되었습니다.`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '다음 구간 대본 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      setApiError(message);
    } finally {
      setIsConvertingNextChunk(false);
    }
  };

  const handleDownloadAudio = async () => {
    if (!result || isGenerating || isExportingAudio) return;

    setApiError(null);
    setIsExportingAudio(true);
    setAudioExportStatus('음성 생성 준비 중...');

    try {
      const exported = await exportScriptToAudio({
        script: result.script,
        fileName: result.fileName,
        language: result.detectedLanguage,
        onProgress: (progress) => {
          if (progress.currentChunk && progress.totalChunks) {
            setAudioExportStatus(
              `음성 생성 (${progress.currentChunk}/${progress.totalChunks})`
            );
          } else {
            setAudioExportStatus(progress.message);
          }
        },
      });
      showToast(
        `오디오북 음성 파일(.${exported.extension}) 다운로드를 시작했습니다. (${exported.providerUsed})`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '음성 파일 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      setApiError(message);
    } finally {
      setIsExportingAudio(false);
      setAudioExportStatus(null);
    }
  };

  const handleRegenerateParagraph = async (paragraphIndex: number) => {
    if (!result) return;
    const targetParagraph = result.paragraphs[paragraphIndex];
    if (!targetParagraph) return;
    if (regeneratingIndices.includes(paragraphIndex)) return;

    setApiError(null);
    setRegeneratingIndices((prev) =>
      prev.includes(paragraphIndex) ? prev : [...prev, paragraphIndex]
    );

    try {
      const cachedPdf =
        lastPdfBase64Ref.current &&
        lastPdfBase64Ref.current.fileName === result.fileName
          ? lastPdfBase64Ref.current.base64
          : undefined;

      const response = await fetch('/api/regenerate-paragraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paragraph: targetParagraph,
          paragraphIndex,
          previousParagraph:
            paragraphIndex > 0
              ? result.paragraphs[paragraphIndex - 1]
              : undefined,
          nextParagraph:
            paragraphIndex < result.paragraphs.length - 1
              ? result.paragraphs[paragraphIndex + 1]
              : undefined,
          mode: result.mode,
          language: result.detectedLanguage,
          provider,
          fileName: result.fileName,
          pdfBase64: cachedPdf,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        repairedParagraph?: string;
        error?: string;
      };

      if (!response.ok || !data.repairedParagraph) {
        throw new Error(
          data.error ||
            '선택한 문단을 다시 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
        );
      }

      const repaired = data.repairedParagraph.trim();
      setResult((prev) => {
        if (!prev || !prev.paragraphs[paragraphIndex]) return prev;
        const nextParagraphs = [...prev.paragraphs];
        nextParagraphs[paragraphIndex] = repaired;
        return {
          ...prev,
          paragraphs: nextParagraphs,
          script: nextParagraphs.join('\n\n'),
        };
      });

      showToast(
        `${paragraphIndex + 1}번 문단을 완전한 문장으로 다시 생성했습니다.`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '문단 다시 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      setApiError(message);
    } finally {
      setRegeneratingIndices((prev) =>
        prev.filter((idx) => idx !== paragraphIndex)
      );
    }
  };

  const handleWaitlistSubmit = async (values: WaitlistFormValues) => {
    await submitWaitlistEntry(values, WEBHOOK_URL);
  };

  const handleAdminExportCsv = () => {
    const exportedCount = exportWaitlistCsv();
    if (exportedCount > 0) {
      showToast(`사전 신청 내역 ${exportedCount}건을 CSV 파일로 다운로드했습니다.`);
    } else {
      showToast('저장된 사전 신청 내역이 아직 없습니다.');
    }
  };

  const handleClearUsageHistory = () => {
    clearUsageHistory();
    setUsageHistory([]);
    showToast('사용량 기록을 초기화했습니다.');
  };

  return (
    <div
      id="top"
      className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors duration-300"
    >
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenUsageDashboard={() => setIsUsageDashboardOpen(true)}
        onOpenWaitlist={() => setIsWaitlistOpen(true)}
      />

      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Global API Error Banner */}
        {apiError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3.5 flex items-start justify-between gap-3 text-sm text-red-800 dark:text-red-200 transition-colors duration-300"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle
                className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-red-900 dark:text-red-100">
                  요청 처리에 실패했습니다
                </p>
                <p className="mt-0.5 text-xs sm:text-sm text-red-700 dark:text-red-300 leading-relaxed">
                  {apiError}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setApiError(null)}
              aria-label="오류 메시지 닫기"
              className="p-1 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md transition-colors shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Two-column SaaS Studio Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
          <div className="lg:sticky lg:top-6">
            <UploadPanel
              selectedFile={selectedFile}
              fileMetadata={fileMetadata}
              isInspectingPdf={isInspectingPdf}
              mode={mode}
              provider={provider}
              isGenerating={isGenerating}
              fileError={fileError}
              onFileSelect={handleFileSelect}
              onModeChange={setMode}
              onProviderChange={setProvider}
              onGenerate={handleGenerate}
              inputRef={fileInputRef}
            />
          </div>

          <section
            aria-label="샘플 오디오 플레이어 및 낭독 대본"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl min-h-[540px] flex flex-col transition-colors duration-300"
          >
            <AudioPlayerBar
              player={player}
              totalParagraphs={result?.paragraphs.length ?? 0}
              disabled={isGenerating || !result}
              isExportingAudio={isExportingAudio}
              audioExportStatus={audioExportStatus}
              onDownloadAudio={handleDownloadAudio}
            />

            {result && !isGenerating && (
              <EarlyBirdBanner onOpenWaitlist={() => setIsWaitlistOpen(true)} />
            )}

            <ScriptViewer
              result={result}
              isGenerating={isGenerating}
              generatingStatus={generatingStatus}
              generatingChars={generatingChars}
              isConvertingNextChunk={isConvertingNextChunk}
              isExportingAudio={isExportingAudio}
              audioExportStatus={audioExportStatus}
              canContinueChunk={Boolean(
                selectedFile && result && selectedFile.name === result.fileName
              )}
              activeIndex={player.activeIndex}
              playbackStatus={player.status}
              playbackRate={player.rate}
              onSelectParagraph={player.playFromIndex}
              onTriggerUpload={() => fileInputRef.current?.click()}
              onContinueNextChunk={handleContinueNextChunk}
              onDownloadAudio={handleDownloadAudio}
              regeneratingIndices={regeneratingIndices}
              onRegenerateParagraph={handleRegenerateParagraph}
            />
          </section>
        </div>

        {/* Collapsible FAQ Accordion above Footer */}
        <FaqSection onOpenWaitlist={() => setIsWaitlistOpen(true)} />
      </main>

      <Footer onAdminExportCsv={handleAdminExportCsv} />

      <WaitlistModal
        isOpen={isWaitlistOpen}
        onClose={() => setIsWaitlistOpen(false)}
        onSubmit={handleWaitlistSubmit}
      />

      <UsageDashboardModal
        isOpen={isUsageDashboardOpen}
        theme={theme}
        history={usageHistory}
        onClose={() => setIsUsageDashboardOpen(false)}
        onClearHistory={handleClearUsageHistory}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 text-xs font-medium shadow-lg flex items-center gap-2 transition-colors duration-300"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
