import { BarChart3, Headphones, Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../types/audiobook';

interface HeaderProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenUsageDashboard: () => void;
  onOpenWaitlist: () => void;
}

export function Header({
  theme,
  onToggleTheme,
  onOpenUsageDashboard,
  onOpenWaitlist,
}: HeaderProps) {
  const isDark = theme === 'dark';

  return (
    <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-6">
        <a
          href="#top"
          className="flex items-center gap-2.5 text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md transition-colors duration-300"
        >
          <span className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0 transition-colors duration-300">
            <Headphones className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="text-[17px] font-bold tracking-tight">PDF2Audio</span>
        </a>

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenUsageDashboard}
            aria-label="사용량 대시보드 열기"
            title="사용량 대시보드"
            className="h-9 px-2.5 sm:px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors duration-300 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <BarChart3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span className="hidden md:inline">사용량 대시보드</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            className="h-9 px-2.5 sm:px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors duration-300 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span className="hidden sm:inline">라이트</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <span className="hidden sm:inline">다크</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenWaitlist}
            className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 dark:bg-blue-600 dark:hover:bg-blue-500 dark:active:bg-blue-700 rounded-lg transition-colors duration-300 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900 dark:focus-visible:ring-blue-500 dark:focus-visible:ring-offset-slate-900"
          >
            정식 버전 사전 신청 (얼리버드)
          </button>
        </div>
      </div>
    </header>
  );
}
