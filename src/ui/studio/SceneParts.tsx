import { useState } from "react";
import type {
  CampaignScene,
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
} from "../../library/LibrarySchema";
import {
  actorIdFor,
  addDoor,
  addPerson,
  addPickUp,
  attachDoorToConnection,
  attachDoorToRoute,
  doorsHere,
  itemsHere,
  pickUpAction,
  peopleHere,
  placeItem,
  removeDoor,
  removeItem,
  removePerson,
  setAmmunition,
  setAttitude,
  setPersonPosition,
  setTactics,
  setToughness,
  toughnessOf,
  isHostile,
  type Attitude,
  type Toughness,
  type ItemPlace,
} from "../../library/sceneParts";

/** "Who and what is here": the people and things in one scene. */
export function SceneParts({
  campaign,
  scene,
  people,
  things,
  busy,
  onChange,
  onChangeCampaign,
  onOpenLibrary,
}: {
  campaign: CampaignTemplate;
  scene: CampaignScene;
  /** The adventure's Cast. */
  people: CharacterTemplate[];
  /** The adventure's Things. */
  things: ObjectTemplate[];
  busy: boolean;
  onChange: (scene: CampaignScene) => void;
  /** For changes that reach more than one scene, such as a door on a route. */
  onChangeCampaign: (campaign: CampaignTemplate) => void;
  onOpenLibrary?: ((what: "people" | "things") => void) | undefined;
}) {
  const [personId, setPersonId] = useState("");
  const [thingId, setThingId] = useState("");
  const [where, setWhere] = useState("position:");
  const [message, setMessage] = useState("");
  const [doorName, setDoorName] = useState("");
  const [doorPosition, setDoorPosition] = useState("");
  const [doorLocked, setDoorLocked] = useState(false);
  const [doorKey, setDoorKey] = useState("");
  const [attachTo, setAttachTo] = useState<Record<string, string>>({});
  const game = scene.encounter;
  if (!game) return null;

  const here = peopleHere(scene);
  const available = people.filter(
    (person) => !here.some((actor) => actor.id === actorIdFor(person.id)),
  );
  const placed = itemsHere(scene);
  const positions = game.definition.places;
  const player = game.state.actors[game.definition.playerId]!;

  const characterOf = (actorId: string) => actorId.replace(/^npc:/, "");

  function attempt(change: () => CampaignScene) {
    try {
      onChange(change());
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not change the scene.");
    }
  }

  function attemptCampaign(change: () => CampaignTemplate) {
    try {
      onChangeCampaign(change());
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not change the scene.");
    }
  }

  const doors = doorsHere(scene);
  const routes = campaign.sceneLinks.filter((link) => link.fromSceneId === scene.id);
  const sceneName = (id: string) =>
    campaign.scenes.find((item) => item.id === id)?.name.trim() || "the next scene";
  const positionName = (id: string) => positions.find((p) => p.id === id)?.name ?? id;

  function doorPlace(doorId: string): string {
    const connection = game!.definition.connections.find((c) => c.barrierId === doorId);
    if (connection)
      return `between ${positionName(connection.from)} and ${positionName(connection.to)}`;
    const route = campaign.sceneLinks.find(
      (link) => link.fromSceneId === scene.id && link.requiresOpenBarriers?.includes(doorId),
    );
    if (route) return `on the way to ${sceneName(route.toSceneId)}`;
    return `at ${positionName(game!.state.barriers[doorId]?.position ?? "")}`;
  }

  function attachOptions() {
    return [
      ...game!.definition.connections.map((c) => ({
        value: `connection:${c.from}:${c.to}`,
        label: `Between ${positionName(c.from)} and ${positionName(c.to)}`,
      })),
      ...routes.map((link) => ({
        value: `route:${link.id}`,
        label: `On the way to ${sceneName(link.toSceneId)}`,
      })),
    ];
  }

  function attachDoor(doorId: string) {
    const choice = attachTo[doorId] ?? "";
    if (choice.startsWith("route:"))
      attemptCampaign(() => attachDoorToRoute(campaign, scene.id, doorId, choice.slice(6)));
    else if (choice.startsWith("connection:")) {
      const [, from, to] = choice.split(":");
      attempt(() => attachDoorToConnection(scene, doorId, from!, to!));
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
              <span className="storyboard-scene-parts__attach">
                {positions.length > 1 && (
                  <select
                    aria-label={`Position of ${actor.name}`}
                    value={actor.position}
                    disabled={busy}
                    onChange={(event) =>
                      attempt(() =>
                        setPersonPosition(scene, characterOf(actor.id), event.target.value),
                      )
                    }
                  >
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        Stands at {position.name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label={`Attitude of ${actor.name}`}
                  value={isHostile(game, actor) ? "hostile" : "neutral"}
                  disabled={busy}
                  onChange={(event) =>
                    attempt(() =>
                      setAttitude(scene, characterOf(actor.id), event.target.value as Attitude),
                    )
                  }
                >
                  <option value="neutral">Neutral</option>
                  <option value="hostile">Hostile</option>
                </select>
                <select
                  aria-label={`Toughness of ${actor.name}`}
                  value={toughnessOf(actor) ?? "custom"}
                  disabled={busy}
                  onChange={(event) =>
                    attempt(() =>
                      setToughness(scene, characterOf(actor.id), event.target.value as Toughness),
                    )
                  }
                >
                  {toughnessOf(actor) === undefined && (
                    <option value="custom">Custom ({actor.maxHp} health)</option>
                  )}
                  <option value="weak">Weak (6 health)</option>
                  <option value="normal">Normal (12 health)</option>
                  <option value="tough">Tough (20 health)</option>
                </select>
              </span>
              {isHostile(game, actor) && actor.weapons.length > 0 && (
                <span className="storyboard-scene-parts__attach">
                  <label>
                    Retreats at health{" "}
                    <input
                      type="number"
                      min={0}
                      max={actor.maxHp}
                      aria-label={`Retreat at health for ${actor.name}`}
                      defaultValue={actor.tactics?.retreatAt ?? 0}
                      disabled={busy}
                      onBlur={(event) =>
                        attempt(() =>
                          setTactics(scene, characterOf(actor.id), {
                            retreatAt: Number(event.target.value),
                          }),
                        )
                      }
                    />
                  </label>
                  <select
                    aria-label={`Runs to, for ${actor.name}`}
                    value={actor.tactics?.escapeTo ?? ""}
                    disabled={busy}
                    onChange={(event) =>
                      attempt(() =>
                        setTactics(scene, characterOf(actor.id), {
                          escapeTo: event.target.value || null,
                        }),
                      )
                    }
                  >
                    <option value="">Does not run</option>
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        Runs to {position.name}
                      </option>
                    ))}
                  </select>
                </span>
              )}
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
              {"heldBy" in entry.where &&
                game.definition.weapons.find((weapon) => weapon.id === entry.itemId)
                  ?.usesAmmunition && (
                  <label className="storyboard-scene-parts__rounds">
                    Rounds{" "}
                    <input
                      type="number"
                      min={0}
                      max={999}
                      aria-label={`Rounds of ${itemName(entry.itemId)}`}
                      defaultValue={
                        game.state.actors[entry.where.heldBy]?.ammunition[entry.itemId] ?? 0
                      }
                      disabled={busy}
                      onBlur={(event) => {
                        const holder = (entry.where as { heldBy: string }).heldBy;
                        attempt(() =>
                          setAmmunition(scene, holder, entry.itemId, Number(event.target.value)),
                        );
                      }}
                    />
                  </label>
                )}
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
      <div className="storyboard-scene-parts__group">
        <strong>Doors</strong>
        {doors.length === 0 && <p className="playable-hint">No doors in this scene.</p>}
        <ul>
          {doors.map((door) => (
            <li key={door.id}>
              <span>
                {door.name} ·{" "}
                {door.locked ? `locked with ${itemName(door.keyId ?? "")}` : "not locked"} ·{" "}
                {doorPlace(door.id)}
              </span>
              <button
                type="button"
                className="playable-remove"
                disabled={busy}
                aria-label={`Remove ${door.name}`}
                onClick={() => attemptCampaign(() => removeDoor(campaign, scene.id, door.id))}
              >
                Remove
              </button>
              {attachOptions().length > 0 && (
                <span className="storyboard-scene-parts__attach">
                  <select
                    aria-label={`Where ${door.name} stands`}
                    value={attachTo[door.id] ?? ""}
                    disabled={busy}
                    onChange={(event) =>
                      setAttachTo((current) => ({ ...current, [door.id]: event.target.value }))
                    }
                  >
                    <option value="">Put it…</option>
                    {attachOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !attachTo[door.id]}
                    aria-label={`Put ${door.name} there`}
                    onClick={() => attachDoor(door.id)}
                  >
                    Put here
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="storyboard-scene-parts__add">
          <input
            aria-label="Door name"
            value={doorName}
            maxLength={120}
            disabled={busy}
            placeholder="For example: The cellar door"
            onChange={(event) => setDoorName(event.target.value)}
          />
          <select
            aria-label="Door position"
            value={doorPosition || positions[0]!.id}
            disabled={busy}
            onChange={(event) => setDoorPosition(event.target.value)}
          >
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                At {position.name}
              </option>
            ))}
          </select>
          <label className="playable-check">
            <input
              type="checkbox"
              checked={doorLocked}
              disabled={busy}
              onChange={(event) => setDoorLocked(event.target.checked)}
            />{" "}
            Locked
          </label>
          {doorLocked && (
            <select
              aria-label="Key to the door"
              value={doorKey}
              disabled={busy}
              onChange={(event) => setDoorKey(event.target.value)}
            >
              <option value="">Choose the key</option>
              {things.map((thing) => (
                <option key={thing.id} value={thing.id}>
                  {thing.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={busy || !doorName.trim()}
            onClick={() => {
              try {
                const made = addDoor(scene, {
                  name: doorName,
                  position: doorPosition || positions[0]!.id,
                  locked: doorLocked,
                  keyId: doorKey,
                });
                onChange(made.scene);
                setMessage("");
                setDoorName("");
                setDoorLocked(false);
                setDoorKey("");
              } catch (reason) {
                setMessage(reason instanceof Error ? reason.message : "Could not add the door.");
              }
            }}
          >
            Add door
          </button>
        </div>
      </div>
    </section>
  );
}
