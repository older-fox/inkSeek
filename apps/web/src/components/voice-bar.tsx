import type { ChatMessageVoiceSummary } from '@inkseek/shared';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

const WAVE_BARS = [
  0.34, 0.58, 0.82, 0.46, 0.96, 0.68, 0.42, 0.88, 0.52, 0.74, 0.38, 0.62, 0.9, 0.48, 0.78, 0.56,
  0.32, 0.7,
];

/** Renders a duration in seconds as m:ss, falling back to 0:00 for bad input. */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Inline voice-message player with a scrubbable waveform, plus the optional
 * transcript. Playback stops on unmount so navigating away never leaks audio.
 */
export function VoiceBar({ voice, self }: { voice: ChatMessageVoiceSummary; self: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(voice.duration ?? 0);
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    /** Mirrors playback position into state so the waveform fill follows the clip. */
    const onTime = () => setPosition(audio.currentTime);
    /** Adopts the decoded duration, ignoring NaN or zero so the metadata-less fallback stays usable. */
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    /** Rewinds to the start on finish so the next play begins from 0 rather than the end. */
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
      audio.currentTime = 0;
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
      // Switching conversation or closing a forward must not leave audio playing.
      audio.pause();
    };
  }, []);

  /** Play/pause; skipped when the element is missing or already failed, and a rejected play() counts as a failure. */
  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (audio.paused) {
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setFailed(true));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  /** Jumps to a 0–1 waveform position; a no-op until a real duration is known, so scrubbing can't produce NaN. */
  const seekTo = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !(audio.duration > 0)) return;
    audio.currentTime = ratio * audio.duration;
    setPosition(audio.currentTime);
  };

  return (
    <div
      className={cn(
        'flex w-[13.5rem] flex-col rounded-2xl px-3 py-2',
        self
          ? 'rounded-br-md border border-brass-400/20 bg-brass-400/[0.12]'
          : 'rounded-bl-md border border-mist-100/[0.07] bg-ink-950/35',
      )}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={failed}
          aria-label={failed ? '语音加载失败' : playing ? '暂停语音' : '播放语音'}
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full border transition disabled:opacity-40',
            self
              ? 'border-brass-400/30 bg-brass-400/15 text-brass-200 hover:bg-brass-400/25'
              : 'border-mist-100/10 bg-mist-100/5 text-mist-200 hover:bg-mist-100/10',
          )}
        >
          {playing ? (
            <Pause className="size-3.5" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 size-3.5" fill="currentColor" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width > 0) seekTo((event.clientX - rect.left) / rect.width);
            }}
            aria-label="跳转播放位置"
            className="flex h-6 w-full items-end gap-[2px]"
          >
            {WAVE_BARS.map((height, index) => {
              const active = (index + 0.5) / WAVE_BARS.length <= progress;
              return (
                <span
                  key={index}
                  style={{ height: `${Math.round(height * 100)}%` }}
                  className={cn(
                    'flex-1 rounded-full transition-colors duration-150',
                    active ? (self ? 'bg-brass-300' : 'bg-jade-300') : 'bg-mist-100/20',
                  )}
                />
              );
            })}
          </button>
          <p className="mt-1 flex items-center justify-between font-mono text-[0.48rem] text-mist-500">
            <span>{formatClock(playing ? position : duration)}</span>
            <span className="uppercase tracking-[0.14em]">{failed ? '加载失败' : '语音'}</span>
          </p>
        </div>
      </div>

      {voice.description ? (
        <p
          className={cn(
            'mt-2 whitespace-pre-wrap break-words border-t pt-2 text-[0.62rem] leading-relaxed',
            self ? 'border-brass-400/20 text-brass-100/85' : 'border-mist-100/10 text-mist-300',
          )}
        >
          {voice.description}
        </p>
      ) : null}

      <audio
        ref={audioRef}
        src={voice.url}
        preload="metadata"
        className="hidden"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
