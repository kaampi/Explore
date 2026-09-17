import { useEffect, useState } from "react";
import type { PlacePicture, PicturePlay } from "@state/placePictures";

const FADE_MS = 2800;
const HOLD_MS = 14000;

export function ChatBackdrop({
  pictures,
  play,
  locationKey
}: {
  pictures: PlacePicture[];
  play: PicturePlay;
  locationKey: string;
}) {
  const urls = pictures.map((picture) => picture.imageDataUrl).filter(Boolean);
  const n = urls.length;
  const [index, setIndex] = useState(0);
  const shown = n === 0 ? 0 : Math.min(index, n - 1);

  useEffect(() => {
    if (n === 0) return;
    if (play === "random" && n > 1) {
      setIndex(Math.floor(Math.random() * n));
      return;
    }
    setIndex(0);
  }, [locationKey, play, n]);

  useEffect(() => {
    if (play !== "fade" || n < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % n);
    }, HOLD_MS);
    return () => window.clearInterval(id);
  }, [locationKey, play, n]);

  if (n === 0) return null;

  if (n === 1 || play === "random") {
    return (
      <div className="chat-log__backdrop" aria-hidden="true">
        <img src={urls[shown]} alt="" />
      </div>
    );
  }

  return (
    <div
      className="chat-log__backdrop chat-log__backdrop--gallery"
      style={{ ["--backdrop-fade" as string]: `${FADE_MS}ms` }}
      aria-hidden="true"
    >
      {urls.map((url, i) => (
        <img key={`${locationKey}:${i}`} src={url} alt="" className={i === shown ? "is-on" : undefined} />
      ))}
    </div>
  );
}
