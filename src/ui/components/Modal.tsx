import { useEffect, useRef, type ReactNode } from "react";
import { useTranslate } from "../i18n/LanguageProvider";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  side = false,
  hiddenTitle = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** A panel from the right edge, as tall as the window. */
  side?: boolean;
  /** The title is only the name of the dialog for a screen reader: the content has its own heading. */
  hiddenTitle?: boolean;
}) {
  const t = useTranslate();
  const ref = useRef<HTMLDialogElement>(null);
  // What had focus when the dialog was made. Kept from the first render: React in development runs
  // effects twice, and by the second time the dialog's own button has focus.
  const focusBefore = useRef<Element | null>(null);
  if (focusBefore.current === null && typeof document !== "undefined")
    focusBefore.current = document.activeElement;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      // The dialog is going away: give focus back to what opened it, if that is still there.
      const previous = focusBefore.current;
      if (
        (previous instanceof HTMLElement || previous instanceof SVGElement) &&
        previous.isConnected &&
        previous !== document.body
      )
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sb-dialog${wide ? " sb-dialog--wide" : ""}${side ? " sb-dialog--side" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={title}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="sb-dialog__heading">
        <h2 className={hiddenTitle ? "visually-hidden" : undefined}>{title}</h2>
        <button type="button" className="sb-icon" onClick={onClose} aria-label={t("closeDialog")}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
