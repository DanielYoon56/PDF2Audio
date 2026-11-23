import {
  AlertCircle,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react';
import type { PlaybackRate } from '../types/audiobook';
import type { SpeechPlayerState } from '../hooks/useSpeechPlayer';

interface AudioPlayerBarProps {
  player: SpeechPlayerState;
  totalParagraphs: number;
  disabled?: boolean;
}

const SPEED_OPTIONS: readonly PlaybackRate[] = [0.8, 1.0, 1.2, 1.5];

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

  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200 rounded-t-xl">
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Playback controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={player.skipPrev}
            disabled={isDisabled || (player.activeIndex ?? 0) <= 0}
            aria-label="이전 문단"
            title="이전 문단"
            className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <SkipBack className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={player.togglePlayPause}
            disabled={isDisabled}
            aria-label={player.status === 'playing' ? '일시정지' : '재생'}
            className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
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
            aria-label="정지"
            title="정지"
            className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
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
            aria-label="다음 문단"
            title="다음 문단"
            className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <SkipForward className="w-4 h-4" aria-hidden="true" />
          </button>

          <span className="ml-1 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
            {currentDisplayIndex} / {totalParagraphs}
          </span>
        </div>

        {/* Speed & Voice selectors */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Speed segmented control */}
          <div
            role="group"
            aria-label="재생 배속"
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/80"
          >
            {SPEED_OPTIONS.map((speed) => {
              const active = player.rate === speed;
              return (
                <button
                  key={speed}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => player.setRate(speed)}
                  className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    active
                      ? 'bg-white text-slate-900 font-medium shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {speed.toFixed(1)}x
                </button>
              );
            })}
          </div>

          {/* Voice dropdown */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Volume2
              className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block"
              aria-hidden="true"
            />
            <select
              aria-label="낭독 음성 선택"
              disabled={isDisabled || player.voices.length === 0}
              value={player.selectedVoiceURI}
              onChange={(e) => player.setVoiceURI(e.target.value)}
              className="h-8 max-w-[175px] sm:max-w-[210px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
            >
              {player.voices.length === 0 ? (
                <option value="">기본 브라우저 음성</option>
              ) : (
                player.voices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Unsupported or speech error notice */}
      {!player.isSupported && (
        <div className="px-4 sm:px-6 pb-3 flex items-center gap-2 text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            현재 브라우저에서는 Web Speech API 음성 재생을 지원하지 않습니다. 대본 복사 또는 .txt 다운로드를 이용해 주세요.
          </span>
        </div>
      )}

      {player.speechError && (
        <div
          role="alert"
          className="px-4 sm:px-6 pb-3 flex items-center gap-2 text-xs text-red-700"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{player.speechError}</span>
        </div>
      )}

      {/* Subtle reading progress bar */}
      <div className="h-[2px] w-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
