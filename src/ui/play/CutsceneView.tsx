import { useEffect, useState, type ReactNode } from "react";
import type { CutsceneFilm } from "../../cutscenes/schema";
import { CutscenePlayer } from "../cutscenes/CutscenePlayer";
import { defaultAudioPreferences, loadAudioBlob, loadAudioLibrary } from "../audio/audioStorage";
import { useAppearance } from "../themes/ThemeProvider";

const loadTrack = (id: string) => loadAudioBlob(id).catch(() => null);

export function CutsceneView({
  film,
  sessionId,
  busy,
  onFinish,
  status,
}: {
  film: CutsceneFilm;
  sessionId: string;
  busy: boolean;
  onFinish: () => void;
  status?: ReactNode;
}) {
  const { library } = useAppearance();
  const [volume, setVolume] = useState(() => defaultAudioPreferences(sessionId).volume);
  useEffect(() => {
    let active = true;
    void loadAudioLibrary(sessionId)
      .then(({ preferences }) => {
        if (active) setVolume(preferences.volume);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionId]);

  return (
    <div className="cutscene-reel-wrap">
      {!busy && (
        <CutscenePlayer
          film={film}
          theme={library.active}
          simple={library.simpleFrames}
          sound={{ enabled: volume > 0, volume, loadTrack }}
          onEnd={onFinish}
        />
      )}
      {status}
    </div>
  );
}
