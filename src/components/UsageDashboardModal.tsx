import { useEffect, useMemo } from 'react';
import { BarChart3, Clock, FileText, Tag, Trash2, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ThemeMode, UsageHistoryItem } from '../types/audiobook';

interface UsageDashboardModalProps {
  isOpen: boolean;
  theme: ThemeMode;
  history: UsageHistoryItem[];
  onClose: () => void;
  onClearHistory: () => void;
}

const CHART_COLORS = ['#2563EB', '#0EA5E9', '#6366F1', '#10B981', '#F59E0B', '#EC4899'];

export function UsageDashboardModal({
  isOpen,
  theme,
  history,
  onClose,
  onClearHistory,
}: UsageDashboardModalProps) {
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const stats = useMemo(() => {
    const totalPapers = history.length;
    const totalMinutes = history.reduce((sum, item) => sum + item.estimatedMinutes, 0);

    const categoryMap = new Map<string, { category: string; count: number; minutes: number }>();
    for (const item of history) {
      const existing = categoryMap.get(item.category);
      if (existing) {
        existing.count += 1;
        existing.minutes += item.estimatedMinutes;
      } else {
        categoryMap.set(item.category, {
          category: item.category,
          count: 1,
          minutes: item.estimatedMinutes,
        });
      }
    }

    const categoryData = Array.from(categoryMap.values()).sort(
      (a, b) => b.count - a.count
    );
    const topCategory = categoryData[0]?.category ?? '아직 기록 없음';

    const recentPapersData = history.slice(-6).map((item) => {
      const shortName = item.fileName.replace(/\.pdf$/i, '');
      return {
        name: shortName.length > 14 ? `${shortName.slice(0, 14)}…` : shortName,
        fullName: shortName,
        minutes: item.estimatedMinutes,
      };
    });

    return {
      totalPapers,
      totalMinutes,
      topCategory,
      categoryData,
      recentPapersData,
    };
  }, [history]);

  if (!isOpen) return null;

  const axisTickColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#1E293B' : '#E2E8F0';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderColor: isDark ? '#334155' : '#E2E8F0',
    borderRadius: '10px',
    fontSize: '12px',
    color: isDark ? '#F1F5F9' : '#0F172A',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-dashboard-title"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl transition-colors duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2
              id="usage-dashboard-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              PDF2Audio 사용량 대시보드
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="대시보드 닫기"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>총 변환 논문 수</span>
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {stats.totalPapers}
                <span className="ml-1 text-sm font-sans font-medium text-slate-500 dark:text-slate-400">
                  편
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>총 예상 청취 시간</span>
                <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </div>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {stats.totalMinutes}
                <span className="ml-1 text-sm font-sans font-medium text-slate-500 dark:text-slate-400">
                  분
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>최다 변환 카테고리</span>
                <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              </div>
              <p
                className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
                title={stats.topCategory}
              >
                {stats.topCategory}
              </p>
            </div>
          </div>

          {stats.totalPapers === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-14 px-6 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                아직 변환한 논문 기록이 없습니다
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                PDF 논문이나 리포트를 변환하면 카테고리별 분포와 누적 청취 시간이 여기에 시각화됩니다.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Chart 1: Category Distribution */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  카테고리별 변환 건수
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.categoryData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        stroke={gridColor}
                      />
                      <YAxis
                        type="category"
                        dataKey="category"
                        width={96}
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        stroke={gridColor}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: unknown) => [`${value}편`, '변환 수']}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
                        {stats.categoryData.map((entry, idx) => (
                          <Cell
                            key={entry.category}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Recent Paper Listening Minutes */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  최근 논문별 예상 청취 시간 (분)
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.recentPapersData}
                      margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10.5, fill: axisTickColor }}
                        stroke={gridColor}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: axisTickColor }}
                        stroke={gridColor}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelFormatter={(_label, payload) =>
                          (payload?.[0]?.payload as { fullName?: string } | undefined)
                            ?.fullName ?? ''
                        }
                        formatter={(value: unknown) => [`약 ${value}분`, '예상 청취']}
                      />
                      <Bar
                        dataKey="minutes"
                        fill="#2563EB"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            {stats.totalPapers > 0 ? (
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>사용 기록 초기화</span>
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
