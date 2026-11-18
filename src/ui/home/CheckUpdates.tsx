import { Fragment, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { backupFilename, collectLibraryBackup } from "@library/libraryBackup";
import { Modal } from "../components/Modal";
import { useTranslate, type TranslationKey } from "../i18n/LanguageProvider";
import { downloadJson } from "../studio/studioShared";
import { INSTALLER_URL, RUNNING_DOCS_URL, UpdateProvider, useUpdates } from "./UpdateProvider";

/** Text where **this** is bold. */
function rich(text: string): ReactNode {
  return text
    .split("**")
    .map((part, index) =>
      index % 2 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>,
    );
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
      <button
        type="button"
        className="sb-button"
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
      </button>
      {updates.message && <p role="status">{t(updates.message as TranslationKey)}</p>}
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
    [copyStatus, setCopyStatus] = useState(""),
    [exportStatus, setExportStatus] = useState("");
  async function download() {
    setOpenError(false);
    setCopyStatus("");
    try {
      await open(INSTALLER_URL);
    } catch {
      setOpenError(true);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALLER_URL);
      setCopyStatus(t("updCopied"));
    } catch {
      setCopyStatus(t("updCopyManual"));
    }
  }
  async function exportLibrary() {
    if (!repo) return;
    setExportStatus("");
    try {
      const backup = await collectLibraryBackup(repo);
      downloadJson(backupFilename(backup.exportedAt), backup);
      setExportStatus(t("updExported"));
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : t("updExportFailed"));
    }
  }
  return (
    <Modal title={t("updTitle")} onClose={onClose}>
      <ol className="sb-update-steps">
        <li>
          {rich(t("updStep1"))}
          <div>
            <button type="button" className="sb-button" onClick={() => void download()}>
              {t("updDownload")}
            </button>
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
          <button
            type="button"
            className="sb-button sb-button--secondary"
            onClick={() => void copy()}
          >
            {t("updCopy")}
          </button>
          {copyStatus && <p role="status">{copyStatus}</p>}
        </div>
      )}
      <p>
        {t("updKept")}{" "}
        {repo && (
          <button type="button" className="setup-text-btn" onClick={() => void exportLibrary()}>
            {t("updExport")}
          </button>
        )}
      </p>
      {exportStatus && <p role="status">{exportStatus}</p>}
      <div className="sb-dialog__actions">
        <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>
          {t("updNotNow")}
        </button>
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
        <a
          href={RUNNING_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (isTauri()) {
              event.preventDefault();
              void open(RUNNING_DOCS_URL);
            }
          }}
        >
          {t("updSourceLink")}
        </a>
      </p>
      <div className="sb-dialog__actions">
        <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>
          {t("updNotNow")}
        </button>
      </div>
    </Modal>
  );
}
