import type { ConversionMode, UsageHistoryItem } from '../types/audiobook';

const USAGE_STORAGE_KEY = 'pdf2audio_usage_history_v1';

export function loadUsageHistory(): UsageHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UsageHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function recordUsageEntry(params: {
  fileName: string;
  category: string;
  mode: ConversionMode;
  estimatedMinutes: number;
  charCount: number;
  paragraphCount: number;
}): UsageHistoryItem[] {
  const existing = loadUsageHistory();
  const entry: UsageHistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: params.fileName,
    category: params.category,
    mode: params.mode,
    estimatedMinutes: Math.max(1, params.estimatedMinutes),
    charCount: params.charCount,
    paragraphCount: params.paragraphCount,
    convertedAt: new Date().toISOString(),
  };

  const next = [...existing, entry].slice(-100);
  try {
    window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors gracefully
  }
  return next;
}

export function clearUsageHistory(): void {
  try {
    window.localStorage.removeItem(USAGE_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}
