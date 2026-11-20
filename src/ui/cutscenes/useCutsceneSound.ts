import { useEffect, useRef, useState } from "react";
import type { playbackFrame } from "../../cutscenes/playback";

type Cue = NonNullable<ReturnType<typeof playbackFrame>["cue"]>;
export type CutsceneSound = {
  enabled: boolean;
  volume: number;
  loadTrack: (id: string) => Promise<Blob | null>;
};

type Track = {
  audio: HTMLAudioElement;
  url: string;
  frame: number;
  cue: Cue;
};

function release(track: Track) {
  cancelAnimationFrame(track.frame);
  track.audio.pause();
  URL.revokeObjectURL(track.url);
}

function fade(track: Track, to: number, seconds: number, onDone?: () => void) {
  cancelAnimationFrame(track.frame);
  if (!seconds) {
    track.audio.volume = to;
    onDone?.();
    return;
  }
  const from = track.audio.volume;
  const start = performance.now();
  function tick(now: number) {
    const position = Math.min(1, (now - start) / (seconds * 1000));
    track.audio.volume = Math.min(1, Math.max(0, from + (to - from) * position));
    if (position === 1) onDone?.();
    else track.frame = requestAnimationFrame(tick);
  }
  track.frame = requestAnimationFrame(tick);
}

const volumeFor = (cue: Cue, volume: number) => Math.min(1, Math.max(0, cue.cell.volume * volume));

/** Playback owns only its media elements and read-only blob loads. */
export function useCutsceneSound(
  options: CutsceneSound,
  cue: Cue | undefined,
  music: Cue | undefined,
  paused: boolean,
  ended: boolean,
) {
  const { enabled, loadTrack, volume } = options;
  const runtime = useRef<{ music?: Track; effects: Set<Track> }>({ effects: new Set() });
  const params = useRef({ volume, paused });
  params.current = { volume, paused };
  const [audible, setAudible] = useState<ReadonlySet<number>>(() => new Set());
  const cueFade = useRef(0);
  cueFade.current = cue?.cell.fadeSeconds ?? 0;
  const cueStep = cue?.step;
  const effect = cue?.cell.action === "effect" ? cue : undefined;

  useEffect(() => {
    const tracks = runtime.current;
    return () => {
      if (tracks.music) release(tracks.music);
      for (const track of tracks.effects) release(track);
      tracks.effects.clear();
      delete tracks.music;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const queues = runtime.current;
    const previous = queues.music;
    if (previous) {
      delete queues.music;
      const seconds = ended ? 1 : enabled ? cueFade.current : 0;
      fade(previous, 0, seconds, () => release(previous));
    }
    const trackId = music?.cell.trackId;
    if (enabled && music && !ended && trackId) {
      void Promise.resolve()
        .then(() => (cancelled ? null : loadTrack(trackId)))
        .then(async (blob) => {
          if (cancelled || !blob) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          const track = { audio, url, frame: 0, cue: music };
          queues.music = track;
          audio.loop = true;
          audio.volume = music.cell.fadeSeconds ? 0 : volumeFor(music, params.current.volume);
          if (params.current.paused) return;
          try {
            await audio.play();
            if (cancelled) return;
            setAudible((held) => new Set([...held, music.step]));
            fade(track, volumeFor(music, params.current.volume), music.cell.fadeSeconds);
          } catch {
            if (queues.music === track) delete queues.music;
            release(track);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, loadTrack, music, ended]);

  useEffect(() => {
    let cancelled = false;
    const queues = runtime.current;
    const trackId = effect?.cell.trackId;
    if (enabled && !ended && effect && trackId) {
      void Promise.resolve()
        .then(() => (cancelled ? null : loadTrack(trackId)))
        .then(async (blob) => {
          if (!blob || cancelled) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          const track = { audio, url, frame: 0, cue: effect };
          queues.effects.add(track);
          audio.volume = effect.cell.fadeSeconds ? 0 : volumeFor(effect, params.current.volume);
          audio.onended = () => {
            queues.effects.delete(track);
            release(track);
          };
          if (params.current.paused) return;
          try {
            await audio.play();
            if (!queues.effects.has(track)) return;
            setAudible((held) => new Set([...held, effect.step]));
            fade(track, volumeFor(effect, params.current.volume), effect.cell.fadeSeconds);
          } catch {
            queues.effects.delete(track);
            release(track);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [effect, enabled, ended, loadTrack]);

  useEffect(() => {
    const queues = runtime.current;
    if (ended || !enabled) {
      for (const track of queues.effects) release(track);
      queues.effects.clear();
      return;
    }
    for (const track of [...queues.effects, ...(queues.music ? [queues.music] : [])]) {
      if (paused) {
        cancelAnimationFrame(track.frame);
        track.audio.pause();
      } else {
        track.audio.volume = volumeFor(track.cue, volume);
        if (track.audio.paused)
          void track.audio
            .play()
            .then(() => setAudible((held) => new Set([...held, track.cue.step])))
            .catch(() => {});
      }
    }
  }, [paused, ended, enabled, volume]);

  return cueStep !== undefined &&
    (!enabled || volume <= 0 || cue?.cell.volume === 0 || !audible.has(cueStep))
    ? cue?.cell.caption
    : "";
}
