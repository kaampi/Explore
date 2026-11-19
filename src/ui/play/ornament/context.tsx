import "./ornament.css";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { effectiveOrnament, setForPart, type OrnamentPart, type OrnamentSetId } from "./sets";

type Value = { set: OrnamentSetId; level: "none" | "light" | "full" };
const Context = createContext<Value>({ set: "plain", level: "none" });

/** Tells the ornament parts below it which set to draw, from the theme in use. */
export function OrnamentProvider({
  theme,
  simple = false,
  children,
}: {
  theme: { ornament?: OrnamentSetId; ornamentLevel?: "none" | "light" | "full" };
  /** The player asked for plain frames, or the system asks for higher contrast or less motion. */
  simple?: boolean;
  children: ReactNode;
}) {
  const { ornament, ornamentLevel } = theme;
  const value = useMemo(
    () =>
      effectiveOrnament(
        {
          ...(ornament ? { ornament } : {}),
          ...(ornamentLevel ? { ornamentLevel } : {}),
        },
        { simple },
      ),
    [ornament, ornamentLevel, simple],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The set and level that draw one part. Outside a provider that is `plain`. */
export function useOrnament(part: OrnamentPart): Value {
  const { set, level } = useContext(Context);
  return { set: setForPart(set, part), level };
}
