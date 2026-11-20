import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { IndexedDBRepository } from "../persistence/IndexedDBRepository";
import {
  collectLibraryBackup,
  parseLibraryBackup,
  restoreLibraryBackup,
} from "../library/libraryBackup";
import { CutsceneFilmSchema } from "./schema";

it("exports and restores a standalone film, retaining sound references", async () => {
  const film = CutsceneFilmSchema.parse({
    id: "dawn",
    title: "Dawn",
    createdAt: "",
    updatedAt: "",
    images: [
      {
        id: "picture",
        dataUrl: "data:image/png;base64,a",
        thumbDataUrl: "data:image/png;base64,b",
      },
    ],
    beats: [
      { id: "first", sound: { action: "music", trackId: "local-audio", caption: "[Wind]" } },
      { id: "second", advance: { kind: "after", seconds: 5 } },
    ],
  });
  const source = new IndexedDBRepository(new IDBFactory(), "studio-source", 15);
  const target = new IndexedDBRepository(new IDBFactory(), "studio-target", 15);
  await source.saveCutsceneFilm(film);
  const exported = await collectLibraryBackup(source);
  expect(exported.cutscenes).toEqual([film]);
  const { backup, skipped } = parseLibraryBackup(JSON.parse(JSON.stringify(exported)));
  expect(skipped).toBe(0);
  expect(await restoreLibraryBackup(target, backup)).toEqual({ saved: 1, skipped: 0 });
  expect(await target.loadCutsceneFilm(film.id)).toEqual(film);
  const { cutscenes: _films, ...oldBackup } = exported;
  const old = parseLibraryBackup(oldBackup);
  expect(old.skipped).toBe(0);
  expect(await restoreLibraryBackup(target, old.backup)).toEqual({ saved: 0, skipped: 0 });
  expect(await target.loadCutsceneFilm(film.id)).toEqual(film);
  await source.close();
  await target.close();
});
