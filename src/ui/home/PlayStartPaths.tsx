import type { StudioView } from "../studio/types";
export type StartAdventure = { id: string; name: string; scenes: number };

/** How many saved adventures the card lists before pointing to the builder. */
export const SHOWN_ADVENTURES = 3;

export function PlayStartPaths({
  onFree,
  onStudio,
  onPlayAdventure,
  adventures,
  disabled,
}: {
  onFree: () => void;
  onStudio: (view: StudioView) => void;
  onPlayAdventure: (id: string) => void;
  /** Saved adventures, newest first. */
  adventures: StartAdventure[];
  disabled: boolean;
}) {
  const shown = adventures.slice(0, SHOWN_ADVENTURES);
  const hidden = adventures.length - shown.length;
  return (
    <section className="sb-start-paths" aria-label="Choose how to begin">
      <button
        type="button"
        aria-label="Free play"
        disabled={disabled}
        onClick={onFree}
        className="sb-start-path sb-start-path--free"
      >
        <div className="sb-start-path__top">
          <span>
            01 · FOLLOW YOUR CURIOSITY <small>No rule-set required</small>
          </span>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="24" />
            <path d="m42 20-7 17-17 9 9-19Z" />
            <path d="m27 27 8 10M32 3v7m0 44v7M3 32h7m44 0h7" />
          </svg>
        </div>
        <span className="sb-start-path__title" role="heading" aria-level={2}>
          Free play
        </span>
        <p>
          A familiar face, an unexpected turn. Let the conversation lead, and shape the story as you
          go.
        </p>
      </button>
      <button
        type="button"
        aria-label="With rules"
        disabled={disabled}
        onClick={() => onStudio("rulesets")}
        className="sb-start-path sb-start-path--rules"
      >
        <div className="sb-start-path__top">
          <span>
            02 · LET THE DICE DECIDE <small>Your story, with a system</small>
          </span>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="m32 5 24 15v25L32 59 8 45V20Zm0 0v54M8 20l24 13 24-13M8 45l24-12 24 12" />
          </svg>
        </div>
        <span className="sb-start-path__title" role="heading" aria-level={2}>
          With rules
        </span>
        <p>
          Give your choices weight. Explore rule-sets where abilities, checks and consequences help
          shape what happens.
        </p>
      </button>
      <div className="sb-start-path sb-start-path--adventure" role="group" aria-label="Adventure">
        <div className="sb-start-path__top">
          <span>
            03 · STEP INTO A STORY <small>Play freely or bring rules</small>
          </span>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="M32 14C22 7 12 8 6 12v39c8-4 17-3 26 3 9-6 18-7 26-3V12c-6-4-16-5-26 2Zm0 0v40M14 22c4-1 7 0 11 2m-11 7c4-1 7 0 11 2m14-9 5 5 8-10m-13 19h12" />
          </svg>
        </div>
        <span className="sb-start-path__title" role="heading" aria-level={2}>
          Adventure
        </span>
        <p>
          Places to discover. People with something to hide. Enter a prepared adventure and make it
          your own.
        </p>
        {shown.length > 0 ? (
          <ul className="sb-start-path__adventures" aria-label="Your adventures">
            {shown.map((adventure) => (
              <li key={adventure.id}>
                <button
                  type="button"
                  disabled={disabled || adventure.scenes === 0}
                  onClick={() => onPlayAdventure(adventure.id)}
                >
                  <strong>{adventure.name || "Untitled adventure"}</strong>
                  <small>
                    {adventure.scenes === 0
                      ? "No scenes yet"
                      : `${adventure.scenes} ${adventure.scenes === 1 ? "scene" : "scenes"}`}
                  </small>
                  <span aria-hidden="true">Play →</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sb-start-path__empty">No adventures yet. Build your first one.</p>
        )}
        {hidden > 0 && (
          <p className="sb-start-path__more">{hidden} more in the Adventure Builder.</p>
        )}
        <button
          type="button"
          className="sb-link sb-start-path__builder"
          disabled={disabled}
          onClick={() => onStudio("campaigns")}
        >
          Open the Adventure Builder →
        </button>
      </div>
    </section>
  );
}
