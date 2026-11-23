import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Header } from './components/Header';
import { UploadPanel } from './components/UploadPanel';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { EarlyBirdBanner } from './components/EarlyBirdBanner';
import { ScriptViewer } from './components/ScriptViewer';
import { WaitlistModal } from './components/WaitlistModal';
import { Footer } from './components/Footer';
import { useSpeechPlayer } from './hooks/useSpeechPlayer';
import type {
  ConversionMode,
  DetectedLanguage,
  GeneratedScriptResult,
  ThemeMode,
  WaitlistFormValues,
} from './types/audiobook';
import { fileToBase64 } from './utils/fileHelpers';
import { exportWaitlistCsv, submitWaitlistEntry } from './utils/waitlistStorage';

// 외부 폼/웹훅 연동 URL (비워두어도 localStorage에 안전하게 저장됩니다)
const WEBHOOK_URL = 'https://formspree.io/f/xgakpoyg';
const THEME_STORAGE_KEY = 'paperaudio_theme';

interface GenerateApiResponse {
  script?: string;
  paragraphs?: string[];
  detectedLanguage?: DetectedLanguage;
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

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<ConversionMode>('ko-translate');
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedScriptResult | null>(null);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

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
    result?.detectedLanguage ?? (mode === 'ko-translate' ? 'ko-KR' : 'en-US');

  const player = useSpeechPlayer({
    paragraphs: result?.paragraphs ?? [],
    targetLanguage,
  });

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
    setSelectedFile(file);
    setFileError(validationError ?? null);
    if (file) {
      setApiError(null);
    }
  };

  const handleGenerate = async () => {
    if (!selectedFile || isGenerating) return;

    player.stop();
    setApiError(null);
    setFileError(null);
    setIsGenerating(true);

    try {
      const pdfBase64 = await fileToBase64(selectedFile);
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64,
          fileName: selectedFile.name,
          mode,
        }),
      });

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

      setResult({
        script: paragraphs.join('\n\n'),
        paragraphs,
        detectedLanguage:
          data.detectedLanguage === 'en-US' ? 'en-US' : 'ko-KR',
        fileName: selectedFile.name,
        mode,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '알 수 없는 오류로 대본 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      setApiError(message);
    } finally {
      setIsGenerating(false);
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

  return (
    <div
      id="top"
      className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors duration-300"
    >
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
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
                  대본 생성에 실패했습니다
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
              mode={mode}
              isGenerating={isGenerating}
              fileError={fileError}
              onFileSelect={handleFileSelect}
              onModeChange={setMode}
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
            />

            {result && !isGenerating && (
              <EarlyBirdBanner onOpenWaitlist={() => setIsWaitlistOpen(true)} />
            )}

            <ScriptViewer
              result={result}
              isGenerating={isGenerating}
              activeIndex={player.activeIndex}
              playbackStatus={player.status}
              onSelectParagraph={player.playFromIndex}
              onTriggerUpload={() => fileInputRef.current?.click()}
            />
          </section>
        </div>
      </main>

      <Footer onAdminExportCsv={handleAdminExportCsv} />

      <WaitlistModal
        isOpen={isWaitlistOpen}
        onClose={() => setIsWaitlistOpen(false)}
        onSubmit={handleWaitlistSubmit}
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
