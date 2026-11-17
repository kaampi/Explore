import { useState } from "react";
import type {
  CampaignScene,
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
} from "../../library/LibrarySchema";
import { actorIdFor, addPerson, placeItem } from "../../library/sceneParts";

export type DraftLibrary = {
  characters: CharacterTemplate[];
  places: PlaceTemplate[];
  objects: ObjectTemplate[];
};

/**
 * Notes from the manuscript event a scene was started from, and suggestions of who, where and what
 * it seems to mention. Every suggestion is a button the author chooses to press; nothing is added
 * on its own, and the notes are never played or sent to a model.
 */
export function ManuscriptDraftBox({
  scene,
  campaign,
  library,
  mapped,
  mapPlaces,
  busy,
  onScene,
  onCampaign,
  onUsePlace,
}: {
  scene: CampaignScene;
  campaign: CampaignTemplate;
  library: DraftLibrary;
  /** The adventure places its scenes on a map, so a place is chosen there, not from a card. */
  mapped: boolean;
  /** The map places of the adventure, when it uses a map: a place can be used if it is on that map. */
  mapPlaces?: readonly { place: { id: string } }[] | undefined;
  busy: boolean;
  onScene: (scene: CampaignScene) => void;
  onCampaign: (campaign: CampaignTemplate) => void;
  onUsePlace: (place: PlaceTemplate) => void;
}) {
  const [message, setMessage] = useState("");
  const draft = scene.draft;
  if (!draft) return null;
  const game = scene.encounter;
  const people = draft.suggestedCharacterIds
    .map((id) => library.characters.find((card) => card.id === id))
    .filter((card): card is CharacterTemplate => !!card);
  const things = draft.suggestedObjectIds
    .map((id) => library.objects.find((card) => card.id === id))
    .filter((card): card is ObjectTemplate => !!card);
  const places = [draft.suggestedPlaceId, ...draft.otherPlaceIds]
    .map((id) => library.places.find((card) => card.id === id))
    .filter((card): card is PlaceTemplate => !!card);

  /** Change the scene, and make sure the adventure itself knows the card. */
  function attempt(
    change: () => CampaignScene,
    extra?: { characterId?: string; objectId?: string },
  ) {
    try {
      const next = change();
      setMessage("");
      const people = campaign.people.some((p) => p.characterId === extra?.characterId)
        ? campaign.people
        : extra?.characterId
          ? [...campaign.people, { characterId: extra.characterId, stats: {}, lore: [] }]
          : campaign.people;
      const objectIds =
        extra?.objectId && !campaign.objectIds.includes(extra.objectId)
          ? [...campaign.objectIds, extra.objectId]
          : campaign.objectIds;
      if (people !== campaign.people || objectIds !== campaign.objectIds)
        onCampaign({
          ...campaign,
          people,
          objectIds,
          scenes: campaign.scenes.map((item) => (item.id === next.id ? next : item)),
        });
      else onScene(next);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not do that.");
    }
  }

  return (
    <section className="storyboard-manuscript" aria-label="From the manuscript">
      <div className="storyboard-panel-heading">
        <small>FROM THE MANUSCRIPT</small>
        <h4>{scene.name || "Untitled event"}</h4>
      </div>
      {draft.facts.length > 0 ? (
        <ul>
          {draft.facts.map((fact, index) => (
            <li key={index}>
              <strong>{fact.label || "Note"}:</strong> {fact.value}
            </li>
          ))}
        </ul>
      ) : (
        <p className="playable-hint">The manuscript says nothing more about this event.</p>
      )}
      {(people.length > 0 || things.length > 0 || places.length > 0) && (
        <>
          <p className="playable-hint">
            Suggestions from the names in the notes. Nothing is added until you choose it.
            {!game && people.length + things.length > 0
              ? " Make the scene playable to add people and things."
              : ""}
          </p>
          <div className="storyboard-manuscript__suggestions">
            {places.map((place) =>
              scene.placeId === place.id ? (
                <span key={place.id}>{place.name} is the place</span>
              ) : (
                <button
                  key={place.id}
                  type="button"
                  disabled={
                    busy || (mapped && !mapPlaces?.some((entry) => entry.place.id === place.id))
                  }
                  title={
                    mapped && !mapPlaces?.some((entry) => entry.place.id === place.id)
                      ? "This adventure uses a map. Choose the place on the map."
                      : undefined
                  }
                  onClick={() => onUsePlace(place)}
                >
                  Use {place.name} as the place
                </button>
              ),
            )}
            {people.map((person) =>
              game?.state.actors[actorIdFor(person.id)] ? (
                <span key={person.id}>{person.name} is in this scene</span>
              ) : (
                <button
                  key={person.id}
                  type="button"
                  disabled={busy || !game}
                  onClick={() =>
                    attempt(() => addPerson(scene, person), { characterId: person.id })
                  }
                >
                  Add {person.name} to this scene
                </button>
              ),
            )}
            {things.map((thing) =>
              scene.objectIds.includes(thing.id) ? (
                <span key={thing.id}>{thing.name} is here</span>
              ) : (
                <button
                  key={thing.id}
                  type="button"
                  disabled={busy || !game}
                  onClick={() =>
                    attempt(
                      () =>
                        placeItem(scene, thing, {
                          position: game!.definition.places[0]!.id,
                        }),
                      { objectId: thing.id },
                    )
                  }
                >
                  Place {thing.name} here
                </button>
              ),
            )}
          </div>
        </>
      )}
      {message && (
        <p role="alert" className="storyboard-scene-parts__error">
          {message}
        </p>
      )}
      <button
        type="button"
        className="playable-remove"
        disabled={busy}
        onClick={() => {
          const { draft: _drop, ...rest } = scene;
          onScene(rest);
        }}
      >
        Dismiss manuscript notes
      </button>
    </section>
  );
}
