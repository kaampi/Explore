export interface AudioTrack {
  id: string;
  name: string;
  bytes: number;
  type: string;
}
export interface AudioPreferences {
  conversationId: string;
  trackId: string | null;
  volume: number;
  loop: boolean;
}
export const AUDIO_ACCEPT = ".mp3,.ogg,.wav,.m4a,.aac,.webm,audio/*";
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export function defaultAudioPreferences(conversationId: string): AudioPreferences {
  return { conversationId, trackId: null, volume: 0.4, loop: true };
}

// UI media stays separate from sessions, AI context and library exports.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sandboxai-audio", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("tracks", { keyPath: "id" });
      request.result.createObjectStore("audio");
      request.result.createObjectStore("settings", { keyPath: "conversationId" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Audio storage is unavailable."));
    request.onblocked = () => reject(new Error("Close other Sandbox tabs and try again."));
  });
}
async function transaction<T>(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? new Error("Audio changes could not be saved. Check browser storage."));
      tx.onerror = () => reject(tx.error ?? new Error("Audio storage is unavailable."));
      try { run(tx, next => { value = next; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
export async function loadAudioLibrary(conversationId: string): Promise<{ tracks: AudioTrack[]; preferences: AudioPreferences }> {
  return transaction(["tracks", "settings"], "readonly", (tx, result) => {
    let tracks: AudioTrack[] = [];
    let preferences = defaultAudioPreferences(conversationId);
    const list = tx.objectStore("tracks").getAll();
    const settings = tx.objectStore("settings").get(conversationId);
    list.onsuccess = () => { tracks = list.result; done(); };
    settings.onsuccess = () => { preferences = settings.result ?? preferences; done(); };
    function done() { result({ tracks, preferences }); }
  });
}
export async function loadAudioBlob(id: string): Promise<Blob> {
  return transaction(["audio"], "readonly", (tx, result) => {
    const request = tx.objectStore("audio").get(id);
    request.onsuccess = () => {
      if (!request.result) { tx.abort(); return; }
      result(request.result);
    };
  });
}
export async function saveAudioPreferences(preferences: AudioPreferences): Promise<void> {
  if (!Number.isFinite(preferences.volume) || preferences.volume < 0 || preferences.volume > 1)
    throw new Error("Choose a volume between 0 and 100%.");
  return transaction(["settings"], "readwrite", tx => { tx.objectStore("settings").put(preferences); });
}
export async function addAudioTrack(file: File): Promise<AudioTrack> {
  if (!/\.(mp3|ogg|wav|m4a|aac|webm)$/i.test(file.name))
    throw new Error("Choose an MP3, OGG, WAV, M4A, AAC or WebM audio file.");
  if (!file.size) throw new Error("This audio file is empty.");
  if (file.size > MAX_AUDIO_BYTES) throw new Error("Choose a track smaller than 50 MB.");
  const track: AudioTrack = { id: crypto.randomUUID(), name: file.name.slice(0, 180), bytes: file.size, type: file.type };
  // Store a Blob rather than a base64 string or a path to the original file.
  const blob = file.slice(0, file.size, file.type);
  return transaction(["tracks", "audio"], "readwrite", (tx, result) => {
    tx.objectStore("tracks").add(track);
    tx.objectStore("audio").add(blob, track.id);
    result(track);
  });
}
export async function deleteAudioTrack(id: string): Promise<void> {
  return transaction(["tracks", "audio", "settings"], "readwrite", tx => {
    tx.objectStore("tracks").delete(id);
    tx.objectStore("audio").delete(id);
    const cursor = tx.objectStore("settings").openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      const preferences = row.value as AudioPreferences;
      if (preferences.trackId === id) row.update({ ...preferences, trackId: null });
      row.continue();
    };
  });
}
