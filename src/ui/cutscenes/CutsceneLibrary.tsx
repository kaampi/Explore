import { cutsceneExample, CUTSCENE_EXAMPLE } from "../../cutscenes/example";
import { installExampleOnce } from "../../scenarios/exampleLibrary";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CutsceneFilm } from "../../cutscenes/schema";
import type { IndexedDBRepository } from "../../persistence/IndexedDBRepository";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { useTranslate } from "../i18n/LanguageProvider";
import { StudioList } from "../studio/StudioList";
import { useAppearance } from "../themes/ThemeProvider";
import { CutsceneFileMenu, CutsceneLibraryMenu } from "./CutsceneFileMenu";
import { CutsceneDirtyHost, CutsceneStudio } from "./CutsceneStudio";

const Repository = createContext<IndexedDBRepository | undefined>(undefined);
export function CutsceneLibraryProvider({
  repo,
  children,
}: {
  repo: IndexedDBRepository;
  children: ReactNode;
}) {
  return <Repository.Provider value={repo}>{children}</Repository.Provider>;
}
export function useCutsceneLibrary() {
  return useContext(Repository);
}

type Editor = { key: string; film?: CutsceneFilm };
type LibraryAction =
  | { kind: "delete"; film: CutsceneFilm; uses: string[] }
  | { kind: "rename"; film: CutsceneFilm }
  | { kind: "discard"; action: () => void };

export function CutsceneLibrary({
  repo,
  onDirtyChange,
}: {
  repo: IndexedDBRepository;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslate();
  const { library } = useAppearance();
  const [films, setFilms] = useState<CutsceneFilm[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [menu, setMenu] = useState<LibraryAction>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exampleInstalled, setExampleInstalled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const changeDirty = useCallback(
    (next: boolean) => {
      setDirty(next);
      onDirtyChange(next);
    },
    [onDirtyChange],
  );
  const translate = useCallback(
    (message: "csCouldNotLoad" | "csCouldNotSave") => {
      setError(t(message));
    },
    [t],
  );

  useEffect(() => {
    let active = true;
    void repo
      .listCutsceneFilms()
      .then((items) => {
        if (active) setFilms(items);
      })
      .catch(() => {
        if (active) setError(t("csCouldNotLoad"));
      });
    return () => {
      active = false;
    };
  }, [repo]);
  const ordered = [...films].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  function leave(action: () => void) {
    if (dirty) setMenu({ kind: "discard", action });
    else action();
  }

  async function save(film: CutsceneFilm, open: boolean) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await repo.saveCutsceneFilm(film);
      setFilms((existing) => [...existing.filter(({ id }) => id !== film.id), film]);
      if (open)
        setEditor((current) => (current ? { key: current.key, film } : { key: film.id, film }));
      else if (editor?.film?.id === film.id)
        setEditor((current) => (current ? { ...current, film } : null));
      return true;
    } catch {
      translate("csCouldNotSave");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(film: CutsceneFilm) {
    if (busy) return;
    setBusy(true);
    try {
      await repo.deleteCutsceneFilm(film.id);
      setFilms((existing) => existing.filter(({ id }) => id !== film.id));
      if (editor?.film?.id === film.id) setEditor(null);
      setMenu(undefined);
    } catch {
      translate("csCouldNotSave");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(film: CutsceneFilm) {
    void repo
      .listCampaigns()
      .then((campaigns) =>
        setMenu({
          kind: "delete",
          film,
          uses: campaigns
            .filter(({ cutscenes }) => cutscenes.some(({ filmId }) => filmId === film.id))
            .map(({ name }) => name),
        }),
      )
      .catch(() => translate("csCouldNotLoad"));
  }

  async function install() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await installExampleOnce(repo, CUTSCENE_EXAMPLE, cutsceneExample);
      setFilms(await repo.listCutsceneFilms());
      setExampleInstalled(true);
    } catch {
      translate("csCouldNotSave");
    } finally {
      setBusy(false);
    }
  }

  const newFilm = () => {
    setPickerOpen(false);
    leave(() => setEditor({ key: crypto.randomUUID() }));
  };
  const libraryMenu = [
    { label: t("csNew"), onSelect: newFilm },
    { label: t("csOpenFilm"), onSelect: () => setPickerOpen(true) },
  ];

  return (
    <div className="cutscene-library">
      <div className="cutscene-library__detail">
        {error && (
          <p role="alert" className="cutscene-studio__feedback">
            {error}
          </p>
        )}
        {editor ? (
          <CutsceneLibraryMenu.Provider value={libraryMenu}>
            <CutsceneDirtyHost onDirty={changeDirty}>
              <CutsceneStudio
                key={editor.key}
                film={editor.film ?? null}
                previewTheme={library.active}
                onSave={(film) => void save(film, true)}
                onClose={() => setEditor(null)}
              />
            </CutsceneDirtyHost>
          </CutsceneLibraryMenu.Provider>
        ) : (
          <section className="cutscene-studio" aria-label={t("cutsceneStudio")}>
            <header className="cutscene-studio__bar">
              <div className="cutscene-studio__film-menu">
                <CutsceneFileMenu items={libraryMenu} />
              </div>
            </header>
            <div className="cutscene-library__empty">
              <h2>{t("cutsceneStudio")}</h2>
              <p>{t("csPick")}</p>
              <Button onClick={() => setPickerOpen(true)}>{t("csOpenFilm")}</Button>
            </div>
          </section>
        )}
      </div>
      {pickerOpen && (
        <Modal title={t("csOpenFilm")} onClose={() => setPickerOpen(false)}>
          <div className="cutscene-library__picker">
            <StudioList
              heading={t("cutsceneShelf")}
              items={ordered.map((film) => ({
                id: film.id,
                name: film.title,
                caption: t("csSteps", { count: film.beats.length }),
                ...(film.images[0]?.thumbDataUrl ? { thumb: film.images[0].thumbDataUrl } : {}),
              }))}
              selectedId={editor?.film?.id ?? null}
              onSelect={(id) => {
                const film = ordered.find((item) => item.id === id);
                if (!film) return;
                setPickerOpen(false);
                if (editor?.film?.id !== id) leave(() => setEditor({ key: id, film }));
              }}
              onNew={newFilm}
              newLabel={t("csNew")}
              empty={t("csEmpty")}
              actions={
                <div className="cutscene-library__sample">
                  <Button
                    variant="quiet"
                    size="compact"
                    disabled={busy}
                    onClick={() => void install()}
                  >
                    {t("csInstallExample")}
                  </Button>
                  {exampleInstalled && <p role="status">{t("csExampleInstalled")}</p>}
                </div>
              }
              itemMenu={({ id }) => {
                const film = ordered.find((item) => item.id === id)!;
                return [
                  {
                    label: t("csDuplicate"),
                    onSelect: () =>
                      leave(() => {
                        const date = new Date().toISOString();
                        void save(
                          {
                            ...structuredClone(film),
                            id: crypto.randomUUID(),
                            title: t("csCopyName", { name: film.title }).slice(0, 120),
                            createdAt: date,
                            updatedAt: date,
                          },
                          false,
                        );
                      }),
                  },
                  {
                    label: t("csRename"),
                    onSelect: () => {
                      setName(film.title);
                      const rename = () => setMenu({ kind: "rename", film });
                      if (editor?.film?.id === film.id) leave(rename);
                      else rename();
                    },
                  },
                  { kind: "separator" },
                  {
                    label: t("csDelete"),
                    danger: true,
                    onSelect: () => {
                      if (editor?.film?.id === film.id) leave(() => confirmDelete(film));
                      else confirmDelete(film);
                    },
                  },
                ];
              }}
            />
          </div>
        </Modal>
      )}
      {menu?.kind === "delete" && (
        <Modal
          title={t("csDeleteQuestion", { name: menu.film.title })}
          onClose={() => setMenu(undefined)}
        >
          {menu.uses.length > 0 && <p>{t("csUsedIn", { names: menu.uses.join(", ") })}</p>}
          <div className="cutscene-studio__actions">
            <Button onClick={() => setMenu(undefined)}>{t("csCancel")}</Button>
            <Button variant="danger" filled disabled={busy} onClick={() => void remove(menu.film)}>
              {t("csDelete")}
            </Button>
          </div>
        </Modal>
      )}
      {menu?.kind === "rename" && (
        <Modal title={t("csRename")} onClose={() => setMenu(undefined)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              const film = {
                ...menu.film,
                title: name.trim(),
                updatedAt: new Date().toISOString(),
              };
              void save(film, false).then((stored) => {
                if (stored) {
                  setEditor((current) =>
                    current?.film?.id === film.id ? { key: crypto.randomUUID(), film } : current,
                  );
                  setMenu(undefined);
                }
              });
            }}
          >
            <label className="cutscene-field">
              <span>{t("csTitle")}</span>
              <input
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="cutscene-studio__actions">
              <Button onClick={() => setMenu(undefined)}>{t("csCancel")}</Button>
              <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
                {t("csSave")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {menu?.kind === "discard" && (
        <Modal title={t("csChanged")} onClose={() => setMenu(undefined)}>
          <p>{t("csDiscardQuestion")}</p>
          <div className="cutscene-studio__actions">
            <Button onClick={() => setMenu(undefined)}>{t("csCancel")}</Button>
            <Button
              variant="danger"
              filled
              onClick={() => {
                setMenu(undefined);
                menu.action();
              }}
            >
              {t("csDiscard")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
