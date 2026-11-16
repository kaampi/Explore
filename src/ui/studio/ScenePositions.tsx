import { useState } from "react";
import type { CampaignScene } from "../../library/LibrarySchema";
import {
  COVER_LEVELS,
  POSITION_DISTANCES,
  addPosition,
  connectPositions,
  disconnectPositions,
  removePosition,
  renamePosition,
  setPositionDetail,
  type CoverLevel,
  type PositionDistance,
} from "../../library/sceneParts";

const DISTANCE_LABELS: Record<PositionDistance, string> = {
  close: `Close (${POSITION_DISTANCES.close} m)`,
  away: `A little way (${POSITION_DISTANCES.away} m)`,
  far: `Far (${POSITION_DISTANCES.far} m)`,
};
const COVER_LABELS: Record<CoverLevel, string> = {
  none: "No cover",
  some: "Some cover",
  good: "Good cover",
};

function coverOf(value: number): CoverLevel {
  if (value >= COVER_LEVELS.good) return "good";
  if (value >= COVER_LEVELS.some) return "some";
  return "none";
}

/** The positions of one scene and the ways between them. */
export function ScenePositions({
  scene,
  busy,
  onChange,
}: {
  scene: CampaignScene;
  busy: boolean;
  onChange: (scene: CampaignScene) => void;
}) {
  const game = scene.encounter;
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [distance, setDistance] = useState<PositionDistance>("close");
  const [joinA, setJoinA] = useState("");
  const [joinB, setJoinB] = useState("");
  const [message, setMessage] = useState("");
  if (!game) return null;
  const places = game.definition.places;
  const nameOf = (id: string) => places.find((place) => place.id === id)?.name ?? id;

  function attempt(change: () => CampaignScene) {
    try {
      onChange(change());
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not change the scene.");
    }
  }

  return (
    <section
      className="storyboard-scene-parts"
      aria-label="Positions"
      data-storyboard-field="positions"
    >
      <h4>Positions</h4>
      {message && (
        <p role="alert" className="storyboard-scene-parts__error">
          {message}
        </p>
      )}
      <ul>
        {places.map((place) => (
          <li key={place.id}>
            <input
              aria-label={`Name of ${place.name}`}
              defaultValue={place.name}
              disabled={busy}
              maxLength={120}
              onBlur={(event) => {
                if (event.target.value.trim() === place.name) return;
                attempt(() => renamePosition(scene, place.id, event.target.value));
                event.target.value = place.name;
              }}
            />
            <select
              aria-label={`Cover at ${place.name}`}
              value={coverOf(place.cover)}
              disabled={busy}
              onChange={(event) =>
                attempt(() =>
                  setPositionDetail(scene, place.id, { cover: event.target.value as CoverLevel }),
                )
              }
            >
              {(Object.keys(COVER_LEVELS) as CoverLevel[]).map((level) => (
                <option key={level} value={level}>
                  {COVER_LABELS[level]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="playable-remove"
              disabled={busy || places.length === 1}
              aria-label={`Remove position ${place.name}`}
              onClick={() => attempt(() => removePosition(scene, place.id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {game.definition.connections.length > 0 && (
        <ul aria-label="Ways between positions">
          {game.definition.connections.map((link) => (
            <li key={`${link.from}:${link.to}`}>
              <span>
                {nameOf(link.from)} ↔ {nameOf(link.to)}
              </span>
              <button
                type="button"
                className="playable-remove"
                disabled={busy}
                aria-label={`Disconnect ${nameOf(link.from)} and ${nameOf(link.to)}`}
                onClick={() => attempt(() => disconnectPositions(scene, link.from, link.to))}
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="storyboard-scene-parts__add">
        <input
          aria-label="New position name"
          value={name}
          maxLength={120}
          disabled={busy}
          placeholder="For example: The porch"
          onChange={(event) => setName(event.target.value)}
        />
        <select
          aria-label="Next to"
          value={from || places[0]!.id}
          disabled={busy}
          onChange={(event) => setFrom(event.target.value)}
        >
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              Next to {place.name}
            </option>
          ))}
        </select>
        <select
          aria-label="How far"
          value={distance}
          disabled={busy}
          onChange={(event) => setDistance(event.target.value as PositionDistance)}
        >
          {(Object.keys(POSITION_DISTANCES) as PositionDistance[]).map((key) => (
            <option key={key} value={key}>
              {DISTANCE_LABELS[key]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => {
            attempt(
              () => addPosition(scene, { name, from: from || places[0]!.id, distance }).scene,
            );
            setName("");
          }}
        >
          Add position
        </button>
      </div>
      {places.length > 1 && (
        <div className="storyboard-scene-parts__add">
          <select
            aria-label="Connect first"
            value={joinA}
            disabled={busy}
            onChange={(event) => setJoinA(event.target.value)}
          >
            <option value="">Connect…</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Connect second"
            value={joinB}
            disabled={busy}
            onChange={(event) => setJoinB(event.target.value)}
          >
            <option value="">…with</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !joinA || !joinB}
            onClick={() => attempt(() => connectPositions(scene, joinA, joinB))}
          >
            Connect
          </button>
        </div>
      )}
    </section>
  );
}
