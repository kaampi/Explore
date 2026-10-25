import { useEffect, useRef, useState } from "react";
import { AUDIO_ACCEPT, addAudioTrack, defaultAudioPreferences, deleteAudioTrack, loadAudioBlob, loadAudioLibrary, saveAudioPreferences, type AudioPreferences, type AudioTrack } from "./audioStorage";

/** Mounted per conversation. Playback always requires an explicit Play click. */
export function GameAudio({ conversationId }: { conversationId: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const mounted = useRef(true);
  const operation = useRef(false);
  const queue = useRef(Promise.resolve());
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [preferences, setPreferences] = useState(() => defaultAudioPreferences(conversationId));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = tracks.find(track => track.id === preferences.trackId);

  async function load() {
    try {
      const saved = await loadAudioLibrary(conversationId);
      if (!mounted.current) return;
      setTracks(saved.tracks);
      setPreferences(saved.preferences);
      setReady(true);
      setError("");
    } catch { if (mounted.current) setError("Could not load your audio library. Try again."); }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    const element = audio.current;
    return () => { mounted.current = false; element?.pause(); };
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    audio.current?.pause();
    setPlaying(false);
    setUrl(null);
    if (selected) {
      void loadAudioBlob(selected.id).then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }).catch(() => { if (!cancelled) setError("Could not read this track. Try adding the file again."); });
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected?.id]);
  useEffect(() => { if (audio.current) audio.current.volume = preferences.volume; }, [preferences.volume, url]);

  function change(next: AudioPreferences) {
    setPreferences(next);
    queue.current = queue.current.then(() => saveAudioPreferences(next)).then(() => {
      if (mounted.current) setSaveError(false);
    }).catch(() => { if (mounted.current) setSaveError(true); });
  }
  async function upload(file: File) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const track = await addAudioTrack(file);
      if (!mounted.current) return;
      setTracks(current => [...current, track]);
      change({ ...preferences, trackId: track.id });
      setNotice("Track added. Press Play when you are ready.");
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Could not save this track."); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  async function remove() {
    if (!selected || operation.current) return;
    if (!window.confirm(`Remove “${selected.name}” from the audio library? This removes it from all conversations.`)) return;
    operation.current = true; setBusy(true); setError("");
    try {
      // Complete queued preference writes before clearing all references atomically.
      await queue.current;
      await deleteAudioTrack(selected.id);
      if (!mounted.current) return;
      setTracks(current => current.filter(track => track.id !== selected.id));
      setPreferences(current => ({ ...current, trackId: null }));
      setNotice("Track removed from the library.");
    } catch { if (mounted.current) setError("Could not remove the track. Try again."); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  async function toggle() {
    const element = audio.current;
    if (!element) return;
    setError("");
    if (!element.paused) { element.pause(); return; }
    try { await element.play(); }
    catch { if (mounted.current) setError("This track could not be played. Try another file or audio format."); }
  }
  return (
    <div className="sb-game-audio">
      <audio ref={audio} src={url ?? undefined} loop={preferences.loop} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError("This audio format could not be played. Try another file."); }} />
      <details>
        <summary>♫ Sound{playing ? " · playing" : ""}</summary>
        <div className="sb-game-audio__settings">
          <p>Your soundtrack</p>
          <label>Track
            <select value={selected?.id ?? ""} disabled={!ready || busy} onChange={event => { setError(""); setNotice(""); change({ ...preferences, trackId: event.target.value || null }); }}>
              <option value="">No soundtrack</option>
              {tracks.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
            </select>
          </label>
          <div className="sb-game-audio__actions">
            <button type="button" disabled={!url || busy} onClick={() => void toggle()}>{playing ? "Pause soundtrack" : "Play soundtrack"}</button>
            <button type="button" disabled={!selected || busy} onClick={() => void remove()}>Remove track</button>
          </div>
          <label>Soundtrack volume · {Math.round(preferences.volume * 100)}%
            <input type="range" min="0" max="100" value={Math.round(preferences.volume * 100)} disabled={!ready || busy} onChange={event => change({ ...preferences, volume: Number(event.target.value) / 100 })} />
          </label>
          <label className="sb-game-audio__loop"><input type="checkbox" checked={preferences.loop} disabled={!ready || busy} onChange={event => change({ ...preferences, loop: event.target.checked })} />Loop track</label>
          <label>Add your own track
            <input type="file" accept={AUDIO_ACCEPT} disabled={!ready || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
          </label>
          <small>MP3, OGG, WAV, M4A, AAC or WebM · up to 50 MB each. Saved in this browser. Choose separately for each conversation; playback starts with Play.</small>
          {busy && <span role="status">Saving audio…</span>}
          {notice && <span role="status">{notice}</span>}
          {error && <div role="alert">{error}{!ready && <button type="button" onClick={() => void load()}>Try again</button>}</div>}
          {saveError && <div role="alert">Audio preferences could not be saved.<button type="button" onClick={() => change(preferences)}>Retry save</button></div>}
        </div>
      </details>
      {selected && <button type="button" className="sb-game-audio__quick" disabled={!url || busy} aria-label={playing ? "Pause soundtrack" : "Play soundtrack"} title={selected.name} onClick={() => void toggle()}>{playing ? "Ⅱ" : "▶"}</button>}
    </div>
  );
}
