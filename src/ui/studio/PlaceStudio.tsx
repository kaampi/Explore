import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import {
  formatTagList,
  newPlaceTemplate,
  newRealmTemplate,
  parseTagList,
  type LibrarySource,
  type PlaceTemplate,
  type RealmTemplate
} from "@library/LibrarySchema";
import {
  examplePlaceTemplate,
  exampleRealmTemplates,
  EXAMPLE_PLACE_ID,
  mergeWithExamples,
  withAuroraRoomIntros
} from "@library/exampleTemplates";
import { withOriginalTimestamps } from "@library/fromForm";
import {
  collectPlacePictures,
  MAX_PLACE_PICTURES,
  persistPlacePictures,
  picturePlayOf,
  type PlacePicture,
  type PicturePlay
} from "@state/placePictures";
import {
  audioPlayOf,
  collectPlaceAudio,
  MAX_PLACE_AUDIO,
  persistPlaceAudio
} from "@state/placeAudio";
import { StudioList } from "./StudioList";
import { FormSection } from "./FormSection";
import { SheetNameField } from "./SheetNameField";
import { confirmRemove, shelfCaption, sourceCaption } from "./studioShared";
import { PortraitError, sceneImagesFromFile } from "./portrait";
import { AmbientAudioError, ambientAudioFromFile } from "./ambientAudio";

type RoomDraft = {
  id: string;
  label: string;
  description: string;
  brief: string;
  keywords: string;
  fromRoomIds: string[];
  gate: "open" | "locked" | "hidden";
  pictures: PlacePicture[];
  picturePlay: PicturePlay;
  clips: string[];
  audioPlay: PicturePlay;
};

type Draft = {
  id: string | null;
  realmId: string;
  name: string;
  lighting: string;
  noise: string;
  music: boolean;
  note: string;
  brief: string;
  pictures: PlacePicture[];
  picturePlay: PicturePlay;
  clips: string[];
  audioPlay: PicturePlay;
  tags: string;
  rooms: RoomDraft[];
  source: LibrarySource;
  createdAt?: string;
};

function emptyRoom(): RoomDraft {
  return {
    id: crypto.randomUUID(),
    label: "",
    description: "",
    brief: "",
    keywords: "",
    fromRoomIds: [],
    gate: "open",
    pictures: [],
    picturePlay: "fade",
    clips: [],
    audioPlay: "fade"
  };
}

const FLOOR_FOCAL_ID = "__floor__";

type RealmDraft = {
  id: string | null;
  name: string;
  note: string;
  brief: string;
  pictures: PlacePicture[];
  picturePlay: PicturePlay;
  clips: string[];
  audioPlay: PicturePlay;
  source: LibrarySource;
  createdAt?: string;
};

function emptyRealmDraft(): RealmDraft {
  return {
    id: null,
    name: "",
    note: "",
    brief: "",
    pictures: [],
    picturePlay: "fade",
    clips: [],
    audioPlay: "fade",
    source: "player"
  };
}

function realmDraftFrom(template: RealmTemplate): RealmDraft {
  return {
    id: template.id,
    name: template.name,
    note: template.note,
    brief: template.brief ?? "",
    pictures: collectPlacePictures(template),
    picturePlay: picturePlayOf(template),
    clips: collectPlaceAudio(template),
    audioPlay: audioPlayOf(template),
    source: template.source,
    createdAt: template.createdAt
  };
}

function emptyDraft(realmId: string): Draft {
  return {
    id: null,
    realmId,
    name: "",
    lighting: "",
    noise: "",
    music: false,
    note: "",
    brief: "",
    pictures: [],
    picturePlay: "fade",
    clips: [],
    audioPlay: "fade",
    tags: "",
    rooms: [],
    source: "player"
  };
}

function withExampleRooms(template: PlaceTemplate): PlaceTemplate {
  if (template.id !== EXAMPLE_PLACE_ID) return template;
  return { ...template, rooms: withAuroraRoomIntros(template.rooms) };
}

function draftFrom(template: PlaceTemplate): Draft {
  return {
    id: template.id,
    realmId: template.realmId,
    name: template.name,
    lighting: template.lighting,
    noise: template.noise,
    music: template.music,
    note: template.note,
    brief: template.brief ?? "",
    pictures: collectPlacePictures(template),
    picturePlay: picturePlayOf(template),
    clips: collectPlaceAudio(template),
    audioPlay: audioPlayOf(template),
    tags: formatTagList(template.tags ?? []),
    rooms: (template.id === EXAMPLE_PLACE_ID ? withAuroraRoomIntros(template.rooms) : template.rooms ?? []).map((room) => ({
      id: room.id,
      label: room.label,
      description: room.description ?? "",
      brief: room.brief ?? "",
      keywords: formatTagList(room.keywords ?? []),
      fromRoomIds: room.fromRoomIds ?? [],
      gate: room.gate === "locked" || room.gate === "hidden" ? room.gate : "open",
      pictures: collectPlacePictures(room),
      picturePlay: picturePlayOf(room),
      clips: collectPlaceAudio(room),
      audioPlay: audioPlayOf(room)
    })),
    source: template.source,
    createdAt: template.createdAt
  };
}

function PictureStrip({
  pictures,
  play,
  busy,
  onAdd,
  onRemove,
  onPlay
}: {
  pictures: PlacePicture[];
  play: PicturePlay;
  busy: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onPlay: (play: PicturePlay) => void;
}) {
  return (
    <div className="studio-gallery">
      {pictures.length === 0 ? (
        <div className="studio-portrait__empty" aria-hidden="true" />
      ) : (
        <div className="studio-gallery__row">
          {pictures.map((picture, index) => (
            <div key={`${index}:${picture.thumbDataUrl.slice(-24)}`} className="studio-gallery__item">
              <img src={picture.thumbDataUrl} alt="" />
              <button type="button" className="setup-text-btn" disabled={busy} onClick={() => onRemove(index)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="studio-portrait__actions">
        <button
          type="button"
          className="setup-text-btn"
          disabled={busy || pictures.length >= MAX_PLACE_PICTURES}
          title={pictures.length >= MAX_PLACE_PICTURES ? "Six pictures max" : undefined}
          onClick={onAdd}
        >
          {pictures.length === 0 ? "Add picture" : "Add another"}
        </button>
      </div>
      {pictures.length > 1 ? (
        <label className="setup-field">
          Several pictures
          <select value={play} onChange={(e) => onPlay(e.target.value === "random" ? "random" : "fade")}>
            <option value="fade">Fade slowly</option>
            <option value="random">Pick one when you enter</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

function SoundStrip({
  clips,
  play,
  busy,
  onAdd,
  onRemove,
  onPlay
}: {
  clips: string[];
  play: PicturePlay;
  busy: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onPlay: (play: PicturePlay) => void;
}) {
  return (
    <div className="studio-gallery">
      {clips.length > 0 ? (
        <div className="studio-gallery__row">
          {clips.map((clip, index) => (
            <div key={`${index}:${clip.slice(-24)}`} className="studio-gallery__item">
              <div className="studio-gallery__sound">Loop {index + 1}</div>
              <button type="button" className="setup-text-btn" disabled={busy} onClick={() => onRemove(index)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="studio-portrait__actions">
        <button
          type="button"
          className="setup-text-btn"
          disabled={busy || clips.length >= MAX_PLACE_AUDIO}
          title={clips.length >= MAX_PLACE_AUDIO ? "Four loops max" : undefined}
          onClick={onAdd}
        >
          {clips.length === 0 ? "Add sound" : "Add another"}
        </button>
      </div>
      {clips.length > 1 ? (
        <label className="setup-field">
          Several loops
          <select value={play} onChange={(e) => onPlay(e.target.value === "random" ? "random" : "fade")}>
            <option value="fade">Fade slowly</option>
            <option value="random">Pick one when you enter</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function PlaceStudio({ repo }: { repo: IndexedDBRepository }) {
  const [library, setLibrary] = useState<PlaceTemplate[]>([]);
  const [realms, setRealms] = useState<RealmTemplate[]>([]);
  const [selectedRealmId, setSelectedRealmId] = useState<string | null>(null);
  const [realmDraft, setRealmDraft] = useState<RealmDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFocalId, setSelectedFocalId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const venueRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<HTMLInputElement>(null);
  const roomTargetRef = useRef<string | null>(null);
  const venueAudioRef = useRef<HTMLInputElement>(null);
  const roomAudioRef = useRef<HTMLInputElement>(null);
  const roomAudioTargetRef = useRef<string | null>(null);
  const realmPicRef = useRef<HTMLInputElement>(null);
  const realmAudioRef = useRef<HTMLInputElement>(null);
  const openGen = useRef(0);

  async function refresh() {
    const [nextPlaces, nextRealms] = await Promise.all([repo.listPlaces(), repo.listRealms()]);
    setLibrary(nextPlaces);
    setRealms(nextRealms);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([repo.listPlaces(), repo.listRealms()])
      .then(([nextPlaces, nextRealms]) => {
        if (cancelled) return;
        setLibrary(nextPlaces);
        setRealms(nextRealms);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load locations.");
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const savedPlaceIds = new Set(library.map((item) => item.id));
  const savedRealmIds = new Set(realms.map((item) => item.id));
  const visibleRealms = mergeWithExamples(realms, exampleRealmTemplates());
  const aurora = examplePlaceTemplate();
  const visiblePlaces = mergeWithExamples(library, [aurora]);
  const selectedRealm = visibleRealms.find((item) => item.id === selectedRealmId) ?? null;
  const landmarks = selectedRealmId ? visiblePlaces.filter((item) => item.realmId === selectedRealmId) : [];

  function openRealm(id: string) {
    const item = visibleRealms.find((row) => row.id === id);
    if (!item) return;
    setSelectedRealmId(id);
    setRealmDraft(realmDraftFrom(item));
    setSelectedId(null);
    setDraft(null);
    setSelectedFocalId(null);
    setError(null);
    setNotice(null);
  }

  function backToRealms() {
    setSelectedRealmId(null);
    setRealmDraft(null);
    setSelectedId(null);
    setDraft(null);
    setSelectedFocalId(null);
    setError(null);
    setNotice(null);
  }

  function open(id: string) {
    const gen = ++openGen.current;
    setSelectedId(id);
    setSelectedFocalId(FLOOR_FOCAL_ID);
    setError(null);
    setNotice(null);
    if (savedPlaceIds.has(id)) {
      void repo
        .loadPlace(id)
        .then((loaded) => {
          if (openGen.current !== gen) return;
          setDraft(draftFrom(withExampleRooms(loaded)));
        })
        .catch(() => {
          if (openGen.current !== gen) return;
          const fromLibrary = visiblePlaces.find((item) => item.id === id);
          setDraft(draftFrom(withExampleRooms(fromLibrary ?? examplePlaceTemplate())));
        });
      return;
    }
    const fromLibrary = visiblePlaces.find((item) => item.id === id);
    setDraft(draftFrom(withExampleRooms(fromLibrary ?? examplePlaceTemplate())));
  }

  async function appendVenuePictures(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const pairs: PlacePicture[] = [];
      for (const file of list) {
        pairs.push(await sceneImagesFromFile(file));
      }
      setDraft((current) => {
        if (!current) return current;
        return { ...current, pictures: [...current.pictures, ...pairs].slice(0, MAX_PLACE_PICTURES) };
      });
    } catch (err) {
      setError(err instanceof PortraitError ? err.message : "Could not read that image.");
    } finally {
      setBusy(false);
      if (venueRef.current) venueRef.current.value = "";
    }
  }

  function removeVenuePicture(index: number) {
    setDraft((current) => {
      if (!current) return current;
      const pictures = current.pictures.filter((_, i) => i !== index);
      return { ...current, pictures, picturePlay: pictures.length > 1 ? current.picturePlay : "fade" };
    });
  }

  async function appendRoomPictures(roomId: string, files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const pairs: PlacePicture[] = [];
      for (const file of list) {
        pairs.push(await sceneImagesFromFile(file));
      }
      setDraft((current) =>
        current
          ? {
              ...current,
              rooms: current.rooms.map((room) =>
                room.id === roomId
                  ? { ...room, pictures: [...room.pictures, ...pairs].slice(0, MAX_PLACE_PICTURES) }
                  : room
              )
            }
          : current
      );
    } catch (err) {
      setError(err instanceof PortraitError ? err.message : "Could not read that image.");
    } finally {
      setBusy(false);
      if (roomRef.current) roomRef.current.value = "";
    }
  }

  function removeRoomPicture(roomId: string, index: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            rooms: current.rooms.map((room) => {
              if (room.id !== roomId) return room;
              const pictures = room.pictures.filter((_, i) => i !== index);
              return { ...room, pictures, picturePlay: pictures.length > 1 ? room.picturePlay : "fade" };
            })
          }
        : current
    );
  }

  function removeVenueClip(index: number) {
    setDraft((current) => {
      if (!current) return current;
      const clips = current.clips.filter((_, i) => i !== index);
      return { ...current, clips, audioPlay: clips.length > 1 ? current.audioPlay : "fade" };
    });
  }

  async function appendRealmPictures(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const pairs: PlacePicture[] = [];
      for (const file of list) {
        pairs.push(await sceneImagesFromFile(file));
      }
      setRealmDraft((current) => {
        if (!current) return current;
        return { ...current, pictures: [...current.pictures, ...pairs].slice(0, MAX_PLACE_PICTURES) };
      });
    } catch (err) {
      setError(err instanceof PortraitError ? err.message : "Could not read that image.");
    } finally {
      setBusy(false);
      if (realmPicRef.current) realmPicRef.current.value = "";
    }
  }

  function removeRealmPicture(index: number) {
    setRealmDraft((current) => {
      if (!current) return current;
      const pictures = current.pictures.filter((_, i) => i !== index);
      return { ...current, pictures, picturePlay: pictures.length > 1 ? current.picturePlay : "fade" };
    });
  }

  async function appendRealmClips(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const clips: string[] = [];
      for (const file of list) {
        clips.push(await ambientAudioFromFile(file));
      }
      setRealmDraft((current) => {
        if (!current) return current;
        return { ...current, clips: [...current.clips, ...clips].slice(0, MAX_PLACE_AUDIO) };
      });
    } catch (err) {
      setError(err instanceof AmbientAudioError ? err.message : "Could not read that sound.");
    } finally {
      setBusy(false);
      if (realmAudioRef.current) realmAudioRef.current.value = "";
    }
  }

  function removeRealmClip(index: number) {
    setRealmDraft((current) => {
      if (!current) return current;
      const clips = current.clips.filter((_, i) => i !== index);
      return { ...current, clips, audioPlay: clips.length > 1 ? current.audioPlay : "fade" };
    });
  }

  async function appendVenueClips(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const clips: string[] = [];
      for (const file of list) {
        clips.push(await ambientAudioFromFile(file));
      }
      setDraft((current) => {
        if (!current) return current;
        return { ...current, clips: [...current.clips, ...clips].slice(0, MAX_PLACE_AUDIO) };
      });
    } catch (err) {
      setError(err instanceof AmbientAudioError ? err.message : "Could not read that sound.");
    } finally {
      setBusy(false);
      if (venueAudioRef.current) venueAudioRef.current.value = "";
    }
  }

  function removeRoomClip(roomId: string, index: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            rooms: current.rooms.map((room) => {
              if (room.id !== roomId) return room;
              const clips = room.clips.filter((_, i) => i !== index);
              return { ...room, clips, audioPlay: clips.length > 1 ? room.audioPlay : "fade" };
            })
          }
        : current
    );
  }

  async function appendRoomClips(roomId: string, files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const clips: string[] = [];
      for (const file of list) {
        clips.push(await ambientAudioFromFile(file));
      }
      setDraft((current) =>
        current
          ? {
              ...current,
              rooms: current.rooms.map((room) =>
                room.id === roomId ? { ...room, clips: [...room.clips, ...clips].slice(0, MAX_PLACE_AUDIO) } : room
              )
            }
          : current
      );
    } catch (err) {
      setError(err instanceof AmbientAudioError ? err.message : "Could not read that sound.");
    } finally {
      setBusy(false);
      if (roomAudioRef.current) roomAudioRef.current.value = "";
    }
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Name this landmark.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rooms = draft.rooms
        .map((room) => ({
          id: room.id,
          label: room.label.trim(),
          description: room.description.trim(),
          ...(room.brief.trim() ? { brief: room.brief.trim() } : {}),
          keywords: parseTagList(room.keywords),
          ...((room.fromRoomIds ?? []).filter(Boolean).length > 0
            ? { fromRoomIds: room.fromRoomIds.filter(Boolean) }
            : {}),
          ...(room.gate && room.gate !== "open" ? { gate: room.gate } : {}),
          ...persistPlacePictures(room.pictures, room.picturePlay),
          ...persistPlaceAudio(room.clips, room.audioPlay)
        }))
        .filter((room) => room.label);
      const built = newPlaceTemplate({
        ...(draft.id ? { id: draft.id } : {}),
        realmId: draft.realmId,
        name,
        lighting: draft.lighting,
        noise: draft.noise,
        music: draft.music,
        note: draft.note,
        ...(draft.brief.trim() ? { brief: draft.brief.trim() } : {}),
        tags: parseTagList(draft.tags),
        source: draft.source,
        ...persistPlacePictures(draft.pictures, draft.picturePlay),
        ...persistPlaceAudio(draft.clips, draft.audioPlay),
        rooms
      });
      const previous = library.find((item) => item.id === built.id);
      const savedPlace = withOriginalTimestamps(built, previous ?? (draft.createdAt ? { createdAt: draft.createdAt } : undefined));
      const realmCard = visibleRealms.find((item) => item.id === savedPlace.realmId);
      if (realmCard && !savedRealmIds.has(realmCard.id)) {
        await repo.saveRealm(realmCard);
      }
      await repo.savePlace(savedPlace);
      await refresh();
      setSelectedId(savedPlace.id);
      setDraft(draftFrom(savedPlace));
      setSelectedFocalId((current) => current ?? FLOOR_FOCAL_ID);
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRealm() {
    if (!realmDraft) return;
    const name = realmDraft.name.trim();
    if (!name) {
      setError("Name this realm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const built = newRealmTemplate({
        ...(realmDraft.id ? { id: realmDraft.id } : {}),
        name,
        note: realmDraft.note,
        ...(realmDraft.brief.trim() ? { brief: realmDraft.brief.trim() } : {}),
        source: realmDraft.source,
        ...persistPlacePictures(realmDraft.pictures, realmDraft.picturePlay),
        ...persistPlaceAudio(realmDraft.clips, realmDraft.audioPlay)
      });
      const previous = realms.find((item) => item.id === built.id);
      const saved = withOriginalTimestamps(
        built,
        previous ?? (realmDraft.createdAt ? { createdAt: realmDraft.createdAt } : undefined)
      );
      await repo.saveRealm(saved);
      await refresh();
      setSelectedRealmId(saved.id);
      setRealmDraft(realmDraftFrom(saved));
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !savedPlaceIds.has(draft.id)) return;
    if (!confirmRemove(draft.name.trim() || "this landmark")) return;
    await repo.deletePlace(draft.id);
    await refresh();
    setSelectedId(null);
    setDraft(null);
    setSelectedFocalId(null);
  }

  async function removeRealm() {
    if (!realmDraft?.id || !savedRealmIds.has(realmDraft.id)) return;
    const hosted = visiblePlaces.filter((item) => item.realmId === realmDraft.id);
    if (hosted.length > 0) {
      setError("Move or delete its landmarks first.");
      return;
    }
    if (!confirmRemove(realmDraft.name.trim() || "this realm")) return;
    await repo.deleteRealm(realmDraft.id);
    await refresh();
    backToRealms();
  }

  const saved = Boolean(draft?.id && savedPlaceIds.has(draft.id));
  const realmSaved = Boolean(realmDraft?.id && savedRealmIds.has(realmDraft.id));
  const selectedRoom = draft?.rooms.find((item) => item.id === selectedFocalId) ?? null;
  const showFloorForm = Boolean(draft && selectedFocalId === FLOOR_FOCAL_ID);
  const focalItems = draft
    ? [
        {
          id: FLOOR_FOCAL_ID,
          name: draft.name.trim() || "Floor",
          caption: "Floor · default Here",
          ...(draft.pictures[0]?.thumbDataUrl ? { thumb: draft.pictures[0].thumbDataUrl } : {})
        },
        ...draft.rooms.map((room) => ({
          id: room.id,
          name: room.label.trim() || "Untitled focal",
          caption: "Focal",
          ...(room.pictures[0]?.thumbDataUrl ? { thumb: room.pictures[0].thumbDataUrl } : {})
        }))
      ]
    : [];

  return (
    <div className="studio-split studio-split--atlas">
      <input
        ref={venueRef}
        className="setup-file"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void appendVenuePictures(e.target.files)}
      />
      <input
        ref={roomRef}
        className="setup-file"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const roomId = roomTargetRef.current;
          roomTargetRef.current = null;
          if (roomId) void appendRoomPictures(roomId, e.target.files);
        }}
      />
      <input
        ref={venueAudioRef}
        className="setup-file"
        type="file"
        accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a,.webm"
        multiple
        onChange={(e) => void appendVenueClips(e.target.files)}
      />
      <input
        ref={roomAudioRef}
        className="setup-file"
        type="file"
        accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a,.webm"
        multiple
        onChange={(e) => {
          const roomId = roomAudioTargetRef.current;
          roomAudioTargetRef.current = null;
          if (roomId) void appendRoomClips(roomId, e.target.files);
        }}
      />
      <input
        ref={realmPicRef}
        className="setup-file"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void appendRealmPictures(e.target.files)}
      />
      <input
        ref={realmAudioRef}
        className="setup-file"
        type="file"
        accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a,.webm"
        multiple
        onChange={(e) => void appendRealmClips(e.target.files)}
      />
      <StudioList
        heading="Realms"
        items={visibleRealms.map((item) => {
          const thumb = collectPlacePictures(item)[0]?.thumbDataUrl;
          return {
            id: item.id,
            name: item.name,
            caption: shelfCaption(item.source, savedRealmIds.has(item.id)),
            ...(thumb ? { thumb } : {})
          };
        })}
        selectedId={selectedRealmId}
        onSelect={openRealm}
        onNew={() => {
          setError(null);
          setNotice(null);
          setSelectedRealmId(null);
          setRealmDraft(emptyRealmDraft());
          setSelectedId(null);
          setDraft(null);
          setSelectedFocalId(null);
        }}
        layout="portraits"
        columns={2}
        newLabel="+ Realm"
        empty="No realms yet."
      />
      {selectedRealmId ? (
        <StudioList
          heading="Landmarks"
          items={landmarks.map((item) => ({
            id: item.id,
            name: item.name,
            caption: shelfCaption(item.source, savedPlaceIds.has(item.id), item.tags ?? []),
            ...(collectPlacePictures(item)[0]?.thumbDataUrl
              ? { thumb: collectPlacePictures(item)[0]!.thumbDataUrl }
              : {})
          }))}
          selectedId={selectedId}
          onSelect={open}
          onNew={() => {
            if (!selectedRealmId) return;
            setError(null);
            setNotice(null);
            setSelectedId(null);
            setDraft(emptyDraft(selectedRealmId));
            setSelectedFocalId(FLOOR_FOCAL_ID);
          }}
          layout="portraits"
          newLabel="+ Landmark"
          empty="No landmarks in this realm yet."
        />
      ) : null}
      {draft ? (
        <StudioList
          heading="Focal points"
          items={focalItems}
          selectedId={selectedFocalId}
          onSelect={setSelectedFocalId}
          onNew={() => {
            const room = emptyRoom();
            setDraft({ ...draft, rooms: [...draft.rooms, room] });
            setSelectedFocalId(room.id);
            setError(null);
            setNotice(null);
          }}
          layout="portraits"
          newLabel="+ Focal"
          empty="No extra focals yet. The landmark is the default Here."
        />
      ) : null}
      <section className="studio-sheet studio-sheet--form">
        {!realmDraft && !draft && (
          <p className="inspector-empty">
            Realm → landmark → focal. Click City of Dunbaar, then the bar, then a room. The form is always the last column you picked.
          </p>
        )}
        {realmDraft && !draft && (
          <>
            <p className="setup-kicker">{sourceCaption(realmDraft.source, realmSaved)}</p>
            <SheetNameField
              ariaLabel="Realm name"
              value={realmDraft.name}
              placeholder="New realm"
              onChange={(name) => setRealmDraft({ ...realmDraft, name })}
            />
            <FormSection
              title="Pictures"
              lede="Atlas thumb, and a chat backdrop if the landmark has none. Not sent to the model."
            >
            <PictureStrip
              pictures={realmDraft.pictures}
              play={realmDraft.picturePlay}
              busy={busy}
              onAdd={() => realmPicRef.current?.click()}
              onRemove={removeRealmPicture}
              onPlay={(play) => setRealmDraft({ ...realmDraft, picturePlay: play })}
            />
            </FormSection>
            <FormSection
              title="Sound"
              lede="A looping mp3/ogg/wav under 6 MB. Plays if the landmark has no loop. Not sent to the model."
            >
            <SoundStrip
              clips={realmDraft.clips}
              play={realmDraft.audioPlay}
              busy={busy}
              onAdd={() => realmAudioRef.current?.click()}
              onRemove={removeRealmClip}
              onPlay={(play) => setRealmDraft({ ...realmDraft, audioPlay: play })}
            />
            </FormSection>
            <FormSection title="Intro" lede="A postcard for the player. Not Here — the scene still plays in a landmark.">
            <textarea
              className="setup-field__story"
              value={realmDraft.note}
              onChange={(e) => setRealmDraft({ ...realmDraft, note: e.target.value })}
              placeholder="A quiet city. Hidden rooms sit behind ordinary doors."
            />
            </FormSection>
            <FormSection
              title="For the model"
              lede="Two or three facts for Pass 1. Empty = the intro is sent instead."
            >
            <textarea
              className="setup-field__story"
              value={realmDraft.brief}
              onChange={(e) => setRealmDraft({ ...realmDraft, brief: e.target.value })}
              placeholder="Dunbaar is a quiet harbour city. Hidden rooms sit behind ordinary doors."
            />
            </FormSection>
            {notice && <p className="setup-notice">{notice}</p>}
            {error && <p className="setup-error">{error}</p>}
            <div className="studio-sheet__actions">
              <button type="button" className="setup-start" disabled={busy} onClick={() => void saveRealm()}>
                Save
              </button>
              {realmSaved && (
                <button type="button" className="setup-example" onClick={() => void removeRealm()}>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
        {showFloorForm && draft && (
          <>
            <p className="setup-kicker">
              {selectedRealm ? `${selectedRealm.name} · ` : ""}
              {sourceCaption(draft.source, saved)} · landmark
            </p>
            <SheetNameField
              ariaLabel="Landmark name"
              value={draft.name}
              placeholder="New landmark"
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <label className="setup-field setup-field--row">
              <span className="setup-field__label">
                Tags
                <span className="setup-optional">this landmark only</span>
              </span>
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="bar, oasis, harbour"
              />
            </label>
            <FormSection
              title="Pictures"
              lede="Each file becomes a thumb and a chat backdrop. This is Here until someone walks into another focal. Not sent to the model."
            >
            <PictureStrip
              pictures={draft.pictures}
              play={draft.picturePlay}
              busy={busy}
              onAdd={() => venueRef.current?.click()}
              onRemove={removeVenuePicture}
              onPlay={(play) => setDraft({ ...draft, picturePlay: play })}
            />
            </FormSection>
            <FormSection title="Sound" lede="A looping mp3/ogg/wav under 6 MB. Not sent to the model.">
            <SoundStrip
              clips={draft.clips}
              play={draft.audioPlay}
              busy={busy}
              onAdd={() => venueAudioRef.current?.click()}
              onRemove={removeVenueClip}
              onPlay={(play) => setDraft({ ...draft, audioPlay: play })}
            />
            </FormSection>
            <FormSection title="Light and sound">
            <div className="setup-row">
              <label className="setup-field">
                <span className="setup-field__label">Light</span>
                <input value={draft.lighting} onChange={(e) => setDraft({ ...draft, lighting: e.target.value })} placeholder="dim, neon…" />
              </label>
              <label className="setup-field">
                <span className="setup-field__label">Sound</span>
                <input value={draft.noise} onChange={(e) => setDraft({ ...draft, noise: e.target.value })} placeholder="rain, chatter…" />
              </label>
            </div>
            <label className="setup-check">
              <input type="checkbox" checked={draft.music} onChange={(e) => setDraft({ ...draft, music: e.target.checked })} />
              Music is playing
            </label>
            </FormSection>
            <FormSection
              title="Intro"
              lede="Typed over the picture. The player sees this. Not sent if For the model is filled."
            >
            <textarea
              className="setup-field__story"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="What you see and hear in this place…"
            />
            </FormSection>
            <FormSection title="For the model" lede="Compact Here for this landmark. Empty = the intro is sent instead.">
            <textarea
              className="setup-field__story"
              value={draft.brief}
              onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
              placeholder="The Aurora Room is a hidden, atmospheric jazz bar…"
            />
            </FormSection>
            {notice && <p className="setup-notice">{notice}</p>}
            {error && <p className="setup-error">{error}</p>}
            <div className="studio-sheet__actions">
              <button type="button" className="setup-start" disabled={busy} onClick={() => void save()}>
                Save
              </button>
              {saved && (
                <button type="button" className="setup-example" onClick={() => void remove()}>
                  Delete landmark
                </button>
              )}
            </div>
          </>
        )}
        {draft && selectedRoom && (
          <>
            <p className="setup-kicker">
              {selectedRealm ? `${selectedRealm.name} · ` : ""}
              {draft.name.trim() || "Landmark"} · focal
            </p>
            <SheetNameField
              ariaLabel="Focal name"
              value={selectedRoom.label}
              placeholder="New focal"
              onChange={(label) =>
                setDraft({
                  ...draft,
                  rooms: draft.rooms.map((item) => (item.id === selectedRoom.id ? { ...item, label } : item))
                })
              }
            />
            <FormSection
              title="Pictures"
              lede="Typed over the picture. A focal without a picture stays dark instead of showing the landmark."
            >
            <PictureStrip
              pictures={selectedRoom.pictures}
              play={selectedRoom.picturePlay}
              busy={busy}
              onAdd={() => {
                roomTargetRef.current = selectedRoom.id;
                roomRef.current?.click();
              }}
              onRemove={(index) => removeRoomPicture(selectedRoom.id, index)}
              onPlay={(play) =>
                setDraft({
                  ...draft,
                  rooms: draft.rooms.map((item) => (item.id === selectedRoom.id ? { ...item, picturePlay: play } : item))
                })
              }
            />
            </FormSection>
            <FormSection title="Sound">
            <SoundStrip
              clips={selectedRoom.clips}
              play={selectedRoom.audioPlay}
              busy={busy}
              onAdd={() => {
                roomAudioTargetRef.current = selectedRoom.id;
                roomAudioRef.current?.click();
              }}
              onRemove={(index) => removeRoomClip(selectedRoom.id, index)}
              onPlay={(play) =>
                setDraft({
                  ...draft,
                  rooms: draft.rooms.map((item) => (item.id === selectedRoom.id ? { ...item, audioPlay: play } : item))
                })
              }
            />
            </FormSection>
            <FormSection title="Intro" lede="Typed over the picture. The player sees this.">
            <textarea
              className="setup-field__story"
              value={selectedRoom.description}
              placeholder="What you see when you walk in…"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  rooms: draft.rooms.map((item) =>
                    item.id === selectedRoom.id ? { ...item, description: e.target.value } : item
                  )
                })
              }
            />
            </FormSection>
            <FormSection title="For the model">
            <textarea
              className="setup-field__story"
              value={selectedRoom.brief}
              placeholder="A narrow staff room. Bed, chair, curtains drawn."
              onChange={(e) =>
                setDraft({
                  ...draft,
                  rooms: draft.rooms.map((item) =>
                    item.id === selectedRoom.id ? { ...item, brief: e.target.value } : item
                  )
                })
              }
            />
            </FormSection>
            <FormSection title="Also match" lede="Other names that count as walking into this room.">
            <label className="setup-field">
              <input
                value={selectedRoom.keywords}
                placeholder="staff room, her room"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    rooms: draft.rooms.map((item) =>
                      item.id === selectedRoom.id ? { ...item, keywords: e.target.value } : item
                    )
                  })
                }
              />
            </label>
            </FormSection>
            <FormSection
              title="Door"
              lede="How this room shows on the Go row in chat. Closed rooms wait until chat names them, a listed reply goes there, or you open them in Inspector. Hidden rooms have no button until then."
            >
              <label className="setup-field setup-field--row">
                <span className="setup-field__label">In play</span>
                <select
                  value={selectedRoom.gate}
                  onChange={(e) => {
                    const gate = e.target.value === "locked" || e.target.value === "hidden" ? e.target.value : "open";
                    setDraft({
                      ...draft,
                      rooms: draft.rooms.map((item) =>
                        item.id === selectedRoom.id ? { ...item, gate } : item
                      )
                    });
                  }}
                >
                  <option value="open">Always open</option>
                  <option value="locked">Visible, closed until opened</option>
                  <option value="hidden">Hidden until named</option>
                </select>
              </label>
            </FormSection>
            <FormSection
              title="Reachable from"
              lede="Where you can walk in from — and where the Go buttons appear. Empty = from the landmark floor only, not from other rooms. Tick both ends of a door if they should connect."
            >
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={(selectedRoom.fromRoomIds ?? []).includes(FLOOR_FOCAL_ID)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      rooms: draft.rooms.map((item) =>
                        item.id === selectedRoom.id
                          ? {
                              ...item,
                              fromRoomIds: e.target.checked
                                ? [...(item.fromRoomIds ?? []).filter((id) => id !== FLOOR_FOCAL_ID), FLOOR_FOCAL_ID]
                                : (item.fromRoomIds ?? []).filter((id) => id !== FLOOR_FOCAL_ID)
                            }
                          : item
                      )
                    })
                  }
                />
                {draft.name.trim() || "The landmark"} (outside / default Here)
              </label>
              {draft.rooms
                .filter((room) => room.id !== selectedRoom.id && room.label.trim())
                .map((room) => (
                  <label key={room.id} className="setup-check">
                    <input
                      type="checkbox"
                      checked={(selectedRoom.fromRoomIds ?? []).includes(room.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          rooms: draft.rooms.map((item) =>
                            item.id === selectedRoom.id
                              ? {
                                  ...item,
                                  fromRoomIds: e.target.checked
                                    ? [...(item.fromRoomIds ?? []).filter((id) => id !== room.id), room.id]
                                    : (item.fromRoomIds ?? []).filter((id) => id !== room.id)
                                }
                              : item
                          )
                        })
                      }
                    />
                    {room.label.trim()}
                  </label>
                ))}
            </FormSection>
            {notice && <p className="setup-notice">{notice}</p>}
            {error && <p className="setup-error">{error}</p>}
            <div className="studio-sheet__actions">
              <button type="button" className="setup-start" disabled={busy} onClick={() => void save()}>
                Save
              </button>
              <button
                type="button"
                className="setup-example"
                onClick={() => {
                  setDraft({ ...draft, rooms: draft.rooms.filter((item) => item.id !== selectedRoom.id) });
                  setSelectedFocalId(FLOOR_FOCAL_ID);
                }}
              >
                Remove focal
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
