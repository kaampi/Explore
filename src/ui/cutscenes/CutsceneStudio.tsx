import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CutsceneFilmSchema, type CutsceneBeat, type CutsceneFilm } from "../../cutscenes/schema";
import { planPlayback } from "../../cutscenes/playback";
import {
  addAudioTrack,
  loadAudioBlob,
  loadAudioLibrary,
  type AudioTrack,
} from "../audio/audioStorage";
import { Button, IconButton } from "../components/Button";
import { Menu, MenuButton, useContextMenu, type MenuItem } from "../components/Menu";
import { Modal } from "../components/Modal";
import { useTranslate } from "../i18n/LanguageProvider";
import { sceneImagesFromFile } from "../studio/portrait";
import { PRESET_THEMES, type PlayTheme } from "../themes/theme";
import { CutscenePlayer } from "./CutscenePlayer";
import {
  channels,
  channelLabels,
  CutsceneFields,
  labelFor,
  newBeat,
  Pick,
  type Channel,
} from "./CutsceneFields";
import "./cutscene-studio.css";

export type CutsceneStudioProps = {
  film: CutsceneFilm | null;
  previewTheme: PlayTheme;
  onSave: (film: CutsceneFilm) => void;
  onClose: () => void;
};

const DirtyContext = createContext<((dirty: boolean) => void) | undefined>(undefined);
const loadTrack = (id: string) => loadAudioBlob(id).catch(() => null);
const previewSound = { enabled: true, volume: 0.8, loadTrack };

export function CutsceneDirtyHost({
  onDirty,
  children,
}: {
  onDirty: (dirty: boolean) => void;
  children: ReactNode;
}) {
  return <DirtyContext.Provider value={onDirty}>{children}</DirtyContext.Provider>;
}

export function emptyFilm(title: string): CutsceneFilm {
  const date = new Date().toISOString();
  return CutsceneFilmSchema.parse({
    id: crypto.randomUUID(),
    title,
    createdAt: date,
    updatedAt: date,
    beats: [newBeat()],
  });
}

function useNarrowStudio() {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia === "function" && matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

function StepHeading({
  label,
  selected,
  items,
  onDragStart,
  onDrop,
}: {
  label: string;
  selected: boolean;
  items: MenuItem[];
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const context = useContextMenu(label, items);
  return (
    <th
      scope="col"
      data-selected={selected}
      {...context.bind}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", label);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="cutscene-studio__step-head">
        {label}
        <MenuButton label={label} items={items} size="compact" />
      </div>
      {context.menu}
    </th>
  );
}

type History = { previous: CutsceneFilm[]; value: CutsceneFilm; next: CutsceneFilm[] };
type Selection = { beatId: string; channel: Channel };

function oneStep(film: CutsceneFilm, index: number): CutsceneFilm {
  const beat = film.beats[index]!;
  const context = planPlayback(film).steps[index]!;
  const image = context.image.current;
  return {
    ...film,
    beats: [
      {
        ...beat,
        ...(beat.image.source.kind === "keep" && image
          ? {
              image: {
                ...image.cell,
                source: { kind: "set", imageId: image.imageId },
                in: { effect: "none", delay: 0, seconds: 0 },
              },
            }
          : {}),
        ...(beat.text === undefined && context.text.current
          ? { text: context.text.current.cell }
          : {}),
        ...(beat.sound.action === "none" && context.sound.previousMusic
          ? { sound: context.sound.previousMusic.cell }
          : {}),
      },
    ],
  };
}

export function CutsceneStudio({ film, previewTheme, onSave, onClose }: CutsceneStudioProps) {
  const t = useTranslate();
  const [history, setHistory] = useState<History>(() => ({
    previous: [],
    value: film ?? emptyFilm(t("csUntitled")),
    next: [],
  }));
  const draft = history.value;
  const initial = useRef(draft);
  const saved = useRef(initial.current);
  const submitted = useRef<{ stamp: string; draft: CutsceneFilm }>();
  const [selection, setSelection] = useState<Selection>(() => ({
    beatId: draft.beats[0]!.id,
    channel: "image",
  }));
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [themeId, setThemeId] = useState("current");
  const [playing, setPlaying] = useState<CutsceneFilm>();
  const [confirmClose, setConfirmClose] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number }>();
  const fileOpener = useRef<HTMLButtonElement>();
  const [panelOpen, setPanelOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [, updateBaseline] = useState(0);
  const dragStep = useRef<string>();
  const cells = useRef(new Map<string, HTMLElement>());
  const narrow = useNarrowStudio();
  const dirtyHost = useContext(DirtyContext);
  const dirty = draft !== saved.current;
  const beatIndex = Math.max(
    0,
    draft.beats.findIndex(({ id }) => id === selection.beatId),
  );
  const beat = draft.beats[beatIndex]!;
  const theme =
    (themeId === "current" ? undefined : PRESET_THEMES.find(({ id }) => id === themeId)) ??
    previewTheme;
  const preview = useMemo(() => oneStep(draft, beatIndex), [draft, beatIndex]);
  const previewSource = preview.beats[0]?.image.source;
  const poster =
    previewSource?.kind === "set"
      ? draft.images.find(({ id }) => id === previewSource.imageId)
      : undefined;
  const trackNames = new Map(tracks.map(({ id, name }) => [id, name]));

  useEffect(() => {
    if (film?.updatedAt === submitted.current?.stamp && submitted.current) {
      saved.current = submitted.current.draft;
      submitted.current = undefined;
      updateBaseline((value) => value + 1);
    }
  }, [film]);
  useEffect(() => {
    dirtyHost?.(dirty);
    return () => dirtyHost?.(false);
  }, [dirty, dirtyHost]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    let active = true;
    void loadAudioLibrary("cutscene-studio")
      .then((library) => {
        if (active) setTracks(library.tracks);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function edit(update: (value: CutsceneFilm) => CutsceneFilm) {
    setHistory((current) => ({
      previous: [...current.previous, current.value].slice(-99),
      value: update(current.value),
      next: [],
    }));
    setMessage("");
  }
  function undo() {
    setHistory((current) => {
      const value = current.previous.at(-1);
      return value
        ? {
            value,
            previous: current.previous.slice(0, -1),
            next: [current.value, ...current.next],
          }
        : current;
    });
  }
  function redo() {
    setHistory((current) => {
      const [value, ...next] = current.next;
      return value
        ? {
            value,
            previous: [...current.previous, current.value],
            next,
          }
        : current;
    });
  }

  function updateBeat(id: string, update: (value: CutsceneBeat) => CutsceneBeat) {
    edit((value) => ({
      ...value,
      beats: value.beats.map((item) => (item.id === id ? update(item) : item)),
    }));
  }
  function addStep(after: number, duplicate?: CutsceneBeat) {
    if (draft.beats.length >= 60) return;
    const next = duplicate ? { ...structuredClone(duplicate), id: crypto.randomUUID() } : newBeat();
    edit((value) => ({
      ...value,
      beats: [...value.beats.slice(0, after + 1), next, ...value.beats.slice(after + 1)],
    }));
    setSelection({ ...selection, beatId: next.id });
  }
  function moveStep(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= draft.beats.length) return;
    edit((value) => {
      const beats = [...value.beats];
      const [step] = beats.splice(from, 1);
      if (step) beats.splice(to, 0, step);
      return { ...value, beats };
    });
  }
  function itemsFor(index: number): MenuItem[] {
    const item = draft.beats[index]!;
    return [
      {
        label: t("csDuplicate"),
        disabled: draft.beats.length >= 60,
        onSelect: () => addStep(index, item),
      },
      { label: t("csMoveBack"), disabled: index === 0, onSelect: () => moveStep(index, index - 1) },
      {
        label: t("csMoveForward"),
        disabled: index === draft.beats.length - 1,
        onSelect: () => moveStep(index, index + 1),
      },
      { kind: "separator" },
      {
        label: t("csDelete"),
        danger: true,
        disabled: draft.beats.length === 1,
        onSelect: () => {
          edit((value) => ({ ...value, beats: value.beats.filter(({ id }) => id !== item.id) }));
          if (beat.id === item.id)
            setSelection({ ...selection, beatId: draft.beats[index ? index - 1 : 1]!.id });
        },
      },
    ];
  }

  async function uploadImage(file: File) {
    if (draft.images.length >= 30) return setMessage(t("csImageMax"));
    try {
      const picture = await sceneImagesFromFile(file);
      const bytes = (url: string) =>
        Math.floor(((url.split(",")[1]?.replace(/=+$/, "").length ?? 0) * 3) / 4);
      if (bytes(picture.imageDataUrl) > 2 * 1024 * 1024) return setMessage(t("csImageLimit"));
      const id = crypto.randomUUID();
      edit((value) =>
        value.images.length >= 30
          ? value
          : {
              ...value,
              images: [
                ...value.images,
                { id, dataUrl: picture.imageDataUrl, thumbDataUrl: picture.thumbDataUrl, alt: "" },
              ],
              beats: value.beats.map((item) =>
                item.id === beat.id
                  ? {
                      ...item,
                      image: { ...item.image, source: { kind: "set", imageId: id } },
                    }
                  : item,
              ),
            },
      );
    } catch {
      setMessage(t("csImageError"));
    }
  }
  async function uploadAudio(file: File) {
    try {
      const track = await addAudioTrack(file);
      setTracks((existing) => [...existing, track]);
      updateBeat(beat.id, (step) => ({
        ...step,
        sound: {
          ...step.sound,
          trackId: track.id,
          action: step.sound.action === "none" ? "effect" : step.sound.action,
        },
      }));
    } catch {
      setMessage(t("csSoundError"));
    }
  }

  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());

  function save() {
    const stamp = new Date().toISOString();
    const parsed = CutsceneFilmSchema.safeParse({ ...draft, updatedAt: stamp });
    if (!parsed.success) return setMessage(t("csBadDraft"));
    submitted.current = { stamp, draft };
    onSave(parsed.data);
  }

  function cellFor(step: CutsceneBeat, index: number, channel: Channel) {
    const key = `${step.id}:${channel}`;
    const picture =
      step.image.source.kind === "set"
        ? draft.images.find(
            ({ id }) => step.image.source.kind === "set" && id === step.image.source.imageId,
          )
        : undefined;
    const selected = beat.id === step.id && selection.channel === channel;
    const summary = {
      image: picture ? (
        <img className="cutscene-studio__cell-thumb" src={picture.thumbDataUrl} alt="" />
      ) : step.image.source.kind === "set" ? (
        t("csMissingImage")
      ) : (
        t(labelFor(step.image.source.kind))
      ),
      sound:
        (step.sound.trackId && trackNames.get(step.sound.trackId)) ||
        t(labelFor(step.sound.action)),
      text: step.text?.text || t("csValue_none"),
      advance: step.advance.kind === "after" ? `${step.advance.seconds} s` : t("csValue_click"),
    }[channel];
    return (
      <div
        ref={(node) => {
          if (node) cells.current.set(key, node);
          else cells.current.delete(key);
        }}
      >
        <Button
          variant="quiet"
          className="cutscene-studio__cell"
          aria-label={`${t("csStep", { number: index + 1 })}, ${t(channelLabels[channel])}`}
          aria-pressed={selected}
          tabIndex={narrow || selected ? 0 : -1}
          onClick={() => {
            setSelection({ beatId: step.id, channel });
            setPanelOpen(true);
          }}
          onKeyDown={(event) => {
            const row = channels.indexOf(channel);
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const move = moves[event.key];
            if (!move) return;
            event.preventDefault();
            const column =
              draft.beats[Math.min(draft.beats.length - 1, Math.max(0, index + move[0]))]!;
            const next = channels[Math.min(channels.length - 1, Math.max(0, row + move[1]))]!;
            setSelection({ beatId: column.id, channel: next });
            cells.current.get(`${column.id}:${next}`)?.querySelector("button")?.focus();
          }}
        >
          <span>{summary}</span>
        </Button>
      </div>
    );
  }

  const inspector = (
    <section
      className="cutscene-studio__inspector"
      aria-label={t(channelLabels[selection.channel])}
    >
      <h3>
        {t("csStepInspector", {
          step: t("csStep", { number: beatIndex + 1 }),
          channel: t(channelLabels[selection.channel]),
        })}
      </h3>
      <CutsceneFields
        film={draft}
        beat={beat}
        channel={selection.channel}
        tracks={tracks}
        onChange={(update) => updateBeat(beat.id, update)}
        onImage={(file) => void uploadImage(file)}
        onAlt={(id, alt) =>
          edit((value) => ({
            ...value,
            images: value.images.map((image) => (image.id === id ? { ...image, alt } : image)),
          }))
        }
        onTrack={(file) => void uploadAudio(file)}
      />
      <Button onClick={() => setPlaying(preview)}>{t("csPlayStep")}</Button>
    </section>
  );

  return (
    <section
      className="cutscene-studio"
      aria-label={t("cutsceneStudio")}
      onKeyDown={(event) => {
        if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
        if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
        }
        if (event.key.toLowerCase() === "y") {
          event.preventDefault();
          redo();
        }
      }}
    >
      <header className="cutscene-studio__bar">
        <div className="cutscene-studio__film-menu">
          <Button
            variant="quiet"
            size="compact"
            aria-haspopup="menu"
            aria-expanded={!!fileMenu}
            onClick={(event) => {
              fileOpener.current = event.currentTarget;
              const rect = event.currentTarget.getBoundingClientRect();
              setFileMenu({ x: rect.left, y: rect.bottom });
            }}
          >
            {t("csFile")}
          </Button>
          {fileMenu && (
            <Menu
              label={t("csFile")}
              at={fileMenu}
              opener={fileOpener.current ?? null}
              onClose={() => {
                setFileMenu(undefined);
                fileOpener.current?.focus();
              }}
              items={[
                { label: t("csSave"), onSelect: save },
                { label: t("csClose"), onSelect: requestClose },
              ]}
            />
          )}
          <Button variant="quiet" size="compact" onClick={() => setSettingsOpen(true)}>
            {t("csSettings")}
          </Button>
        </div>
        <label className="cutscene-field cutscene-studio__title">
          <span>{t("csTitle")}</span>
          <input
            value={draft.title}
            maxLength={120}
            onChange={(event) => edit((value) => ({ ...value, title: event.target.value }))}
          />
        </label>
        <div className="cutscene-studio__actions">
          <Button variant="quiet" size="compact" disabled={!history.previous.length} onClick={undo}>
            {t("csUndo")}
          </Button>
          <Button variant="quiet" size="compact" disabled={!history.next.length} onClick={redo}>
            {t("csRedo")}
          </Button>
          <Button variant="quiet" onClick={requestClose}>
            {t("csClose")}
          </Button>
          <Button variant="primary" onClick={save}>
            {t("csSave")}
          </Button>
        </div>
      </header>

      <div className="cutscene-studio__workspace">
        <div className="cutscene-studio__preview">
          <div className="cutscene-studio__screen" aria-label={t("csPreview")}>
            {playing ? (
              <CutscenePlayer
                film={playing}
                theme={theme}
                simple={false}
                sound={previewSound}
                onEnd={() => setPlaying(undefined)}
              />
            ) : (
              <>
                {poster && (
                  <img
                    className={`cutscene-reel__picture cutscene-reel__filter--${preview.beats[0]?.image.filter ?? "none"}`}
                    src={poster.dataUrl}
                    alt={poster.alt}
                  />
                )}
                {preview.beats[0]?.text && (
                  <div
                    className={`cutscene-studio__poster-copy cutscene-studio__poster-copy--${preview.beats[0].text.position}`}
                    style={{ textAlign: preview.beats[0].text.align }}
                  >
                    {preview.beats[0].text.text}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="cutscene-studio__playbar">
            <span>{t("csPreview")}</span>
            <div className="cutscene-studio__actions">
              {playing ? (
                <Button variant="quiet" size="compact" onClick={() => setPlaying(undefined)}>
                  {t("csStopPreview")}
                </Button>
              ) : (
                <>
                  <Button variant="primary" size="compact" onClick={() => setPlaying(draft)}>
                    {t("csStart")}
                  </Button>
                  <Button size="compact" onClick={() => setPlaying(preview)}>
                    {t("csPlayStep")}
                  </Button>
                </>
              )}
            </div>
            {dirty && <small>{t("csChanged")}</small>}
          </div>
        </div>

        {!narrow && inspector}
      </div>
      <div className="cutscene-studio__timeline">
        {narrow ? (
          <ol className="cutscene-studio__step-list">
            {draft.beats.map((item, index) => (
              <li key={item.id}>
                <div className="cutscene-studio__step-head">
                  {t("csStep", { number: index + 1 })}
                  <MenuButton label={t("csStep", { number: index + 1 })} items={itemsFor(index)} />
                </div>
                <div className="cutscene-studio__step-cells">
                  {channels.map((channel) => (
                    <div key={channel}>
                      <small>{t(channelLabels[channel])}</small>
                      {cellFor(item, index, channel)}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">{t("csChannel")}</th>
                {draft.beats.map((item, index) => (
                  <StepHeading
                    key={item.id}
                    label={t("csStep", { number: index + 1 })}
                    items={itemsFor(index)}
                    selected={item.id === beat.id}
                    onDragStart={() => {
                      dragStep.current = item.id;
                    }}
                    onDrop={() => {
                      moveStep(
                        draft.beats.findIndex(({ id }) => id === dragStep.current),
                        index,
                      );
                      dragStep.current = undefined;
                    }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel}>
                  <th scope="row" data-selected={channel === selection.channel}>
                    {t(channelLabels[channel])}
                  </th>
                  {draft.beats.map((item, index) => (
                    <td key={item.id}>{cellFor(item, index, channel)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <IconButton
          label={t("csAddStep")}
          icon={<span aria-hidden="true">+</span>}
          disabled={draft.beats.length >= 60}
          onClick={() => addStep(beatIndex)}
        />
      </div>
      {narrow && panelOpen && (
        <Modal title={t(channelLabels[selection.channel])} side onClose={() => setPanelOpen(false)}>
          {inspector}
          <Button variant="quiet" onClick={() => setPanelOpen(false)}>
            {t("csBackSteps")}
          </Button>
        </Modal>
      )}
      {settingsOpen && (
        <Modal title={t("csSettings")} onClose={() => setSettingsOpen(false)}>
          <div className="cutscene-studio__settings">
            <Pick
              label={t("csDisplay")}
              value={draft.display}
              options={["column", "fullscreen"]}
              onChange={(display) => edit((value) => ({ ...value, display }))}
            />
            <label className="cutscene-field cutscene-field--check">
              <input
                type="checkbox"
                checked={draft.skippable}
                onChange={(event) =>
                  edit((value) => ({ ...value, skippable: event.target.checked }))
                }
              />
              <span>{t("csSkippable")}</span>
            </label>
            <label className="cutscene-field">
              <span>{t("csTheme")}</span>
              <select value={themeId} onChange={(event) => setThemeId(event.target.value)}>
                <option value="current">{t("csCurrent")}</option>
                <option value="parchment">{t("csNeutral")}</option>
                <option value="fantasy">{t("csFantasy")}</option>
                <option value="scifi">{t("csScifi")}</option>
              </select>
            </label>
          </div>
        </Modal>
      )}
      {message && (
        <p className="cutscene-studio__feedback" role="alert">
          {message}
        </p>
      )}
      {confirmClose && (
        <Modal title={t("csChanged")} onClose={() => setConfirmClose(false)}>
          <p>{t("csDiscardQuestion")}</p>
          <div className="cutscene-studio__actions">
            <Button onClick={() => setConfirmClose(false)}>{t("csCancel")}</Button>
            <Button variant="danger" filled onClick={onClose}>
              {t("csDiscard")}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
