import { ArrowRight } from 'lucide-react';

interface EarlyBirdBannerProps {
  onOpenWaitlist: () => void;
}

export function EarlyBirdBanner({ onOpenWaitlist }: EarlyBirdBannerProps) {
  return (
    <div className="bg-slate-50/90 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors duration-300">
      <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
        데모에서는 브라우저 기본 음성이 재생됩니다. 실제 정식 버전에서는 자연스러운 AI 성우 MP3와 애플/스포티파이 팟캐스트 자동 연동(RSS)이 제공됩니다.
      </p>
      <button
        type="button"
        onClick={onOpenWaitlist}
        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-900 dark:hover:bg-blue-600 hover:text-white hover:border-slate-900 dark:hover:border-blue-600 text-slate-900 dark:text-slate-100 text-xs font-semibold transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 dark:focus-visible:ring-blue-500"
      >
        <span>사전 알림 신청하고 50% 할인받기</span>
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
