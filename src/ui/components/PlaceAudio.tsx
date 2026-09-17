import { useEffect, useRef, useState } from "react";
import type { PicturePlay } from "@state/StateSchema";

const MUTE_KEY = "sandbox-place-audio-muted";
const VOLUME_KEY = "sandbox-place-audio-volume";
const DEFAULT_VOLUME = 0.7;
const FADE_MS = 4000;
const HOLD_MS = 24000;

function readMuted(): boolean {
  try {
    return sessionStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    sessionStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}

function readVolume(): number {
  try {
    const stored = sessionStorage.getItem(VOLUME_KEY);
    if (stored === null) return DEFAULT_VOLUME;
    return clampVolume(Number(stored));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeVolume(volume: number) {
  try {
    sessionStorage.setItem(VOLUME_KEY, String(clampVolume(volume)));
  } catch {
    /* ignore */
  }
}

function tryPlay(el: HTMLAudioElement) {
  el.muted = false;
  return el.play().then(
    () => true,
    () => false
  );
}

function clipKey(clips: string[]): string {
  return clips.map((clip) => `${clip.length}:${clip.slice(5, 32)}`).join("|");
}

function usePlayableUrls(clips: string[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  const key = clipKey(clips);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    setUrls([]);
    void (async () => {
      const out: string[] = [];
      for (const src of clips) {
        if (!src.startsWith("data:")) {
          out.push(src);
          continue;
        }
        try {
          const blob = await fetch(src).then((response) => response.blob());
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          created.push(objectUrl);
          out.push(objectUrl);
        } catch {
          out.push(src);
        }
      }
      if (!cancelled) setUrls(out);
    })();
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [key]);

  return urls;
}

/**
 * Looping place/room ambient. Autoplay is often blocked after Start; the
 * control stays "play sound" until a click actually starts the loop.
 * Volume and mute are player UI — not sent to the model.
 */
export function PlaceAudio({
  clips,
  play,
  locationKey
}: {
  clips: string[];
  play: PicturePlay;
  locationKey: string;
}) {
  const aRef = useRef<HTMLAudioElement | null>(null);
  const bRef = useRef<HTMLAudioElement | null>(null);
  const frontIsA = useRef(true);
  const indexRef = useRef(0);
  const mixRef = useRef({ a: 1, b: 0 });
  const volumeRef = useRef(readVolume());
  const mutedRef = useRef(readMuted());
  const urlsRef = useRef<string[]>([]);
  const [muted, setMuted] = useState(readMuted);
  const [volume, setVolume] = useState(readVolume);
  const [playing, setPlaying] = useState(false);
  const urls = usePlayableUrls(clips);
  const n = urls.length;
  const fading = play === "fade" && n > 1;

  volumeRef.current = volume;
  mutedRef.current = muted;
  urlsRef.current = urls;

  function applyGains() {
    const master = mutedRef.current ? 0 : clampVolume(volumeRef.current);
    if (aRef.current) aRef.current.volume = clampVolume(mixRef.current.a * master);
    if (bRef.current) bRef.current.volume = clampVolume(mixRef.current.b * master);
  }

  function frontEl() {
    return frontIsA.current ? aRef.current : bRef.current;
  }

  function backEl() {
    return frontIsA.current ? bRef.current : aRef.current;
  }

  useEffect(() => {
    if (n === 0) return;
    const start = play === "random" && n > 1 ? Math.floor(Math.random() * n) : 0;
    indexRef.current = start;
    frontIsA.current = true;
    mixRef.current = { a: 1, b: 0 };
    const a = aRef.current;
    const b = bRef.current;
    if (a && urls[start]) {
      a.src = urls[start];
      a.loop = true;
    }
    if (b) {
      b.pause();
      b.removeAttribute("src");
      b.load();
    }
    applyGains();
  }, [locationKey, play, n, urls]);

  useEffect(() => {
    applyGains();
    const el = frontEl();
    if (muted) {
      aRef.current?.pause();
      bRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (el?.src) void tryPlay(el).then((ok) => setPlaying(ok));
  }, [muted, volume, locationKey, n, urls]);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a) return;
    const sync = () => setPlaying(!a.paused || Boolean(b && !b.paused));
    a.addEventListener("playing", sync);
    a.addEventListener("pause", sync);
    b?.addEventListener("playing", sync);
    b?.addEventListener("pause", sync);
    const unlock = () => {
      const el = frontEl();
      if (!mutedRef.current && el?.src) void tryPlay(el).then(sync);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      a.removeEventListener("playing", sync);
      a.removeEventListener("pause", sync);
      b?.removeEventListener("playing", sync);
      b?.removeEventListener("pause", sync);
    };
  }, [fading, urls]);

  useEffect(() => {
    if (!fading || n < 2) return;
    let fadeGen = 0;
    const hold = window.setInterval(() => {
      if (mutedRef.current) return;
      const list = urlsRef.current;
      if (list.length < 2) return;
      const outgoing = frontEl();
      const incoming = backEl();
      if (!outgoing || !incoming) return;
      const next = (indexRef.current + 1) % list.length;
      const gen = ++fadeGen;
      incoming.src = list[next] ?? "";
      incoming.loop = true;
      incoming.currentTime = 0;
      void tryPlay(incoming);
      const startA = mixRef.current.a;
      const startB = mixRef.current.b;
      const endA = frontIsA.current ? 0 : 1;
      const endB = frontIsA.current ? 1 : 0;
      const started = performance.now();
      const tick = (now: number) => {
        if (gen !== fadeGen) return;
        const t = Math.min(1, (now - started) / FADE_MS);
        mixRef.current = {
          a: startA + (endA - startA) * t,
          b: startB + (endB - startB) * t
        };
        applyGains();
        if (t < 1) {
          requestAnimationFrame(tick);
          return;
        }
        outgoing.pause();
        frontIsA.current = !frontIsA.current;
        indexRef.current = next;
      };
      requestAnimationFrame(tick);
    }, HOLD_MS);
    return () => {
      fadeGen += 1;
      window.clearInterval(hold);
    };
  }, [fading, n, locationKey]);

  const waiting = !muted && !playing;
  const percent = Math.round(clampVolume(volume) * 100);

  function applyVolume(next: number) {
    const clamped = clampVolume(next);
    setVolume(clamped);
    writeVolume(clamped);
    volumeRef.current = clamped;
    applyGains();
    if (!muted) {
      const el = frontEl();
      if (el) void tryPlay(el).then((ok) => setPlaying(ok));
    }
  }

  if (clips.length === 0) return null;

  return (
    <div className="chat-audio">
      <audio ref={aRef} className="chat-place-audio" loop preload="auto" />
      {fading ? <audio ref={bRef} className="chat-place-audio" loop preload="auto" /> : null}
      <button
        type="button"
        className="chat-audio-toggle"
        aria-pressed={!waiting && !muted}
        onClick={() => {
          if (waiting || muted) {
            setMuted(false);
            writeMuted(false);
            mutedRef.current = false;
            applyGains();
            const el = frontEl();
            if (el) void tryPlay(el).then((ok) => setPlaying(ok));
            return;
          }
          setMuted(true);
          writeMuted(true);
          mutedRef.current = true;
          aRef.current?.pause();
          bRef.current?.pause();
          setPlaying(false);
        }}
        title={waiting || muted ? "Play place sound" : "Turn place sound off"}
      >
        {waiting || muted ? "play sound" : "sound off"}
      </button>
      <input
        className="chat-audio__volume"
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label="Place sound volume"
        title={`Volume ${percent}%`}
        onChange={(e) => applyVolume(Number(e.target.value) / 100)}
      />
    </div>
  );
}
