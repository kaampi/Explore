import { useState } from "react";
import type { CampaignScene, CharacterTemplate, ObjectTemplate } from "../../library/LibrarySchema";
import {
  actorIdFor,
  addPerson,
  addPickUp,
  itemsHere,
  pickUpAction,
  peopleHere,
  placeItem,
  removeItem,
  removePerson,
  type ItemPlace,
} from "../../library/sceneParts";

/** "Who and what is here": the people and things in one scene. */
export function SceneParts({
  scene,
  people,
  things,
  busy,
  onChange,
  onOpenLibrary,
}: {
  scene: CampaignScene;
  /** The adventure's Cast. */
  people: CharacterTemplate[];
  /** The adventure's Things. */
  things: ObjectTemplate[];
  busy: boolean;
  onChange: (scene: CampaignScene) => void;
  onOpenLibrary?: ((what: "people" | "things") => void) | undefined;
}) {
  const [personId, setPersonId] = useState("");
  const [thingId, setThingId] = useState("");
  const [where, setWhere] = useState("position:");
  const [message, setMessage] = useState("");
  const game = scene.encounter;
  if (!game) return null;

  const here = peopleHere(scene);
  const available = people.filter(
    (person) => !here.some((actor) => actor.id === actorIdFor(person.id)),
  );
  const placed = itemsHere(scene);
  const positions = game.definition.places;
  const player = game.state.actors[game.definition.playerId]!;

  function attempt(change: () => CampaignScene) {
    try {
      onChange(change());
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not change the scene.");
    }
  }

  function parsePlace(value: string): ItemPlace {
    if (value.startsWith("held:")) return { heldBy: value.slice(5) };
    return { position: value.slice(9) || positions[0]!.id };
  }

  function describeWhere(place: ItemPlace): string {
    if ("position" in place)
      return `at ${positions.find((p) => p.id === place.position)?.name ?? place.position}`;
    const holder = game!.state.actors[place.heldBy];
    return `carried by ${place.heldBy === player.id ? "you" : (holder?.name ?? "someone")}`;
  }

  const itemName = (id: string) =>
    game.definition.items.find((item) => item.id === id)?.name ??
    things.find((t) => t.id === id)?.name ??
    id;

  return (
    <section
      className="storyboard-scene-parts"
      aria-label="Who and what is here"
      data-storyboard-field="parts"
    >
      <h4>Who and what is here</h4>
      {message && (
        <p role="alert" className="storyboard-scene-parts__error">
          {message}
        </p>
      )}
      <div className="storyboard-scene-parts__group">
        <strong>People</strong>
        {here.length === 0 && <p className="playable-hint">No one else is here yet.</p>}
        <ul>
          {here.map((actor) => (
            <li key={actor.id}>
              <span>{actor.name}</span>
              <button
                type="button"
                className="playable-remove"
                disabled={busy}
                aria-label={`Remove ${actor.name}`}
                onClick={() => attempt(() => removePerson(scene, actor.id.replace(/^npc:/, "")))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {people.length === 0 ? (
          <p className="playable-hint">
            No one is in the Cast yet.{" "}
            {onOpenLibrary && (
              <button
                type="button"
                className="setup-text-btn"
                onClick={() => onOpenLibrary("people")}
              >
                Open Cast →
              </button>
            )}
          </p>
        ) : (
          <div className="storyboard-scene-parts__add">
            <select
              aria-label="Person to add"
              value={personId}
              disabled={busy || available.length === 0}
              onChange={(event) => setPersonId(event.target.value)}
            >
              <option value="">{available.length ? "Choose a person" : "Everyone is here"}</option>
              {available.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !personId}
              onClick={() => {
                const person = people.find((item) => item.id === personId);
                if (!person) return;
                attempt(() => addPerson(scene, person));
                setPersonId("");
              }}
            >
              Add person
            </button>
          </div>
        )}
      </div>
      <div className="storyboard-scene-parts__group">
        <strong>Things</strong>
        {placed.length === 0 && <p className="playable-hint">No things are placed here yet.</p>}
        <ul>
          {placed.map((entry) => (
            <li key={`${entry.itemId}`}>
              <span>
                {itemName(entry.itemId)} · {describeWhere(entry.where)}
              </span>
              {"position" in entry.where && !pickUpAction(scene, entry.itemId) && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Let the player take ${itemName(entry.itemId)}`}
                  onClick={() => attempt(() => addPickUp(scene, entry.itemId))}
                >
                  Pick up
                </button>
              )}
              <button
                type="button"
                className="playable-remove"
                disabled={busy}
                aria-label={`Remove ${itemName(entry.itemId)}`}
                onClick={() => attempt(() => removeItem(scene, entry.itemId))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {things.length === 0 ? (
          <p className="playable-hint">
            No things in this adventure yet.{" "}
            {onOpenLibrary && (
              <button
                type="button"
                className="setup-text-btn"
                onClick={() => onOpenLibrary("things")}
              >
                Open Things →
              </button>
            )}
          </p>
        ) : (
          <div className="storyboard-scene-parts__add">
            <select
              aria-label="Thing to place"
              value={thingId}
              disabled={busy}
              onChange={(event) => setThingId(event.target.value)}
            >
              <option value="">Choose a thing</option>
              {things.map((thing) => (
                <option key={thing.id} value={thing.id}>
                  {thing.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Where to place it"
              value={where}
              disabled={busy}
              onChange={(event) => setWhere(event.target.value)}
            >
              {positions.map((position) => (
                <option key={position.id} value={`position:${position.id}`}>
                  At {position.name}
                </option>
              ))}
              <option value={`held:${player.id}`}>Carried by you</option>
              {here.map((actor) => (
                <option key={actor.id} value={`held:${actor.id}`}>
                  Carried by {actor.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !thingId}
              onClick={() => {
                const thing = things.find((item) => item.id === thingId);
                if (!thing) return;
                attempt(() => placeItem(scene, thing, parsePlace(where)));
                setThingId("");
              }}
            >
              Place thing
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
