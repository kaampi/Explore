import { createContext, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Menu, type MenuItem } from "../components/Menu";
import { useTranslate } from "../i18n/LanguageProvider";

export const CutsceneLibraryMenu = createContext<readonly MenuItem[]>([]);

export function CutsceneFileMenu({ items }: { items: readonly MenuItem[] }) {
  const t = useTranslate();
  const [at, setAt] = useState<{ x: number; y: number }>();
  const opener = useRef<HTMLButtonElement>();
  return (
    <>
      <Button
        variant="quiet"
        size="compact"
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={(event) => {
          opener.current = event.currentTarget;
          const { left, bottom } = event.currentTarget.getBoundingClientRect();
          setAt(at ? undefined : { x: left, y: bottom });
        }}
      >
        {t("csFile")}
      </Button>
      {at && (
        <Menu
          label={t("csFile")}
          at={at}
          scope={opener.current ?? null}
          opener={opener.current ?? null}
          onClose={() => {
            setAt(undefined);
            opener.current?.focus();
          }}
          items={items}
        />
      )}
    </>
  );
}
