import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectedLanguage, PlaybackStatus } from '../types/audiobook';

interface UseSpeechPlayerOptions {
  paragraphs: string[];
  targetLanguage: DetectedLanguage;
}

export interface SpeechPlayerState {
  isSupported: boolean;
  status: PlaybackStatus;
  activeIndex: number | null;
  rate: number;
  pitch: number;
  volume: number;
  isMuted: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  speechError: string | null;
  playFromIndex: (index: number) => void;
  togglePlayPause: () => void;
  stop: () => void;
  skipPrev: () => void;
  skipNext: () => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setVoiceURI: (voiceURI: string) => void;
}

function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  targetLang: DetectedLanguage
): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined;
  const normalizedTarget = targetLang.toLowerCase();
  const langPrefix = normalizedTarget.split('-')[0];

  const exactMatches = voices.filter(
    (v) => v.lang.toLowerCase().replace('_', '-') === normalizedTarget
  );
  const prefixMatches = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(langPrefix)
  );

  const candidates = exactMatches.length > 0 ? exactMatches : prefixMatches;
  if (candidates.length === 0) return voices[0];

  const preferred = candidates.find((v) =>
    /natural|google|yuna|sora|samantha|enhanced|premium/i.test(v.name)
  );
  return preferred ?? candidates.find((v) => v.default) ?? candidates[0];
}

interface SpeechOverrides {
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceURI?: string;
}

export function useSpeechPlayer({
  paragraphs,
  targetLanguage,
}: UseSpeechPlayerOptions): SpeechPlayerState {
  const isSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [rate, setRateState] = useState<number>(1.0);
  const [pitch, setPitchState] = useState<number>(1.0);
  const [volume, setVolumeState] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const sessionIdRef = useRef(0);
  const paragraphsRef = useRef<string[]>(paragraphs);
  const rateRef = useRef<number>(rate);
  const pitchRef = useRef<number>(pitch);
  const volumeRef = useRef<number>(volume);
  const lastNonZeroVolumeRef = useRef<number>(1.0);
  const voiceURIRef = useRef<string>(selectedVoiceURI);
  const voicesRef = useRef<SpeechSynthesisVoice[]>(voices);
  const targetLangRef = useRef<DetectedLanguage>(targetLanguage);
  const activeIndexRef = useRef<number | null>(activeIndex);
  const statusRef = useRef<PlaybackStatus>(status);

  paragraphsRef.current = paragraphs;
  rateRef.current = rate;
  pitchRef.current = pitch;
  volumeRef.current = isMuted ? 0 : volume;
  voiceURIRef.current = selectedVoiceURI;
  voicesRef.current = voices;
  targetLangRef.current = targetLanguage;
  activeIndexRef.current = activeIndex;
  statusRef.current = status;

  useEffect(() => {
    if (!isSupported) return;
    const synth = window.speechSynthesis;

    const loadVoices = () => {
      const available = synth.getVoices();
      if (available.length > 0) {
        setVoices(available);
      }
    };

    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => {
      synth.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported]);

  useEffect(() => {
    if (voices.length === 0) return;
    const best = pickBestVoice(voices, targetLanguage);
    if (best) {
      setSelectedVoiceURI(best.voiceURI);
      voiceURIRef.current = best.voiceURI;
    }
  }, [voices, targetLanguage]);

  useEffect(() => {
    if (!isSupported) return;
    sessionIdRef.current += 1;
    window.speechSynthesis.cancel();
    setStatus('idle');
    setActiveIndex(null);
    setSpeechError(null);

    return () => {
      sessionIdRef.current += 1;
      window.speechSynthesis.cancel();
    };
  }, [isSupported, paragraphs]);

  const speakParagraph = useCallback(
    (index: number, overrides?: SpeechOverrides) => {
      if (!isSupported) return;
      const list = paragraphsRef.current;
      if (index < 0 || index >= list.length) {
        sessionIdRef.current += 1;
        window.speechSynthesis.cancel();
        setStatus('idle');
        setActiveIndex(null);
        return;
      }

      const synth = window.speechSynthesis;
      sessionIdRef.current += 1;
      const currentSession = sessionIdRef.current;

      synth.cancel();
      setSpeechError(null);
      setActiveIndex(index);
      setStatus('playing');

      const utterance = new SpeechSynthesisUtterance(list[index]);
      const effectiveRate = overrides?.rate ?? rateRef.current;
      const effectivePitch = overrides?.pitch ?? pitchRef.current;
      const effectiveVolume = overrides?.volume ?? volumeRef.current;
      const effectiveVoiceURI = overrides?.voiceURI ?? voiceURIRef.current;

      utterance.rate = Math.max(0.5, Math.min(2.0, effectiveRate));
      utterance.pitch = Math.max(0.5, Math.min(1.5, effectivePitch));
      utterance.volume = Math.max(0, Math.min(1, effectiveVolume));
      utterance.lang = targetLangRef.current;

      const matchedVoice = voicesRef.current.find(
        (v) => v.voiceURI === effectiveVoiceURI
      );
      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang;
      }

      utterance.onend = () => {
        if (sessionIdRef.current !== currentSession) return;
        const nextIndex = index + 1;
        if (nextIndex < paragraphsRef.current.length) {
          speakParagraph(nextIndex);
        } else {
          setStatus('idle');
          setActiveIndex(null);
        }
      };

      utterance.onerror = (event) => {
        if (sessionIdRef.current !== currentSession) return;
        if (event.error === 'canceled' || event.error === 'interrupted') {
          return;
        }
        setStatus('idle');
        setSpeechError(
          '브라우저 음성 재생 중 오류가 발생했습니다. 다른 음성을 선택하거나 다시 재생해 주세요.'
        );
      };

      synth.speak(utterance);
    },
    [isSupported]
  );

  const playFromIndex = useCallback(
    (index: number) => {
      speakParagraph(index);
    },
    [speakParagraph]
  );

  const togglePlayPause = useCallback(() => {
    if (!isSupported || paragraphsRef.current.length === 0) return;
    const synth = window.speechSynthesis;

    if (statusRef.current === 'playing') {
      synth.pause();
      setStatus('paused');
      return;
    }

    if (statusRef.current === 'paused') {
      if (synth.paused) {
        synth.resume();
        setStatus('playing');
      } else {
        speakParagraph(activeIndexRef.current ?? 0);
      }
      return;
    }

    speakParagraph(activeIndexRef.current ?? 0);
  }, [isSupported, speakParagraph]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    sessionIdRef.current += 1;
    window.speechSynthesis.cancel();
    setStatus('idle');
    setActiveIndex(null);
    setSpeechError(null);
  }, [isSupported]);

  const skipPrev = useCallback(() => {
    if (paragraphsRef.current.length === 0) return;
    const current = activeIndexRef.current ?? 0;
    const prev = Math.max(0, current - 1);
    speakParagraph(prev);
  }, [speakParagraph]);

  const skipNext = useCallback(() => {
    if (paragraphsRef.current.length === 0) return;
    const current = activeIndexRef.current ?? -1;
    const next = Math.min(paragraphsRef.current.length - 1, current + 1);
    speakParagraph(next);
  }, [speakParagraph]);

  const setRate = useCallback(
    (newRate: number) => {
      const clamped = Math.round(Math.max(0.5, Math.min(2.0, newRate)) * 10) / 10;
      setRateState(clamped);
      rateRef.current = clamped;
      if (statusRef.current === 'playing' && activeIndexRef.current !== null) {
        speakParagraph(activeIndexRef.current, { rate: clamped });
      }
    },
    [speakParagraph]
  );

  const setPitch = useCallback(
    (newPitch: number) => {
      const clamped = Math.round(Math.max(0.5, Math.min(1.5, newPitch)) * 20) / 20;
      setPitchState(clamped);
      pitchRef.current = clamped;
      if (statusRef.current === 'playing' && activeIndexRef.current !== null) {
        speakParagraph(activeIndexRef.current, { pitch: clamped });
      }
    },
    [speakParagraph]
  );

  const setVolume = useCallback(
    (newVolume: number) => {
      const clamped = Math.round(Math.max(0, Math.min(1, newVolume)) * 20) / 20;
      setVolumeState(clamped);
      if (clamped > 0) {
        lastNonZeroVolumeRef.current = clamped;
        setIsMuted(false);
      } else {
        setIsMuted(true);
      }
      volumeRef.current = clamped;
      if (statusRef.current === 'playing' && activeIndexRef.current !== null) {
        speakParagraph(activeIndexRef.current, { volume: clamped });
      }
    },
    [speakParagraph]
  );

  const toggleMute = useCallback(() => {
    if (isMuted || volumeRef.current === 0) {
      const restored = lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 1.0;
      setIsMuted(false);
      setVolumeState(restored);
      volumeRef.current = restored;
      if (statusRef.current === 'playing' && activeIndexRef.current !== null) {
        speakParagraph(activeIndexRef.current, { volume: restored });
      }
    } else {
      lastNonZeroVolumeRef.current = volumeRef.current;
      setIsMuted(true);
      volumeRef.current = 0;
      if (statusRef.current === 'playing' && activeIndexRef.current !== null) {
        speakParagraph(activeIndexRef.current, { volume: 0 });
      }
    }
  }, [isMuted, speakParagraph]);

  const setVoiceURI = useCallback(
    (newURI: string) => {
      setSelectedVoiceURI(newURI);
      voiceURIRef.current = newURI;
      if (statusRef.current === 'playing' && activeIndexRef.current !== null) {
        speakParagraph(activeIndexRef.current, { voiceURI: newURI });
      }
    },
    [speakParagraph]
  );

  const sortedVoices = useMemo(() => {
    const prefix = targetLanguage.toLowerCase().split('-')[0];
    return [...voices].sort((a, b) => {
      const aMatch = a.lang.toLowerCase().startsWith(prefix) ? 0 : 1;
      const bMatch = b.lang.toLowerCase().startsWith(prefix) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.name.localeCompare(b.name);
    });
  }, [voices, targetLanguage]);

  return {
    isSupported,
    status,
    activeIndex,
    rate,
    pitch,
    volume: isMuted ? 0 : volume,
    isMuted,
    voices: sortedVoices,
    selectedVoiceURI,
    speechError,
    playFromIndex,
    togglePlayPause,
    stop,
    skipPrev,
    skipNext,
    setRate,
    setPitch,
    setVolume,
    toggleMute,
    setVoiceURI,
  };
}
