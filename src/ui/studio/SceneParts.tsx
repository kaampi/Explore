import { useState } from "react";
import {
  placePerson,
  setHidden,
  setOnReveal,
  setStance,
  stanceOf,
  type Stance,
} from "../../library/sceneCast";
import { useTranslate } from "../i18n/LanguageProvider";
import type {
  CampaignScene,
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
  SceneCast,
} from "../../library/LibrarySchema";
import {
  actorIdFor,
  addDoor,
  addPerson,
  addContainer,
  addPickUp,
  openAction,
  containerContents,
  addTry,
  TRY_VERBS,
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
  setTactics,
  setToughness,
  toughnessOf,
  healthFor,
  DEFAULT_PLAYER_HEALTH,
  isHostile,
  type Toughness,
  type ItemPlace,
} from "../../library/sceneParts";

const NEW_POSITION = "__new-position__";

/** "Who and what is here": the people and things in one scene. */
export function SceneParts({
  campaign,
  scene,
  people,
  things,
  facts = [],
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
  /** Facts an outcome can set, to say what reveals a hidden person. */
  facts?: { id: string; label: string }[];
  busy: boolean;
  onChange: (scene: CampaignScene) => void;
  /** For changes that reach more than one scene, such as a door on a route. */
  onChangeCampaign: (campaign: CampaignTemplate) => void;
  onOpenLibrary?: ((what: "people" | "things") => void) | undefined;
}) {
  const t = useTranslate();
  const [personId, setPersonId] = useState("");
  const [thingId, setThingId] = useState("");
  const [inside, setInside] = useState<Record<string, string>>({});
  const [lockKey, setLockKey] = useState<Record<string, string>>({});
  const [tryVerb, setTryVerb] = useState<Record<string, string>>({});
  const [where, setWhere] = useState("position:");
  const [message, setMessage] = useState("");
  const [doorName, setDoorName] = useState("");
  const [doorPosition, setDoorPosition] = useState("");
  const [doorLocked, setDoorLocked] = useState(false);
  const [doorKey, setDoorKey] = useState("");
  const [attachTo, setAttachTo] = useState<Record<string, string>>({});
  const [newPosition, setNewPosition] = useState<Record<string, string>>({});
  const [willHide, setWillHide] = useState<Record<string, boolean>>({});
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
  const castOf = (actorId: string) =>
    scene.people.find((pick) => pick.characterId === characterOf(actorId));
  const changeCast = (actorId: string, change: Partial<SceneCast>) =>
    attempt(() => ({
      ...scene,
      people: scene.people.map((pick) =>
        pick.characterId === characterOf(actorId) ? { ...pick, ...change } : pick,
      ),
    }));
  /** The facts that can reveal someone; the one already chosen stays listed even if unreachable. */
  const revealOptions = (chosen?: string) =>
    chosen && !facts.some((fact) => fact.id === chosen)
      ? [...facts, { id: chosen, label: chosen }]
      : facts;

  function attempt(change: () => CampaignScene) {
    try {
      onChange(change());
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : t("spCouldNotChange"));
    }
  }

  function attemptCampaign(change: () => CampaignTemplate) {
    try {
      onChangeCampaign(change());
      setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : t("spCouldNotChange"));
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
    if (route) return t("spOnTheWay", { name: sceneName(route.toSceneId) });
    return t("spAtPlace", { name: positionName(game!.state.barriers[doorId]?.position ?? "") });
  }

  function attachOptions() {
    return [
      ...game!.definition.connections.map((c) => ({
        value: `connection:${c.from}:${c.to}`,
        label: t("spBetween", { a: positionName(c.from), b: positionName(c.to) }),
      })),
      ...routes.map((link) => ({
        value: `route:${link.id}`,
        label: t("spOnTheWayTo", { name: sceneName(link.toSceneId) }),
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
      return t("spAtPlace", {
        name: positions.find((p) => p.id === place.position)?.name ?? place.position,
      });
    const holder = game!.state.actors[place.heldBy];
    return t("spCarriedBy", {
      name: place.heldBy === player.id ? t("spYou") : (holder?.name ?? t("spSomeone")),
    });
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
      <h4>{t("spHeading")}</h4>
      {message && (
        <p role="alert" className="storyboard-scene-parts__error">
          {message}
        </p>
      )}
      <div className="storyboard-scene-parts__group">
        <strong>{t("spPeople")}</strong>
        {here.length === 0 && <p className="playable-hint">{t("spNoOne")}</p>}
        <datalist id="storyboard-moods">
          {t("spMoodSuggestions")
            .split(",")
            .map((mood) => (
              <option key={mood} value={mood.trim()} />
            ))}
        </datalist>
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
                {t("spRemove")}
              </button>
              <span className="storyboard-scene-parts__attach">
                <select
                  aria-label={`Position of ${actor.name}`}
                  value={newPosition[actor.id] !== undefined ? NEW_POSITION : actor.position}
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.value === NEW_POSITION)
                      setNewPosition({ ...newPosition, [actor.id]: "" });
                    else {
                      setNewPosition(({ [actor.id]: _closed, ...rest }) => rest);
                      attempt(() =>
                        placePerson(scene, characterOf(actor.id), {
                          positionId: event.target.value,
                        }),
                      );
                    }
                  }}
                >
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {t("spStandsAt", { name: position.name })}
                    </option>
                  ))}
                  <option value={NEW_POSITION}>{t("spNewPosition")}</option>
                </select>
                {newPosition[actor.id] !== undefined && (
                  <>
                    <input
                      type="text"
                      aria-label={`${t("spNewPositionName")} (${actor.name})`}
                      value={newPosition[actor.id]}
                      disabled={busy}
                      onChange={(event) =>
                        setNewPosition({ ...newPosition, [actor.id]: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      disabled={busy || !newPosition[actor.id]!.trim()}
                      aria-label={`${t("spAddPosition")} (${actor.name})`}
                      onClick={() => {
                        attempt(() =>
                          placePerson(scene, characterOf(actor.id), {
                            name: newPosition[actor.id]!,
                          }),
                        );
                        setNewPosition(({ [actor.id]: _done, ...rest }) => rest);
                      }}
                    >
                      {t("spAddPosition")}
                    </button>
                  </>
                )}
                <select
                  aria-label={`Attitude of ${actor.name}`}
                  value={stanceOf(scene, characterOf(actor.id))}
                  disabled={busy}
                  onChange={(event) =>
                    attempt(() =>
                      setStance(scene, characterOf(actor.id), event.target.value as Stance),
                    )
                  }
                >
                  <option value="friendly">{t("spFriendly")}</option>
                  <option value="neutral">{t("spNeutral")}</option>
                  <option value="hostile">{t("spHostile")}</option>
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
                    <option value="custom">{t("spCustom", { health: actor.maxHp })}</option>
                  )}
                  {(["weak", "normal", "tough"] as const).map((level) => (
                    <option key={level} value={level}>
                      {t("spToughOption", {
                        level: t(
                          level === "weak" ? "spWeak" : level === "normal" ? "spNormal" : "spTough",
                        ),
                        health: healthFor(
                          level,
                          game.definition.rules.playerHealth ?? DEFAULT_PLAYER_HEALTH,
                        ),
                      })}
                    </option>
                  ))}
                </select>
              </span>
              <span className="storyboard-scene-parts__attach">
                <label>
                  {t("spMood")}{" "}
                  <input
                    type="text"
                    list="storyboard-moods"
                    aria-label={`Mood of ${actor.name}`}
                    defaultValue={castOf(actor.id)?.mood ?? ""}
                    disabled={busy}
                    onBlur={(event) => changeCast(actor.id, { mood: event.target.value })}
                  />
                </label>
                <label>
                  {t("spTrust")}{" "}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`Trust of ${actor.name}`}
                    key={`trust-${actor.id}-${castOf(actor.id)?.trust ?? ""}`}
                    defaultValue={castOf(actor.id)?.trust ?? "20"}
                    disabled={busy}
                    onBlur={(event) => changeCast(actor.id, { trust: event.target.value })}
                  />
                </label>
              </span>
              <span className="storyboard-scene-parts__attach">
                <select
                  aria-label={`Visibility of ${actor.name}`}
                  value={castOf(actor.id)?.hidden || willHide[actor.id] ? "hidden" : "visible"}
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.value === "visible") {
                      setWillHide(({ [actor.id]: _shown, ...rest }) => rest);
                      attempt(() => setHidden(scene, characterOf(actor.id), null));
                    } else setWillHide({ ...willHide, [actor.id]: true });
                  }}
                >
                  <option value="visible">{t("spVisible")}</option>
                  <option value="hidden">{t("spHiddenUntil")}…</option>
                </select>
                {(castOf(actor.id)?.hidden || willHide[actor.id]) &&
                  (facts.length === 0 && !castOf(actor.id)?.hidden ? (
                    <span className="playable-hint">{t("spNoFacts")}</span>
                  ) : (
                    <select
                      aria-label={`Revealed by for ${actor.name}`}
                      value={castOf(actor.id)?.hidden?.revealedBy ?? ""}
                      disabled={busy}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        setWillHide(({ [actor.id]: _set, ...rest }) => rest);
                        attempt(() => setHidden(scene, characterOf(actor.id), event.target.value));
                      }}
                    >
                      <option value="">{t("spChooseFact")}</option>
                      {revealOptions(castOf(actor.id)?.hidden?.revealedBy).map((fact) => (
                        <option key={fact.id} value={fact.id}>
                          {fact.label}
                        </option>
                      ))}
                    </select>
                  ))}
                {castOf(actor.id)?.hidden && isHostile(game, actor) && (
                  <label>
                    {t("spOnReveal")}{" "}
                    <select
                      aria-label={`On reveal for ${actor.name}`}
                      value={castOf(actor.id)?.onReveal ?? "wait"}
                      disabled={busy}
                      onChange={(event) =>
                        attempt(() =>
                          setOnReveal(
                            scene,
                            characterOf(actor.id),
                            event.target.value as "wait" | "attack",
                          ),
                        )
                      }
                    >
                      <option value="wait">{t("spWaits")}</option>
                      <option value="attack">{t("spAttacks")}</option>
                    </select>
                  </label>
                )}
              </span>
              {isHostile(game, actor) && actor.weapons.length > 0 && (
                <span className="storyboard-scene-parts__attach">
                  <label>
                    {t("spRetreats")}{" "}
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
                    <option value="">{t("spDoesNotRun")}</option>
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {t("spRunsTo", { name: position.name })}
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
            {t("spNoCast")}{" "}
            {onOpenLibrary && (
              <button
                type="button"
                className="setup-text-btn"
                onClick={() => onOpenLibrary("people")}
              >
                {t("spOpenCast")}
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
              <option value="">
                {available.length ? t("spChoosePerson") : t("spEveryoneHere")}
              </option>
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
              {t("spAddPerson")}
            </button>
          </div>
        )}
      </div>
      <div className="storyboard-scene-parts__group">
        <strong>{t("spThings")}</strong>
        {placed.length === 0 && <p className="playable-hint">{t("spNoThings")}</p>}
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
                    {t("spRounds")}{" "}
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
                  {t("spPickUp")}
                </button>
              )}
              {"position" in entry.where && things.some((t) => t.id === entry.itemId) && (
                <>
                  <select
                    aria-label={`What to try with ${itemName(entry.itemId)}`}
                    value={tryVerb[entry.itemId] ?? "Use"}
                    onChange={(e) => setTryVerb({ ...tryVerb, [entry.itemId]: e.target.value })}
                  >
                    {TRY_VERBS.map((verb) => (
                      <option key={verb}>{verb}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Add a try with ${itemName(entry.itemId)}`}
                    onClick={() =>
                      attempt(() =>
                        addTry(
                          scene,
                          things.find((t) => t.id === entry.itemId)!,
                          {
                            verb: tryVerb[entry.itemId] ?? "Use",
                          },
                        ),
                      )
                    }
                  >
                    {t("spTry")}
                  </button>
                </>
              )}
              {"position" in entry.where &&
                things.find((t) => t.id === entry.itemId)?.openable &&
                !openAction(scene, entry.itemId) && (
                  <>
                    <select
                      aria-label={`What is inside ${itemName(entry.itemId)}`}
                      value={inside[entry.itemId] ?? ""}
                      onChange={(e) => setInside({ ...inside, [entry.itemId]: e.target.value })}
                    >
                      <option value="">{t("spNothingInside")}</option>
                      {things
                        .filter(
                          (t) =>
                            !t.weapon &&
                            t.id !== entry.itemId &&
                            !game.definition.items.some((i) => i.id === t.id),
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                    {things.find((t) => t.id === entry.itemId)?.lockable && (
                      <select
                        aria-label={`Key to ${itemName(entry.itemId)}`}
                        value={lockKey[entry.itemId] ?? ""}
                        onChange={(e) => setLockKey({ ...lockKey, [entry.itemId]: e.target.value })}
                      >
                        <option value="">{t("spNotLocked")}</option>
                        {itemsHere(scene)
                          .filter((e) => e.itemId !== entry.itemId)
                          .map((e) => (
                            <option key={e.itemId} value={e.itemId}>
                              {itemName(e.itemId)}
                            </option>
                          ))}
                      </select>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Make ${itemName(entry.itemId)} a container`}
                      onClick={() =>
                        attempt(() =>
                          addContainer(
                            scene,
                            things.find((t) => t.id === entry.itemId)!,
                            {
                              contents: things.filter((t) => t.id === inside[entry.itemId]),
                              ...(lockKey[entry.itemId]
                                ? { key: things.find((t) => t.id === lockKey[entry.itemId])! }
                                : {}),
                            },
                          ),
                        )
                      }
                    >
                      {t("spContainer")}
                    </button>
                  </>
                )}
              {containerContents(scene, entry.itemId).length > 0 && (
                <span className="playable-hint">
                  Holds {containerContents(scene, entry.itemId).join(", ")}
                </span>
              )}
              <button
                type="button"
                className="playable-remove"
                disabled={busy}
                aria-label={`Remove ${itemName(entry.itemId)}`}
                onClick={() => attempt(() => removeItem(scene, entry.itemId))}
              >
                {t("spRemove")}
              </button>
            </li>
          ))}
        </ul>
        {things.length === 0 ? (
          <p className="playable-hint">
            {t("spNoThingsAdv")}{" "}
            {onOpenLibrary && (
              <button
                type="button"
                className="setup-text-btn"
                onClick={() => onOpenLibrary("things")}
              >
                {t("spOpenThings")}
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
              <option value="">{t("spChooseThing")}</option>
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
              <option value={`held:${player.id}`}>{t("spCarriedByYou")}</option>
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
              {t("spPlaceThing")}
            </button>
          </div>
        )}
      </div>
      <div className="storyboard-scene-parts__group">
        <strong>{t("spDoors")}</strong>
        {doors.length === 0 && <p className="playable-hint">{t("spNoDoors")}</p>}
        <ul>
          {doors.map((door) => (
            <li key={door.id}>
              <span>
                {door.name} ·{" "}
                {door.locked
                  ? t("spLockedWith", { name: itemName(door.keyId ?? "") })
                  : t("spNotLockedLower")}{" "}
                · {doorPlace(door.id)}
              </span>
              <button
                type="button"
                className="playable-remove"
                disabled={busy}
                aria-label={`Remove ${door.name}`}
                onClick={() => attemptCampaign(() => removeDoor(campaign, scene.id, door.id))}
              >
                {t("spRemove")}
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
                    <option value="">{t("spPutIt")}</option>
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
                    {t("spPutHere")}
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
            placeholder={t("spDoorPlaceholder")}
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
            {t("spLocked")}
          </label>
          {doorLocked && (
            <select
              aria-label="Key to the door"
              value={doorKey}
              disabled={busy}
              onChange={(event) => setDoorKey(event.target.value)}
            >
              <option value="">{t("spChooseKey")}</option>
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
                setMessage(reason instanceof Error ? reason.message : t("spCouldNotAddDoor"));
              }
            }}
          >
            {t("spAddDoor")}
          </button>
        </div>
      </div>
    </section>
  );
}
