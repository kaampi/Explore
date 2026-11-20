import { Fragment, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { backupFilename, collectLibraryBackup } from "@library/libraryBackup";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { useTranslate, type TranslationKey } from "../i18n/LanguageProvider";
import { downloadJson } from "../studio/studioShared";
import { INSTALLER_URL, RUNNING_DOCS_URL, UpdateProvider, useUpdates } from "./UpdateProvider";

/** Inline emphasis and commands in the localized instructions. */
function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, index) => {
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function CheckUpdates({ repo }: { repo?: IndexedDBRepository }) {
  const updates = useUpdates();
  return updates ? (
    <UpdateButton repo={repo} />
  ) : (
    <UpdateProvider>
      <UpdateButton repo={repo} />
    </UpdateProvider>
  );
}

async function open(url: string) {
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function UpdateButton({ repo }: { repo?: IndexedDBRepository | undefined }) {
  const t = useTranslate(),
    updates = useUpdates()!,
    [dialog, setDialog] = useState(false);
  return (
    <div className="sb-update-check">
      <Button
        variant={updates.available ? "primary" : "secondary"}
        data-update-available={updates.available}
        disabled={updates.checking}
        onClick={() => {
          if (updates.available) setDialog(true);
          else void updates.check(true);
        }}
      >
        {updates.checking
          ? t("updChecking")
          : updates.available
            ? t("updAvailable")
            : t("updCheck")}
      </Button>
      {updates.message && <p role="status">{t(updates.message)}</p>}
      {dialog &&
        (updates.desktop ? (
          <InstallDialog repo={repo} onClose={() => setDialog(false)} />
        ) : (
          <SourceDialog onClose={() => setDialog(false)} />
        ))}
    </div>
  );
}

/** The desktop app: three steps to the new installer. */
function InstallDialog({
  repo,
  onClose,
}: {
  repo: IndexedDBRepository | undefined;
  onClose: () => void;
}) {
  const t = useTranslate(),
    [openError, setOpenError] = useState(false),
    [copyStatus, setCopyStatus] = useState<TranslationKey | null>(null),
    [exportStatus, setExportStatus] = useState<TranslationKey | null>(null);
  async function download() {
    setOpenError(false);
    setCopyStatus(null);
    try {
      await open(INSTALLER_URL);
    } catch {
      setOpenError(true);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALLER_URL);
      setCopyStatus("updCopied");
    } catch {
      setCopyStatus("updCopyManual");
    }
  }
  async function exportLibrary() {
    if (!repo) return;
    setExportStatus(null);
    try {
      const backup = await collectLibraryBackup(repo);
      downloadJson(backupFilename(backup.exportedAt), backup);
      setExportStatus("updExported");
    } catch {
      setExportStatus("updExportFailed");
    }
  }
  return (
    <Modal title={t("updTitle")} onClose={onClose}>
      <ol className="sb-update-steps">
        <li>
          {rich(t("updStep1"))}
          <div>
            <Button variant="primary" onClick={() => void download()}>
              {t("updDownload")}
            </Button>
          </div>
        </li>
        <li>{rich(t("updStep2"))}</li>
        <li>{rich(t("updStep3"))}</li>
      </ol>
      {openError && (
        <div className="sb-update-check__fallback">
          <p role="status">{t("updOpenFail")}</p>
          <label>
            {t("updAddress")}
            <input
              readOnly
              value={INSTALLER_URL}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <Button onClick={() => void copy()}>{t("updCopy")}</Button>
          {copyStatus && <p role="status">{t(copyStatus)}</p>}
        </div>
      )}
      <p>
        {t("updKept")}{" "}
        {repo && (
          <Button variant="quiet" onClick={() => void exportLibrary()}>
            {t("updExport")}
          </Button>
        )}
      </p>
      {exportStatus && <p role="status">{t(exportStatus)}</p>}
      <div className="sb-dialog__actions">
        <Button onClick={onClose}>{t("updNotNow")}</Button>
      </div>
    </Modal>
  );
}

/** Run from the source code: update the code, then start again. */
function SourceDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslate();
  return (
    <Modal title={t("updSourceTitle")} onClose={onClose}>
      <p>{rich(t("updSourceBody"))}</p>
      <p>
        <a className="sb-update-docs-link" href={RUNNING_DOCS_URL} target="_blank" rel="noreferrer">
          {t("updSourceLink")}
        </a>
      </p>
      <div className="sb-dialog__actions">
        <Button onClick={onClose}>{t("updNotNow")}</Button>
      </div>
    </Modal>
  );
}
