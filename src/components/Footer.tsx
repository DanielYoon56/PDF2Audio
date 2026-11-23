import { useRef } from 'react';

interface FooterProps {
  onAdminExportCsv: () => void;
}

export function Footer({ onAdminExportCsv }: FooterProps) {
  const clickCountRef = useRef(0);
  const resetTimerRef = useRef<number | null>(null);

  const handleCopyrightClick = () => {
    clickCountRef.current += 1;

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      resetTimerRef.current = null;
      onAdminExportCsv();
      return;
    }

    resetTimerRef.current = window.setTimeout(() => {
      clickCountRef.current = 0;
      resetTimerRef.current = null;
    }, 1500);
  };

  return (
    <footer className="w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto transition-colors duration-300">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
        <button
          type="button"
          onClick={handleCopyrightClick}
          className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 transition-colors select-none cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:focus-visible:ring-slate-700 rounded"
        >
          © 2026 PaperAudio Demo
        </button>
        <span>PDF 논문·리포트 오디오북 변환 데모</span>
      </div>
    </footer>
  );
}
