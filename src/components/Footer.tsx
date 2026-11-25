import { useRef } from 'react';
import { Share2 } from 'lucide-react';

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

  const shareUrl = 'https://github.com/DanielYoon56/PDF2Audio';
  const shareText =
    '영문 PDF 논문·리포트를 자연스러운 한국어 오디오북 대본으로 변환해 바로 들을 수 있는 오픈소스 웹앱 PDF2Audio를 확인해 보세요!';
  const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText
  )}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <footer className="w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto transition-colors duration-300">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 dark:text-slate-500">
        <button
          type="button"
          onClick={handleCopyrightClick}
          className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 transition-colors select-none cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:focus-visible:ring-slate-700 rounded"
        >
          © 2026 PDF2Audio Demo
        </button>

        <div className="flex flex-wrap items-center gap-4">
          <span>PDF 논문·리포트 오디오북 변환 데모</span>
          <a
            href={twitterIntentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-900 hover:text-white hover:border-slate-900 dark:hover:bg-slate-100 dark:hover:text-slate-900 text-slate-600 dark:text-slate-300 font-medium transition-colors whitespace-nowrap"
          >
            <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>X(트위터)에 공유</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
