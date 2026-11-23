import type { WaitlistEntry, WaitlistFormValues } from '../types/audiobook';

const STORAGE_KEY = 'paperaudio_waitlist_entries_v1';

export function loadWaitlistEntries(): WaitlistEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WaitlistEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveWaitlistEntryLocally(values: WaitlistFormValues): WaitlistEntry {
  const existing = loadWaitlistEntries();
  const entry: WaitlistEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    submittedAt: new Date().toISOString(),
    email: values.email.trim(),
    expectedFeatures: [...values.expectedFeatures],
    pricingTier: values.pricingTier,
    comment: values.comment.trim(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, entry]));
  } catch {
    // Ignore storage quota errors gracefully
  }

  return entry;
}

export async function submitWaitlistEntry(
  values: WaitlistFormValues,
  webhookUrl: string
): Promise<{ entry: WaitlistEntry; webhookSent: boolean }> {
  const entry = saveWaitlistEntryLocally(values);
  const trimmedUrl = webhookUrl.trim();

  if (!trimmedUrl) {
    return { entry, webhookSent: false };
  }

  try {
    const response = await fetch(trimmedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        submittedAt: entry.submittedAt,
        email: entry.email,
        expectedFeatures: entry.expectedFeatures,
        pricingTier: entry.pricingTier,
        comment: entry.comment,
        source: 'PaperAudio Demo',
      }),
    });

    return { entry, webhookSent: response.ok };
  } catch {
    // Local storage already captured the entry safely
    return { entry, webhookSent: false };
  }
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function exportWaitlistCsv(): number {
  const entries = loadWaitlistEntries();
  if (entries.length === 0) {
    return 0;
  }

  const headers = ['신청일시', '이메일', '기대기능', '월구독의향가격', '한줄의견'];
  const rows = entries.map((entry) => [
    entry.submittedAt,
    entry.email,
    entry.expectedFeatures.join(' | '),
    entry.pricingTier,
    entry.comment,
  ]);

  const csvBody = [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\r\n');

  // Prepend UTF-8 BOM so Excel opens Korean text cleanly
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `paperaudio_waitlist_${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return entries.length;
}
