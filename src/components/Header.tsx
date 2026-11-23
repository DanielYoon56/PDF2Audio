import { Headphones } from 'lucide-react';

interface HeaderProps {
  onOpenWaitlist: () => void;
}

export function Header({ onOpenWaitlist }: HeaderProps) {
  return (
    <header className="w-full bg-white border-b border-slate-200">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        <a
          href="#top"
          className="flex items-center gap-2.5 text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md"
        >
          <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Headphones className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="text-[17px] font-bold tracking-tight">PaperAudio</span>
        </a>

        <button
          type="button"
          onClick={onOpenWaitlist}
          className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
        >
          정식 버전 사전 신청 (얼리버드)
        </button>
      </div>
    </header>
  );
}
