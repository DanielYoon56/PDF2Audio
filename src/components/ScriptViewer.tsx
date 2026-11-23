import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eraser,
  FileAudio2,
  Highlighter,
  Loader2,
  Play,
  Quote,
  Search,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import type {
  DocumentAnnotations,
  GeneratedScriptResult,
  HighlightColor,
  ParagraphAnnotation,
  PlaybackStatus,
  TextHighlightRange,
} from '../types/audiobook';
import { downloadTextFile, estimateReadingMinutes } from '../utils/fileHelpers';

interface ScriptViewerProps {
  result: GeneratedScriptResult | null;
  isGenerating: boolean;
  activeIndex: number | null;
  playbackStatus: PlaybackStatus;
  onSelectParagraph: (index: number) => void;
  onTriggerUpload: () => void;
}

interface SearchMatch {
  paragraphIndex: number;
  start: number;
  end: number;
  globalIndex: number;
}

interface SelectionPopoverState {
  paragraphIndex: number;
  start: number;
  end: number;
  selectedText: string;
  x: number;
  y: number;
}

const HIGHLIGHT_SWATCHES: {
  color: HighlightColor;
  label: string;
  dotClass: string;
  markClass: string;
  cardClass: string;
}[] = [
  {
    color: 'yellow',
    label: '노란색 형광펜',
    dotClass: 'bg-amber-300 border-amber-400 dark:bg-amber-400 dark:border-amber-300',
    markClass:
      'bg-amber-200/85 text-slate-950 dark:bg-amber-400/30 dark:text-amber-100 rounded-[3px] px-0.5',
    cardClass:
      'bg-amber-50/75 dark:bg-amber-950/25 ring-1 ring-amber-200/90 dark:ring-amber-700/40',
  },
  {
    color: 'emerald',
    label: '초록색 형광펜',
    dotClass: 'bg-emerald-300 border-emerald-400 dark:bg-emerald-400 dark:border-emerald-300',
    markClass:
      'bg-emerald-200/80 text-slate-950 dark:bg-emerald-400/30 dark:text-emerald-100 rounded-[3px] px-0.5',
    cardClass:
      'bg-emerald-50/70 dark:bg-emerald-950/25 ring-1 ring-emerald-200/90 dark:ring-emerald-700/40',
  },
  {
    color: 'sky',
    label: '하늘색 형광펜',
    dotClass: 'bg-sky-300 border-sky-400 dark:bg-sky-400 dark:border-sky-300',
    markClass:
      'bg-sky-200/80 text-slate-950 dark:bg-sky-400/30 dark:text-sky-100 rounded-[3px] px-0.5',
    cardClass:
      'bg-sky-50/70 dark:bg-sky-950/25 ring-1 ring-sky-200/90 dark:ring-sky-700/40',
  },
];

function getSwatch(color: HighlightColor) {
  return HIGHLIGHT_SWATCHES.find((s) => s.color === color) ?? HIGHLIGHT_SWATCHES[0];
}

function getAnnotationStorageKey(fileName: string): string {
  return `paperaudio_annotations_v1:${fileName}`;
}

function loadAnnotations(fileName: string): DocumentAnnotations {
  try {
    const raw = window.localStorage.getItem(getAnnotationStorageKey(fileName));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as DocumentAnnotations) : {};
  } catch {
    return {};
  }
}

function saveAnnotations(fileName: string, annotations: DocumentAnnotations): void {
  try {
    window.localStorage.setItem(
      getAnnotationStorageKey(fileName),
      JSON.stringify(annotations)
    );
  } catch {
    // Ignore storage quota issues gracefully
  }
}

function getOffsetWithinElement(
  rootEl: HTMLElement,
  targetNode: Node,
  targetOffset: number
): number | null {
  let accumulated = 0;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    if (current === targetNode) {
      return accumulated + targetOffset;
    }
    accumulated += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }

  // Fallback when browser selects at an element boundary
  if (targetNode === rootEl) {
    let offset = 0;
    for (let i = 0; i < targetOffset && i < rootEl.childNodes.length; i++) {
      offset += rootEl.childNodes[i].textContent?.length ?? 0;
    }
    return offset;
  }

  return null;
}

interface TextSegment {
  text: string;
  start: number;
  end: number;
  highlightColor?: HighlightColor;
  highlightId?: string;
  isSearchMatch: boolean;
  isActiveSearchMatch: boolean;
}

function buildAnnotatedSegments(
  text: string,
  ranges: TextHighlightRange[],
  matches: SearchMatch[],
  activeMatchGlobalIndex: number
): TextSegment[] {
  const points = new Set<number>([0, text.length]);

  for (const r of ranges) {
    const s = Math.max(0, Math.min(text.length, r.start));
    const e = Math.max(0, Math.min(text.length, r.end));
    if (e > s) {
      points.add(s);
      points.add(e);
    }
  }

  for (const m of matches) {
    const s = Math.max(0, Math.min(text.length, m.start));
    const e = Math.max(0, Math.min(text.length, m.end));
    if (e > s) {
      points.add(s);
      points.add(e);
    }
  }

  const sorted = Array.from(points).sort((a, b) => a - b);
  const segments: TextSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;

    // Latest highlight covering this segment wins
    let matchedHighlight: TextHighlightRange | undefined;
    for (let rIdx = ranges.length - 1; rIdx >= 0; rIdx--) {
      const r = ranges[rIdx];
      if (r.start <= start && r.end >= end) {
        matchedHighlight = r;
        break;
      }
    }

    const matchedSearch = matches.find((m) => m.start <= start && m.end >= end);

    segments.push({
      text: text.slice(start, end),
      start,
      end,
      highlightColor: matchedHighlight?.color,
      highlightId: matchedHighlight?.id,
      isSearchMatch: Boolean(matchedSearch),
      isActiveSearchMatch:
        matchedSearch !== undefined &&
        matchedSearch.globalIndex === activeMatchGlobalIndex,
    });
  }

  return segments;
}

export function ScriptViewer({
  result,
  isGenerating,
  activeIndex,
  playbackStatus,
  onSelectParagraph,
  onTriggerUpload,
}: ScriptViewerProps) {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchCursor, setActiveMatchCursor] = useState(0);
  const [showAnnotatedOnly, setShowAnnotatedOnly] = useState(false);

  const [annotations, setAnnotations] = useState<DocumentAnnotations>({});
  const [openMemoIndex, setOpenMemoIndex] = useState<number | null>(null);
  const [memoDraft, setMemoDraft] = useState('');
  const [selectionPopover, setSelectionPopover] =
    useState<SelectionPopoverState | null>(null);

  const paragraphCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const paragraphTextRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Load saved annotations when document changes
  useEffect(() => {
    if (!result) {
      setAnnotations({});
      setSearchQuery('');
      setActiveMatchCursor(0);
      setOpenMemoIndex(null);
      setSelectionPopover(null);
      setShowAnnotatedOnly(false);
      return;
    }
    setAnnotations(loadAnnotations(result.fileName));
    setSearchQuery('');
    setActiveMatchCursor(0);
    setOpenMemoIndex(null);
    setSelectionPopover(null);
    setShowAnnotatedOnly(false);
  }, [result]);

  // Smoothly scroll currently playing paragraph into the vertical center of viewport
  useEffect(() => {
    if (activeIndex === null) return;
    const node = paragraphCardRefs.current[activeIndex];
    if (!node) return;

    const frameId = window.requestAnimationFrame(() => {
      node.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeIndex]);

  // Dismiss selection popover on Escape or scroll
  useEffect(() => {
    if (!selectionPopover) return;

    const dismiss = () => setSelectionPopover(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };

    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [selectionPopover]);

  // Compute all search matches across paragraphs
  const searchMatches = useMemo<SearchMatch[]>(() => {
    if (!result) return [];
    const trimmed = searchQuery.trim();
    if (!trimmed) return [];

    const needle = trimmed.toLowerCase();
    const matches: SearchMatch[] = [];
    let globalIndex = 0;

    result.paragraphs.forEach((paragraph, paragraphIndex) => {
      const haystack = paragraph.toLowerCase();
      let fromIndex = 0;
      while (fromIndex < haystack.length) {
        const foundAt = haystack.indexOf(needle, fromIndex);
        if (foundAt === -1) break;
        matches.push({
          paragraphIndex,
          start: foundAt,
          end: foundAt + trimmed.length,
          globalIndex,
        });
        globalIndex += 1;
        fromIndex = foundAt + Math.max(1, trimmed.length);
      }
    });

    return matches;
  }, [result, searchQuery]);

  // Reset match cursor when query changes
  useEffect(() => {
    setActiveMatchCursor(0);
  }, [searchQuery]);

  // Scroll to active search match smoothly when jumping between matches
  const scrollToMatch = (matchIndex: number) => {
    const match = searchMatches[matchIndex];
    if (!match) return;
    const card = paragraphCardRefs.current[match.paragraphIndex];
    if (card) {
      card.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const nextCursor =
      (activeMatchCursor - 1 + searchMatches.length) % searchMatches.length;
    setActiveMatchCursor(nextCursor);
    scrollToMatch(nextCursor);
  };

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextCursor = (activeMatchCursor + 1) % searchMatches.length;
    setActiveMatchCursor(nextCursor);
    scrollToMatch(nextCursor);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && searchMatches.length > 0) {
      event.preventDefault();
      if (event.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    } else if (event.key === 'Escape') {
      setSearchQuery('');
    }
  };

  const updateParagraphAnnotation = (
    paragraphIndex: number,
    updater: (current: ParagraphAnnotation) => ParagraphAnnotation
  ) => {
    if (!result) return;
    setAnnotations((prev) => {
      const existing: ParagraphAnnotation = prev[paragraphIndex] ?? { ranges: [] };
      const updated = updater(existing);
      const next: DocumentAnnotations = { ...prev };

      const isEmpty =
        !updated.paragraphHighlight &&
        updated.ranges.length === 0 &&
        (!updated.memo || updated.memo.trim().length === 0);

      if (isEmpty) {
        delete next[paragraphIndex];
      } else {
        next[paragraphIndex] = updated;
      }

      saveAnnotations(result.fileName, next);
      return next;
    });
  };

  const handleParagraphMouseUp = (paragraphIndex: number) => {
    const textEl = paragraphTextRefs.current[paragraphIndex];
    if (!textEl) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const range = selection.getRangeAt(0);
    if (
      !textEl.contains(range.startContainer) ||
      !textEl.contains(range.endContainer)
    ) {
      return;
    }

    const startOffset = getOffsetWithinElement(
      textEl,
      range.startContainer,
      range.startOffset
    );
    const endOffset = getOffsetWithinElement(
      textEl,
      range.endContainer,
      range.endOffset
    );

    if (
      startOffset === null ||
      endOffset === null ||
      endOffset <= startOffset
    ) {
      return;
    }

    const rect = range.getBoundingClientRect();
    const clampedX = Math.max(
      140,
      Math.min(window.innerWidth - 140, rect.left + rect.width / 2)
    );
    const clampedY = Math.max(64, rect.top - 10);

    setSelectionPopover({
      paragraphIndex,
      start: startOffset,
      end: endOffset,
      selectedText,
      x: clampedX,
      y: clampedY,
    });
  };

  const applySelectionHighlight = (color: HighlightColor) => {
    if (!selectionPopover) return;
    const { paragraphIndex, start, end } = selectionPopover;

    updateParagraphAnnotation(paragraphIndex, (current) => ({
      ...current,
      ranges: [
        ...current.ranges,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          start,
          end,
          color,
        },
      ],
    }));

    window.getSelection()?.removeAllRanges();
    setSelectionPopover(null);
  };

  const quoteSelectionToMemo = () => {
    if (!selectionPopover) return;
    const { paragraphIndex, selectedText } = selectionPopover;
    const existingMemo = annotations[paragraphIndex]?.memo ?? '';
    const quoteLine = `"${selectedText}"`;
    const nextDraft = existingMemo
      ? `${existingMemo}\n${quoteLine}`
      : `${quoteLine}\n`;

    setOpenMemoIndex(paragraphIndex);
    setMemoDraft(nextDraft);
    window.getSelection()?.removeAllRanges();
    setSelectionPopover(null);
  };

  const removeTextHighlight = (
    event: ReactMouseEvent,
    paragraphIndex: number,
    highlightId: string
  ) => {
    event.stopPropagation();
    updateParagraphAnnotation(paragraphIndex, (current) => ({
      ...current,
      ranges: current.ranges.filter((r) => r.id !== highlightId),
    }));
  };

  const toggleParagraphHighlight = (
    paragraphIndex: number,
    color?: HighlightColor
  ) => {
    updateParagraphAnnotation(paragraphIndex, (current) => ({
      ...current,
      paragraphHighlight:
        current.paragraphHighlight === color ? undefined : color,
    }));
  };

  const clearParagraphHighlights = (paragraphIndex: number) => {
    updateParagraphAnnotation(paragraphIndex, (current) => ({
      ...current,
      paragraphHighlight: undefined,
      ranges: [],
    }));
  };

  const openMemoEditor = (paragraphIndex: number) => {
    if (openMemoIndex === paragraphIndex) {
      setOpenMemoIndex(null);
      return;
    }
    setOpenMemoIndex(paragraphIndex);
    setMemoDraft(annotations[paragraphIndex]?.memo ?? '');
  };

  const saveMemo = (paragraphIndex: number) => {
    updateParagraphAnnotation(paragraphIndex, (current) => ({
      ...current,
      memo: memoDraft.trim() || undefined,
    }));
    setOpenMemoIndex(null);
  };

  const deleteMemo = (paragraphIndex: number) => {
    updateParagraphAnnotation(paragraphIndex, (current) => ({
      ...current,
      memo: undefined,
    }));
    setOpenMemoIndex(null);
  };

  const handleParagraphClick = (paragraphIndex: number) => {
    const selectedText = window.getSelection()?.toString().trim();
    if (selectedText && selectedText.length > 0) {
      // User was dragging to select/highlight text; don't interrupt with click-to-play
      return;
    }
    setSelectionPopover(null);
    onSelectParagraph(paragraphIndex);
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = result.script;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    downloadTextFile(result.script, result.fileName);
  };

  const annotatedCount = useMemo(() => {
    return Object.keys(annotations).length;
  }, [annotations]);

  const matchesByParagraph = useMemo(() => {
    const map = new Map<number, SearchMatch[]>();
    for (const match of searchMatches) {
      const list = map.get(match.paragraphIndex);
      if (list) {
        list.push(match);
      } else {
        map.set(match.paragraphIndex, [match]);
      }
    }
    return map;
  }, [searchMatches]);

  if (isGenerating) {
    return (
      <div className="p-6 sm:p-8 flex flex-col gap-6 transition-colors duration-300">
        <div className="flex items-center gap-3 pb-5 border-b border-slate-100 dark:border-slate-800">
          <Loader2
            className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              PDF 분석 및 낭독 대본 생성 중...
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              2단 레이아웃 순서 정리, 인용 제거 및 구어체 변환을 진행하고 있습니다.
            </p>
          </div>
        </div>

        <div className="space-y-6 animate-pulse" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-start gap-4">
              <div className="w-6 h-4 rounded bg-slate-100 dark:bg-slate-800 mt-1 shrink-0" />
              <div className="flex-1 space-y-2.5">
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-[94%]" />
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-[78%]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="px-6 py-16 sm:py-24 flex flex-col items-center justify-center text-center transition-colors duration-300">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors duration-300">
          <FileAudio2 className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
          변환된 오디오북 대본이 여기에 표시됩니다
        </h2>
        <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          좌측 패널에서 PDF 논문이나 리포트를 업로드하고 대본을 생성하면, 문단별 싱크 하이라이트·검색·형광펜 메모와 함께 바로 샘플 음성을 들어보실 수 있습니다.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
          <span>01. PDF 업로드</span>
          <span aria-hidden="true">·</span>
          <span>02. Gemini 전체 낭독 대본 생성</span>
          <span aria-hidden="true">·</span>
          <span>03. 문단 클릭 재생 및 형광펜 메모</span>
        </div>

        <button
          type="button"
          onClick={onTriggerUpload}
          className="mt-6 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium text-slate-800 dark:text-slate-200 transition-colors"
        >
          PDF 파일 선택하기
        </button>
      </div>
    );
  }

  const estimatedMinutes = estimateReadingMinutes(
    result.script,
    result.detectedLanguage === 'ko-KR'
  );
  const displayTitle = result.fileName.replace(/\.pdf$/i, '');
  const modeLabel =
    result.mode === 'ko-translate' ? '한국어 번역 정제' : '원문 낭독 정제';

  const visibleIndices = result.paragraphs
    .map((_, idx) => idx)
    .filter((idx) => !showAnnotatedOnly || Boolean(annotations[idx]));

  return (
    <div className="flex flex-col transition-colors duration-300">
      {/* Document Toolbar */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors duration-300">
        <div className="min-w-0">
          <h2
            className="text-base font-bold text-slate-900 dark:text-slate-100 truncate"
            title={displayTitle}
          >
            {displayTitle}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">{result.paragraphs.length}개 문단</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">예상 청취 약 {estimatedMinutes}분</span>
            <span aria-hidden="true">·</span>
            <span>{modeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>클릭 재생 / 드래그 형광펜</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {copied ? (
              <>
                <Check
                  className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span className="text-emerald-700 dark:text-emerald-300">복사됨</span>
              </>
            ) : (
              <>
                <Copy
                  className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                />
                <span>대본 복사</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Download
              className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400"
              aria-hidden="true"
            />
            <span>.txt 다운로드</span>
          </button>
        </div>
      </div>

      {/* Script Search & Annotation Filter Bar */}
      <div className="px-4 sm:px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2.5 transition-colors duration-300">
        <div className="relative flex-1 min-w-[200px] max-w-md flex items-center">
          <Search
            className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="대본 내 단어 또는 문구 검색..."
            aria-label="대본 검색"
            className="w-full h-8 pl-8 pr-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-colors duration-200"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              aria-label="검색어 지우기"
              className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {searchQuery.trim() && (
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 px-1.5">
                {searchMatches.length > 0
                  ? `${activeMatchCursor + 1} / ${searchMatches.length}`
                  : '0건'}
              </span>
              <button
                type="button"
                onClick={handlePrevMatch}
                disabled={searchMatches.length === 0}
                aria-label="이전 검색 결과"
                title="이전 검색 결과 (Shift+Enter)"
                className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleNextMatch}
                disabled={searchMatches.length === 0}
                aria-label="다음 검색 결과"
                title="다음 검색 결과 (Enter)"
                className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {annotatedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAnnotatedOnly((prev) => !prev)}
              className={`h-7 px-2.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                showAnnotatedOnly
                  ? 'border-amber-400 dark:border-amber-500/70 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Highlighter className="w-3 h-3" aria-hidden="true" />
              <span className="tabular-nums">형광펜·메모 ({annotatedCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Synced Paragraph List */}
      <div className="px-3 sm:px-6 py-5 sm:py-6">
        {visibleIndices.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            표시할 형광펜 또는 메모 문단이 없습니다.
          </div>
        ) : (
          <div className="max-w-[74ch] mx-auto space-y-2.5">
            {visibleIndices.map((index) => {
              const paragraph = result.paragraphs[index];
              const isActive = activeIndex === index;
              const isPlayingThis = isActive && playbackStatus === 'playing';
              const isPausedThis = isActive && playbackStatus === 'paused';
              const paddedIndex = String(index + 1).padStart(2, '0');
              const annotation = annotations[index];
              const paragraphHighlight = annotation?.paragraphHighlight;
              const hasRanges = (annotation?.ranges.length ?? 0) > 0;
              const hasMemo = Boolean(annotation?.memo);
              const isMemoOpen = openMemoIndex === index;
              const paraMatches = matchesByParagraph.get(index) ?? [];

              const segments = buildAnnotatedSegments(
                paragraph,
                annotation?.ranges ?? [],
                paraMatches,
                searchMatches.length > 0 ? activeMatchCursor : -1
              );

              const cardSurfaceClass = isActive
                ? 'bg-blue-50/85 dark:bg-blue-950/45 ring-1 ring-blue-200 dark:ring-blue-500/40 text-slate-950 dark:text-slate-50'
                : paragraphHighlight
                ? `${getSwatch(paragraphHighlight).cardClass} text-slate-900 dark:text-slate-100`
                : 'bg-transparent hover:bg-slate-50/90 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200';

              return (
                <div
                  key={`${index}-${paragraph.slice(0, 24)}`}
                  ref={(el) => {
                    paragraphCardRefs.current[index] = el;
                  }}
                  aria-current={isActive ? 'true' : undefined}
                  className={`group relative rounded-lg pl-4 pr-3.5 py-3.5 transition-colors duration-200 ${cardSurfaceClass}`}
                >
                  {/* Animated left vertical progress indicator bar for the active speaking paragraph */}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className={`absolute left-1.5 top-2.5 bottom-2.5 w-[3.5px] rounded-full origin-center transition-all duration-300 ${
                        isPlayingThis
                          ? 'bg-gradient-to-b from-blue-400 via-blue-600 to-indigo-500 dark:from-blue-300 dark:via-blue-500 dark:to-indigo-400 animate-speaking-bar shadow-[0_0_8px_rgba(37,99,235,0.45)]'
                          : isPausedThis
                          ? 'bg-blue-400/75 dark:bg-blue-500/70'
                          : 'bg-blue-500/60'
                      }`}
                    />
                  )}

                  <div className="flex items-start gap-3">
                    {/* Paragraph play trigger / animated equalizer */}
                    <button
                      type="button"
                      onClick={() => onSelectParagraph(index)}
                      aria-label={`${index + 1}번 문단부터 재생`}
                      title={`${index + 1}번 문단부터 재생`}
                      className="w-7 h-7 mt-0.5 shrink-0 rounded-md flex items-center justify-center hover:bg-blue-100/70 dark:hover:bg-blue-900/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      {isPlayingThis ? (
                        <span
                          className="inline-flex items-end gap-[2px] h-3.5"
                          aria-label="현재 낭독 진행 중"
                        >
                          <span className="w-[2.5px] h-full rounded-full bg-blue-600 dark:bg-blue-400 origin-bottom animate-eq-1" />
                          <span className="w-[2.5px] h-full rounded-full bg-blue-600 dark:bg-blue-400 origin-bottom animate-eq-2" />
                          <span className="w-[2.5px] h-full rounded-full bg-blue-600 dark:bg-blue-400 origin-bottom animate-eq-3" />
                        </span>
                      ) : (
                        <>
                          <span
                            className={`text-xs font-mono tabular-nums group-hover:hidden ${
                              isActive
                                ? 'text-blue-700 dark:text-blue-400 font-semibold'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {paddedIndex}
                          </span>
                          <Play
                            className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 hidden group-hover:block fill-current"
                            aria-hidden="true"
                          />
                        </>
                      )}
                    </button>

                    {/* Paragraph body + annotation controls */}
                    <div className="flex-1 min-w-0">
                      <p
                        ref={(el) => {
                          paragraphTextRefs.current[index] = el;
                        }}
                        onClick={() => handleParagraphClick(index)}
                        onMouseUp={() => handleParagraphMouseUp(index)}
                        className={`select-text cursor-pointer text-[15.5px] sm:text-[16px] leading-[1.85] tracking-[-0.01em] break-keep ${
                          isActive
                            ? 'text-slate-950 dark:text-white font-medium'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {segments.map((seg, segIdx) => {
                          if (!seg.highlightColor && !seg.isSearchMatch) {
                            return <span key={segIdx}>{seg.text}</span>;
                          }

                          const highlightStyle = seg.highlightColor
                            ? getSwatch(seg.highlightColor).markClass
                            : '';

                          const searchStyle = seg.isActiveSearchMatch
                            ? 'bg-orange-300 dark:bg-orange-500/80 text-slate-950 dark:text-white rounded-[3px] px-0.5 ring-1 ring-orange-500 dark:ring-orange-300'
                            : seg.isSearchMatch
                            ? 'bg-yellow-200 dark:bg-yellow-500/40 text-slate-950 dark:text-yellow-50 rounded-[3px] px-0.5'
                            : '';

                          return (
                            <mark
                              key={segIdx}
                              onClick={
                                seg.highlightId && !seg.isSearchMatch
                                  ? (e) =>
                                      removeTextHighlight(
                                        e,
                                        index,
                                        seg.highlightId!
                                      )
                                  : undefined
                              }
                              title={
                                seg.highlightId && !seg.isSearchMatch
                                  ? '클릭하여 형광펜 표시 제거'
                                  : undefined
                              }
                              className={`${
                                seg.isSearchMatch ? searchStyle : highlightStyle
                              } ${
                                seg.highlightId && !seg.isSearchMatch
                                  ? 'cursor-pointer hover:opacity-80'
                                  : ''
                              }`}
                            >
                              {seg.text}
                            </mark>
                          );
                        })}
                      </p>

                      {/* Quiet paragraph highlight & memo actions */}
                      <div
                        className={`mt-2 flex flex-wrap items-center justify-between gap-2 transition-opacity duration-150 ${
                          paragraphHighlight || hasRanges || hasMemo || isMemoOpen || isActive
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {HIGHLIGHT_SWATCHES.map((swatch) => {
                            const selected = paragraphHighlight === swatch.color;
                            return (
                              <button
                                key={swatch.color}
                                type="button"
                                onClick={() =>
                                  toggleParagraphHighlight(index, swatch.color)
                                }
                                aria-label={`문단 ${swatch.label}`}
                                title={`문단 전체 ${swatch.label}`}
                                className={`w-4 h-4 rounded-full border transition-transform ${
                                  swatch.dotClass
                                } ${
                                  selected
                                    ? 'scale-110 ring-2 ring-offset-1 ring-slate-400 dark:ring-slate-500 dark:ring-offset-slate-900'
                                    : 'opacity-75 hover:opacity-100 hover:scale-110'
                                }`}
                              />
                            );
                          })}

                          {(paragraphHighlight || hasRanges) && (
                            <button
                              type="button"
                              onClick={() => clearParagraphHighlights(index)}
                              aria-label="문단 형광펜 모두 지우기"
                              title="형광펜 모두 지우기"
                              className="ml-0.5 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                            >
                              <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openMemoEditor(index)}
                            className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                              hasMemo || isMemoOpen
                                ? 'text-blue-700 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-900/40'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                            }`}
                          >
                            <StickyNote className="w-3 h-3" aria-hidden="true" />
                            <span>{hasMemo ? '메모 편집' : '메모'}</span>
                          </button>
                        </div>

                        {isPlayingThis && (
                          <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                            낭독 진행 중
                          </span>
                        )}
                      </div>

                      {/* Saved Memo Display */}
                      {hasMemo && !isMemoOpen && (
                        <div className="mt-2.5 rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-800/80 px-3 py-2.5 flex items-start justify-between gap-3 transition-colors duration-300">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              내 메모
                            </p>
                            <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                              {annotation?.memo}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openMemoEditor(index)}
                              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteMemo(index)}
                              aria-label="메모 삭제"
                              className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inline Memo Editor */}
                      {isMemoOpen && (
                        <div className="mt-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-3 space-y-2.5 transition-colors duration-300">
                          <textarea
                            rows={2}
                            value={memoDraft}
                            onChange={(e) => setMemoDraft(e.target.value)}
                            placeholder="이 문단에 대한 핵심 요약이나 질문을 메모해 두세요..."
                            className="w-full resize-y rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 px-2.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                          />
                          <div className="flex items-center justify-end gap-2">
                            {hasMemo && (
                              <button
                                type="button"
                                onClick={() => deleteMemo(index)}
                                className="mr-auto text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                              >
                                메모 삭제
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setOpenMemoIndex(null)}
                              className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => saveMemo(index)}
                              className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                            >
                              메모 저장
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Selection Highlighter Popover (on mouse drag) */}
      {selectionPopover && (
        <div
          role="toolbar"
          aria-label="선택 텍스트 형광펜 도구"
          style={{
            left: `${selectionPopover.x}px`,
            top: `${selectionPopover.y}px`,
          }}
          className="fixed z-40 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg px-2 py-1.5 flex items-center gap-1.5"
        >
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 pl-1 pr-0.5 whitespace-nowrap">
            형광펜
          </span>
          {HIGHLIGHT_SWATCHES.map((swatch) => (
            <button
              key={swatch.color}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySelectionHighlight(swatch.color)}
              aria-label={swatch.label}
              title={swatch.label}
              className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${swatch.dotClass}`}
            />
          ))}
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={quoteSelectionToMemo}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap transition-colors"
          >
            <Quote className="w-3 h-3" aria-hidden="true" />
            <span>메모 인용</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSelectionPopover(null)}
            aria-label="닫기"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
