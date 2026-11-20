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
import { MenuButton, useContextMenu, type MenuItem } from "../components/Menu";
import { Modal } from "../components/Modal";
import { useTranslate } from "../i18n/LanguageProvider";
import { sceneImagesFromFile } from "../studio/portrait";
import { PRESET_THEMES, type PlayTheme } from "../themes/theme";
import { CutsceneFileMenu, CutsceneLibraryMenu } from "./CutsceneFileMenu";
import { CutscenePlayer } from "./CutscenePlayer";
import {
  channels,
  channelLabels,
  CutsceneFields,
  labelFor,
  newBeat,
  Num,
  Pick,
  type Channel,
} from "./CutsceneFields";
import { StepTimeline, WorkspaceZoom } from "./StepTimeline";
import { useWorkspaceView } from "./useWorkspaceView";
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
  transition,
}: {
  label: string;
  selected: boolean;
  items: MenuItem[];
  onDragStart: () => void;
  onDrop: () => void;
  transition: ReactNode;
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
      {transition}
      {context.menu}
    </th>
  );
}

const transitionEffects = ["cut", "crossfade", "through-black"] as const;

function StepTransition({
  label,
  effect,
  selected,
  onSelect,
  onChange,
}: {
  label: string;
  effect: CutsceneBeat["transition"]["effect"];
  selected: boolean;
  onSelect: () => void;
  onChange: (effect: CutsceneBeat["transition"]["effect"]) => void;
}) {
  const t = useTranslate();
  const items = transitionEffects.map((choice) => ({
    label: t(labelFor(choice)),
    onSelect: () => {
      onSelect();
      onChange(choice);
    },
  }));
  const context = useContextMenu(label, items);
  return (
    <div
      className="cutscene-studio__boundary"
      {...context.bind}
      onContextMenu={(event) => {
        event.stopPropagation();
        context.bind.onContextMenu(event);
      }}
      onKeyDown={(event) => {
        context.bind.onKeyDown(event);
        if (event.defaultPrevented) event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        context.bind.onPointerDown(event);
      }}
    >
      <Button
        size="compact"
        variant="quiet"
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span aria-hidden="true">→</span> {t(labelFor(effect))}
      </Button>
      {context.menu}
    </div>
  );
}

type History = { previous: CutsceneFilm[]; value: CutsceneFilm; next: CutsceneFilm[] };
type Selection = { beatId: string; channel: Channel };

function oneStep(
  film: CutsceneFilm,
  index: number,
  context: ReturnType<typeof planPlayback>["steps"][number],
): CutsceneFilm {
  const beat = film.beats[index]!;
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
  const [transitionId, setTransitionId] = useState<string>();
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [themeId, setThemeId] = useState("current");
  const [playing, setPlaying] = useState<CutsceneFilm>();
  const [confirmClose, setConfirmClose] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const libraryMenu = useContext(CutsceneLibraryMenu);
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
  const editingTransition = transitionId === beat.id && beatIndex < draft.beats.length - 1;
  const transitionLabel = (index: number) =>
    t("csStepTransition", {
      from: t("csStep", { number: index + 1 }),
      to: t("csStep", { number: index + 2 }),
    });
  const theme =
    (themeId === "current" ? undefined : PRESET_THEMES.find(({ id }) => id === themeId)) ??
    previewTheme;
  const plan = useMemo(() => planPlayback(draft), [draft]);
  const timing = plan.steps[beatIndex]!;
  const preview = useMemo(() => oneStep(draft, beatIndex, timing), [draft, beatIndex, timing]);
  const previewWorkspace = useWorkspaceView();
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
            setTransitionId(undefined);
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
            setTransitionId(undefined);
            setSelection({ beatId: column.id, channel: next });
            cells.current.get(`${column.id}:${next}`)?.querySelector("button")?.focus();
          }}
        >
          <span>{summary}</span>
        </Button>
      </div>
    );
  }

  function updateTransition(id: string, change: Partial<CutsceneBeat["transition"]>) {
    updateBeat(id, (item) => ({ ...item, transition: { ...item.transition, ...change } }));
  }

  function boundaryFor(item: CutsceneBeat, index: number) {
    return index < draft.beats.length - 1 ? (
      <StepTransition
        label={transitionLabel(index)}
        effect={item.transition.effect}
        selected={editingTransition && beat.id === item.id}
        onSelect={() => {
          setSelection({ beatId: item.id, channel: "advance" });
          setTransitionId(item.id);
          setPanelOpen(true);
        }}
        onChange={(effect) => updateTransition(item.id, { effect })}
      />
    ) : null;
  }

  const inspector = editingTransition ? (
    <section className="cutscene-studio__inspector" aria-label={transitionLabel(beatIndex)}>
      <h3>{transitionLabel(beatIndex)}</h3>
      <Pick
        label={t("csTransition")}
        value={beat.transition.effect}
        options={transitionEffects}
        onChange={(effect) => updateTransition(beat.id, { effect })}
      />
      {beat.transition.effect !== "cut" && (
        <Num
          label={t("csLength")}
          value={beat.transition.seconds}
          max={30}
          onChange={(seconds) => updateTransition(beat.id, { seconds })}
        />
      )}
      <Button onClick={() => setPlaying(draft)}>{t("csStart")}</Button>
    </section>
  ) : (
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
          <CutsceneFileMenu
            items={[
              ...libraryMenu,
              { label: t("csSave"), onSelect: save },
              { label: t("csClose"), onSelect: requestClose },
            ]}
          />
          <Button variant="quiet" size="compact" onClick={() => setSettingsOpen(true)}>
            {t("csSettings")}
          </Button>
        </div>
        <h2 className="cutscene-studio__title">{draft.title || t("csUntitled")}</h2>
        <div className="cutscene-studio__actions">
          <Button variant="quiet" size="compact" disabled={!history.previous.length} onClick={undo}>
            {t("csUndo")}
          </Button>
          <Button variant="quiet" size="compact" disabled={!history.next.length} onClick={redo}>
            {t("csRedo")}
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
              <div
                className="cutscene-studio__poster"
                {...previewWorkspace.bind}
                tabIndex={0}
                aria-label={t("csPreview")}
                data-gesture={previewWorkspace.mode}
              >
                <div
                  className="cutscene-studio__poster-stage"
                  style={{
                    transform: `translate(${previewWorkspace.view.x}px, ${previewWorkspace.view.y}px) scale(${previewWorkspace.view.zoom})`,
                  }}
                >
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
                </div>
              </div>
            )}
          </div>
          <div className="cutscene-studio__playbar">
            {playing ? (
              <span>{t("csPreview")}</span>
            ) : (
              <WorkspaceZoom workspace={previewWorkspace} />
            )}
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
                {boundaryFor(item, index)}
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
                    transition={boundaryFor(item, index)}
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
      <StepTimeline
        step={timing}
        number={beatIndex + 1}
        selected={selection.channel}
        onSelect={(channel) => {
          setTransitionId(undefined);
          setSelection({ beatId: beat.id, channel });
          setPanelOpen(true);
        }}
      />
      {narrow && panelOpen && (
        <Modal
          title={
            editingTransition ? transitionLabel(beatIndex) : t(channelLabels[selection.channel])
          }
          side
          onClose={() => setPanelOpen(false)}
        >
          {inspector}
          <Button variant="quiet" onClick={() => setPanelOpen(false)}>
            {t("csBackSteps")}
          </Button>
        </Modal>
      )}
      {settingsOpen && (
        <Modal title={t("csSettings")} onClose={() => setSettingsOpen(false)}>
          <div className="cutscene-studio__settings">
            <label className="cutscene-field">
              <span>{t("csTitle")}</span>
              <input
                value={draft.title}
                maxLength={120}
                onChange={(event) => edit((value) => ({ ...value, title: event.target.value }))}
              />
            </label>
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
