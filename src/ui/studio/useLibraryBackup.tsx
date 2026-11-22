import { useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import {
  backupFilename,
  collectLibraryBackup,
  LibraryBackupError,
  parseLibraryBackup,
  restoreLibraryBackup,
} from "@library/libraryBackup";
import { downloadJson } from "./studioShared";

export function useLibraryBackup({
  repo,
  onRestored,
  canRestore,
}: {
  repo: IndexedDBRepository;
  onRestored: () => void;
  canRestore: () => boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function exportLibrary() {
    setBusy(true);
    setNotice(null);
    try {
      const backup = await collectLibraryBackup(repo);
      downloadJson(backupFilename(backup.exportedAt), backup);
      const count =
        backup.characters.length +
        backup.places.length +
        backup.realms.length +
        backup.stories.length +
        backup.voices.length +
        backup.rulesets.length +
        backup.objects.length +
        backup.campaigns.length +
        (backup.factions?.length ?? 0) +
        (backup.lorebooks?.length ?? 0);
      setNotice(count === 0 ? "Nothing saved to export yet." : `Exported ${count} saved cards.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not export the library.");
    } finally {
      setBusy(false);
    }
  }

  async function importLibrary(files: FileList | null) {
    const file = files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file || busy || !canRestore()) return;
    if (
      !confirm(
        "Restore this backup? Cards with the same id are replaced. Cards only on this machine are kept.",
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const { backup, skipped: parseSkipped } = parseLibraryBackup(parsed);
      const report = await restoreLibraryBackup(repo, backup);
      const skipped = parseSkipped + report.skipped;
      const parts = [`Restored ${report.saved} cards.`];
      if (skipped > 0) parts.push(`${skipped} skipped.`);
      setNotice(parts.join(" "));
      onRestored();
    } catch (err) {
      if (err instanceof LibraryBackupError) setNotice(err.message);
      else setNotice(err instanceof Error ? err.message : "Could not import that backup.");
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    notice,
    exportLibrary,
    chooseBackup: () => fileRef.current?.click(),
    input: (
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void importLibrary(event.target.files)}
      />
    ),
  };
}
