import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sliders,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { SpeechPlayerState } from '../hooks/useSpeechPlayer';

interface AudioPlayerBarProps {
  player: SpeechPlayerState;
  totalParagraphs: number;
  disabled?: boolean;
}

export function AudioPlayerBar({
  player,
  totalParagraphs,
  disabled = false,
}: AudioPlayerBarProps) {
  const isDisabled = disabled || !player.isSupported || totalParagraphs === 0;
  const currentDisplayIndex =
    player.activeIndex !== null ? player.activeIndex + 1 : 0;
  const progressPercent =
    totalParagraphs > 0 && player.activeIndex !== null
      ? Math.min(100, ((player.activeIndex + 1) / totalParagraphs) * 100)
      : 0;

  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const [showFloatingDock, setShowFloatingDock] = useState(false);

  const voiceMenuRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const selectedVoice = player.voices.find(
    (v) => v.voiceURI === player.selectedVoiceURI
  );

  // Close custom voice dropdown on outside click or Escape
  useEffect(() => {
    if (!isVoiceMenuOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        voiceMenuRef.current &&
        !voiceMenuRef.current.contains(event.target as Node)
      ) {
        setIsVoiceMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsVoiceMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVoiceMenuOpen]);

  // Show compact fixed bottom dock when top player scrolls out of view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const scrolledPastTop = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
        setShowFloatingDock(scrolledPastTop);
      },
      { threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={sentinelRef}
        className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 rounded-t-xl transition-colors duration-300"
      >
        {/* Row 1: Primary Playback Controls & Custom Voice Dropdown */}
        <div className="px-4 sm:px-6 pt-3.5 pb-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={player.skipPrev}
              disabled={isDisabled || (player.activeIndex ?? 0) <= 0}
              aria-label="이전 문단 (←)"
              title="이전 문단 (←)"
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors duration-200"
            >
              <SkipBack className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={player.togglePlayPause}
              disabled={isDisabled}
              aria-label={player.status === 'playing' ? '일시정지 (Space)' : '재생 (Space)'}
              title="재생 / 일시정지 (Space)"
              className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs font-semibold transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
            >
              {player.status === 'playing' ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>일시정지</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>{player.status === 'paused' ? '이어듣기' : '재생'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={player.stop}
              disabled={isDisabled || player.status === 'idle'}
              aria-label="정지 (Esc)"
              title="정지 (Esc)"
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors duration-200"
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={player.skipNext}
              disabled={
                isDisabled ||
                (player.activeIndex !== null &&
                  player.activeIndex >= totalParagraphs - 1)
              }
              aria-label="다음 문단 (→)"
              title="다음 문단 (→)"
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors duration-200"
            >
              <SkipForward className="w-4 h-4" aria-hidden="true" />
            </button>

            <span className="ml-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {currentDisplayIndex} / {totalParagraphs}
            </span>
          </div>

          {/* Custom Voice Dropdown Menu */}
          <div ref={voiceMenuRef} className="relative min-w-0">
            <button
              type="button"
              disabled={isDisabled || player.voices.length === 0}
              onClick={() => setIsVoiceMenuOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isVoiceMenuOpen}
              aria-label="시스템 음성 선택"
              className="h-9 max-w-[230px] sm:max-w-[260px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-between gap-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <Sliders className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                <span className="truncate font-medium">
                  {selectedVoice
                    ? `${selectedVoice.name}`
                    : '기본 브라우저 음성'}
                </span>
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                  isVoiceMenuOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {isVoiceMenuOpen && player.voices.length > 0 && (
              <div
                role="listbox"
                aria-label="사용 가능한 시스템 음성 목록"
                className="absolute right-0 mt-1.5 z-40 w-72 sm:w-80 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5"
              >
                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                  <span>설치된 시스템 음성</span>
                  <span className="font-mono tabular-nums">{player.voices.length}개</span>
                </div>
                {player.voices.map((voice) => {
                  const isSelected = voice.voiceURI === player.selectedVoiceURI;
                  return (
                    <button
                      key={voice.voiceURI}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        player.setVoiceURI(voice.voiceURI);
                        setIsVoiceMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{voice.name}</span>
                        <span className="block text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {voice.lang}
                          {voice.localService ? ' · 로컬' : ' · 네트워크'}
                        </span>
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Speed (0.5x–2.0x), Pitch (0.5–1.5), Volume (0–100%) Sliders */}
        <div className="px-4 sm:px-6 pb-3 pt-1 flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
          {/* Speed Slider */}
          <label className="flex items-center gap-2 min-w-[165px] flex-1 sm:flex-none">
            <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap w-7">
              배속
            </span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              disabled={isDisabled}
              value={player.rate}
              onChange={(e) => player.setRate(parseFloat(e.target.value))}
              aria-label="재생 배속 조절"
              className="w-24 sm:w-28 accent-blue-600 dark:accent-blue-500 cursor-pointer disabled:opacity-40"
            />
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 w-9 text-right">
              {player.rate.toFixed(1)}x
            </span>
          </label>

          {/* Pitch Slider */}
          <label className="flex items-center gap-2 min-w-[165px] flex-1 sm:flex-none">
            <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap w-7">
              음높이
            </span>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              disabled={isDisabled}
              value={player.pitch}
              onChange={(e) => player.setPitch(parseFloat(e.target.value))}
              aria-label="음성 피치 조절"
              className="w-24 sm:w-28 accent-blue-600 dark:accent-blue-500 cursor-pointer disabled:opacity-40"
            />
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 w-9 text-right">
              {player.pitch.toFixed(2)}
            </span>
          </label>

          {/* Volume Slider */}
          <div className="flex items-center gap-2 min-w-[165px] flex-1 sm:flex-none">
            <button
              type="button"
              onClick={player.toggleMute}
              disabled={isDisabled}
              aria-label={player.isMuted || player.volume === 0 ? '음소거 해제' : '음소거'}
              title={player.isMuted || player.volume === 0 ? '음소거 해제' : '음소거'}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 transition-colors"
            >
              {player.isMuted || player.volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-500" aria-hidden="true" />
              ) : (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              disabled={isDisabled}
              value={player.volume}
              onChange={(e) => player.setVolume(parseFloat(e.target.value))}
              aria-label="음성 볼륨 조절"
              className="w-24 sm:w-28 accent-blue-600 dark:accent-blue-500 cursor-pointer disabled:opacity-40"
            />
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200 w-9 text-right">
              {Math.round(player.volume * 100)}%
            </span>
          </div>

          <span className="hidden xl:inline ml-auto text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
            단축키: Space 재생 · ←/→ 문단 이동 · Esc 정지
          </span>
        </div>

        {!player.isSupported && (
          <div className="px-4 sm:px-6 pb-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              현재 브라우저에서는 Web Speech API 음성 재생을 지원하지 않습니다. 대본 복사, .txt 또는 PDF 저장을 이용해 주세요.
            </span>
          </div>
        )}

        {player.speechError && (
          <div
            role="alert"
            className="px-4 sm:px-6 pb-3 flex items-center gap-2 text-xs text-red-700 dark:text-red-300"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{player.speechError}</span>
          </div>
        )}

        <div className="h-[2px] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden transition-colors duration-300">
          <div
            className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Compact Floating Bottom Player when scrolled past the top player */}
      {showFloatingDock && !isDisabled && (
        <div
          role="region"
          aria-label="하단 고정 미니 오디오 플레이어"
          className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-xl rounded-xl border border-slate-200/90 dark:border-slate-700/90 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-lg px-3 py-2 transition-all duration-200"
        >
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={player.skipPrev}
                disabled={(player.activeIndex ?? 0) <= 0}
                aria-label="이전 문단"
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                <SkipBack className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={player.togglePlayPause}
                aria-label={player.status === 'playing' ? '일시정지' : '재생'}
                className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                {player.status === 'playing' ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                    <span>일시정지</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                    <span>재생</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={player.stop}
                disabled={player.status === 'idle'}
                aria-label="정지"
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={player.skipNext}
                disabled={
                  player.activeIndex !== null &&
                  player.activeIndex >= totalParagraphs - 1
                }
                aria-label="다음 문단"
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                {currentDisplayIndex} / {totalParagraphs}
              </span>

              <div className="hidden sm:flex items-center gap-1.5">
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={player.rate}
                  onChange={(e) => player.setRate(parseFloat(e.target.value))}
                  aria-label="하단 배속 조절"
                  className="w-16 accent-blue-600 cursor-pointer"
                />
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 w-8">
                  {player.rate.toFixed(1)}x
                </span>
              </div>

              <button
                type="button"
                onClick={player.toggleMute}
                aria-label={player.isMuted || player.volume === 0 ? '음소거 해제' : '음소거'}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors shrink-0"
              >
                {player.isMuted || player.volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-500" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="mt-1.5 h-[2px] w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
