import { pinSessionFactions } from "@state/anatomy";
import { startInnExample } from "../../scenarios/innVisit";
import { startGatehouseExample } from "../../scenarios/gatehouse";
import { loadingBayScenario } from "./encounterScenario";
import { PlayStartPaths } from "./PlayStartPaths";
import { CheckUpdates } from "./CheckUpdates";
import { useEffect, useState } from "react";
import { useTranslate } from "../i18n/LanguageProvider";
import conversationsWorld from "../assets/conversations-world.webp";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import {
  newCharacterTemplate,
  type CampaignTemplate,
  type CharacterTemplate,
  type PlaceTemplate,
  type RealmTemplate,
  type RulesetTemplate,
  type VoiceTemplate,
} from "@library/LibrarySchema";
import {
  exampleCharacterTemplate,
  examplePlaceTemplate,
  exampleRealmDunbaar,
  exampleRulesetTemplates,
  exampleVoiceTemplates,
  mergeWithExamples,
} from "@library/exampleTemplates";
import { formatPersonName } from "@library/personName";
import type { Session } from "@state/StateSchema";
import { primaryCharacter } from "@session/createSession";
import { sessionFromCampaignScene } from "@session/campaignStart";
import type { StudioView } from "../studio/types";
import { portraitSrc } from "../studio/portrait";
import { MorphPortrait } from "../studio/MorphPortrait";
import { Modal } from "../components/Modal";
import { quickCharacterSession } from "./quickStart";
import { ChatSetupFields } from "./ChatSetupFields";
import { useConnection } from "../connection/ConnectionProvider";
import { initialModel } from "../connection/connection";
import type { ConversationEntry } from "@persistence/ConversationSchema";
import { HomeConnection } from "../connection/ConnectionHelp";
import { WorldArtwork } from "./WorldArtwork";
import { CoreManuscripts } from "./CoreManuscripts";
import { ExploreWorldDialog } from "./ExploreWorldDialog";

export function HomeScreen({
  repo,
  session,
  sessionId,
  onResume,
  onStart,
  onStudio,
  conversations = [],
  navigationBusy = false,
}: {
  conversations?: ConversationEntry[];
  navigationBusy?: boolean;
  repo: IndexedDBRepository;
  session: Session | null;
  sessionId: string;
  onResume: () => void;
  onStart: (session: Session) => Promise<void>;
  onStudio: (view: StudioView) => void;
}) {
  const t = useTranslate();
  const [characters, setCharacters] = useState<CharacterTemplate[]>([]);
  const [realms, setRealms] = useState<RealmTemplate[]>([]);
  const [places, setPlaces] = useState<PlaceTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignTemplate[]>([]);
  const [voices, setVoices] = useState<VoiceTemplate[]>([]);
  const [rulesets, setRulesets] = useState<RulesetTemplate[]>([]);
  const [chatCharacter, setChatCharacter] = useState<CharacterTemplate | null>(null);
  const [chatPlaceId, setChatPlaceId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [rulesetId, setRulesetId] = useState("");
  const chatPlaces = mergeWithExamples(places, [examplePlaceTemplate()]);
  const chatVoices = mergeWithExamples(voices, exampleVoiceTemplates());
  const chatRulesets = mergeWithExamples(rulesets, exampleRulesetTemplates());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { discovery, preferredModel, refresh } = useConnection();
  const [starting, setBusy] = useState(false);
  const busy = starting || navigationBusy;
  const [rulesTest, setRulesTest] = useState(false);
  const [freePicker, setFreePicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPersonality, setQuickPersonality] = useState("");
  const [world, setWorld] = useState<RealmTemplate | null>(null);
  const [exploring, setExploring] = useState<RealmTemplate | null>(null);
  const [campaign, setCampaign] = useState<CampaignTemplate | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [characterId, setCharacterId] = useState("");
  useEffect(() => {
    let cancelled = false;
    repo
      .installExampleMona()
      .then(() =>
        Promise.all([
          repo.listCharacters(),
          repo.listRealms(),
          repo.listPlaces(),
          repo.listCampaigns(),
          repo.listVoices(),
          repo.listRulesets(),
        ]),
      )
      .then(([people, worlds, venues, stories, narrativeVoices, ruleSets]) => {
        if (cancelled) return;
        setCharacters(people);
        setRealms(worlds);
        setPlaces(venues);
        setCampaigns(stories);
        setVoices(narrativeVoices);
        setRulesets(ruleSets);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load your library.");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);
  async function startCharacter(
    character: CharacterTemplate,
    place?: PlaceTemplate,
    realm?: RealmTemplate,
  ) {
    setBusy(true);
    setError(null);
    try {
      const connection = discovery.state === "checking" ? await refresh() : discovery;
      const model = initialModel(preferredModel, connection.models) || session?.runtime.model;
      const voice = chatVoices.find((item) => item.id === voiceId);
      const ruleset = chatRulesets.find((item) => item.id === rulesetId);
      await onStart(
        pinSessionFactions(
          quickCharacterSession(character, sessionId, {
            ...(place ? { place } : {}),
            ...(realm ? { realm } : {}),
            ...(model ? { model } : {}),
            ...(voice ? { voice } : {}),
            ...(ruleset ? { ruleset } : {}),
          }),
          await repo.listFactions(),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this conversation.");
    } finally {
      setBusy(false);
    }
  }
  async function startCampaign(sceneId: string) {
    if (!campaign) return;
    const scene = campaign.scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    setBusy(true);
    setError(null);
    try {
      const [objects, voices, rulesets] = await Promise.all([
        repo.listObjects(),
        repo.listVoices(),
        repo.listRulesets(),
      ]);
      const built = sessionFromCampaignScene(
        {
          campaign,
          scene,
          places,
          realms,
          characters,
          objects,
          voices,
          rulesets,
        },
        sessionId,
      );
      if (!built.ok) throw new Error(built.reason);
      await onStart(built.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this adventure.");
    } finally {
      setBusy(false);
    }
  }
  const person = session ? primaryCharacter(session) : null;
  const currentTitle = conversations.find((entry) => entry.id === session?.id)?.title;
  const lastTurn = session?.conversation.at(-1);
  const recent =
    lastTurn &&
    typeof lastTurn === "object" &&
    "content" in lastTurn &&
    typeof lastTurn.content === "string"
      ? lastTurn.content
      : undefined;
  function openCreate() {
    setChatPlaceId("");
    setVoiceId("");
    setRulesetId("");
    setCreating(true);
    setError(null);
  }
  async function createAndChat() {
    if (!quickName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const character = newCharacterTemplate({
        name: quickName.trim(),
        personality: quickPersonality.trim(),
      });
      await repo.saveCharacter(character);
      setCharacters((items) => [...items, character]);
      setCreating(false);
      setQuickName("");
      setQuickPersonality("");
      const place = chatPlaces.find((item) => item.id === chatPlaceId);
      await startCharacter(character, place, realmFor(place));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this character.");
    } finally {
      setBusy(false);
    }
  }
  function openWorld(realm: RealmTemplate) {
    setVoiceId("");
    setRulesetId("");
    setWorld(realm);
    setPlaceId(places.find((place) => place.realmId === realm.id)?.id ?? "");
    setCharacterId(characters[0]?.id ?? "");
    setError(null);
  }
  function realmFor(place?: PlaceTemplate): RealmTemplate | undefined {
    return place
      ? (realms.find((item) => item.id === place.realmId) ??
          (place.realmId === exampleRealmDunbaar().id ? exampleRealmDunbaar() : undefined))
      : undefined;
  }
  function openChatSetup(character: CharacterTemplate, place?: PlaceTemplate) {
    setChatCharacter(character);
    setChatPlaceId(place?.id ?? "");
    setVoiceId("");
    setRulesetId("");
    setError(null);
  }
  const chatFields = (
    <ChatSetupFields
      places={chatPlaces}
      voices={chatVoices}
      rulesets={chatRulesets}
      placeId={chatPlaceId}
      voiceId={voiceId}
      rulesetId={rulesetId}
      onPlace={setChatPlaceId}
      onVoice={setVoiceId}
      onRuleset={setRulesetId}
      disabled={busy}
    />
  );
  return (
    <main className="sb-home sb-home--welcome">
      <section className="sb-hero sb-hero--welcome" aria-label="Welcome to Explore">
        <img
          className="sb-hero__image"
          src={conversationsWorld}
          alt=""
          // React 18 does not know the camelCase fetchPriority. The lowercase attribute reaches the browser.
          {...{ fetchpriority: "high" }}
        />
        <div className="sb-hero__shade" />
        <div className="sb-hero__content">
          <h1>
            {t("hsAFamiliarFace")}
            <em>{t("hsAWorldOfPossibilities")}</em>
          </h1>
          <p>{t("tagline")}</p>
          <CheckUpdates />
        </div>
      </section>
      <PlayStartPaths
        onFree={() => setFreePicker(true)}
        onStudio={(view) => {
          if (view === "rulesets") setRulesTest(true);
          else onStudio(view);
        }}
        adventures={[...campaigns]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((item) => ({ id: item.id, name: item.name, scenes: item.scenes.length }))}
        onPlayAdventure={(id) => {
          const chosen = campaigns.find((item) => item.id === id);
          if (!chosen) return;
          setCampaign(chosen);
          setError(null);
        }}
        disabled={busy || !ready}
      />
      {!ready ? (
        <p className="sb-muted" role="status">
          {t("hsOpeningYourWorlds")}
        </p>
      ) : (
        <>
          <HomeConnection showSettings={false} />
          <CoreManuscripts repo={repo} />
          <section className="sb-home-section">
            <div className="sb-section-heading">
              <h2>{t("hsSomeoneToTalkTo")}</h2>
              <div className="sb-section-links">
                <button type="button" className="sb-link" onClick={openCreate}>
                  ＋ Create
                </button>
                <button type="button" className="sb-link" onClick={() => onStudio("characters")}>
                  {t("hsImportCard")}
                </button>
              </div>
            </div>
            <p className="sb-section-description">{t("hsNoDestinationRequiredChoose")}</p>
            <div className="sb-character-grid">
              {characters.map((character) => (
                <button
                  type="button"
                  className="sb-character-card"
                  key={character.id}
                  disabled={busy}
                  onClick={() => openChatSetup(character)}
                >
                  <MorphPortrait
                    characterId={character.id}
                    repo={repo}
                    fallback={portraitSrc(character.portraitDataUrl)}
                    className="sb-character-morph"
                    initial={character.name.charAt(0)}
                  />
                  <span>
                    <strong>
                      {formatPersonName(character.name, character.familyName, character.middleName)}
                    </strong>
                    {character.id === "example-mona-sanchez" && (
                      <small>Built-in demo · Morph portrait</small>
                    )}
                    <small>
                      {character.personality ||
                        character.mood ||
                        "A conversation waiting to happen."}
                    </small>
                    <b>{t("hsStartAConversation")}</b>
                  </span>
                </button>
              ))}
              {characters.length === 0 && (
                <div className="sb-empty-card">
                  <span aria-hidden="true">♧</span>
                  <h3>{t("hsACharacterIsEnough")}</h3>
                  <p>{t("hsCreateSomeoneNewOr")}</p>
                  <button type="button" className="sb-button" onClick={openCreate}>
                    {t("hsAddACharacter")}
                  </button>
                </div>
              )}
              <button
                type="button"
                className="sb-example-card"
                disabled={busy}
                onClick={() => openChatSetup(exampleCharacterTemplate(), examplePlaceTemplate())}
              >
                <span className="sb-eyebrow">A PLACE TO START · BUILT-IN EXAMPLE</span>
                <h3>Meet Emma at the Aurora Room</h3>
                <p>A quiet venue, a familiar face, and the beginning of a conversation.</p>
                <span>
                  {t("hsTryAConversation")}
                  <b>→</b>
                </span>
              </button>
            </div>
          </section>
          <section className="sb-home-section">
            <div className="sb-section-heading">
              <h2>{t("worldsWaiting")}</h2>
              <button type="button" className="sb-link" onClick={() => onStudio("places")}>
                {t("manageWorlds")}
              </button>
            </div>
            <p className="sb-section-description">{t("worldsIntro")}</p>
            <div className="sb-world-grid">
              {realms.map((realm, index) => (
                <button
                  type="button"
                  className="sb-world-card"
                  key={realm.id}
                  onClick={() => openWorld(realm)}
                >
                  <div className="sb-world-card__art">
                    {realm.imageDataUrl || realm.thumbDataUrl ? (
                      <img src={realm.imageDataUrl || realm.thumbDataUrl} alt="" />
                    ) : (
                      <WorldArtwork variant={index} />
                    )}
                    <span>{t("worldBadge")}</span>
                  </div>
                  <div>
                    <h3>{realm.name}</h3>
                    <p>{realm.note || t("worldNoteEmpty")}</p>
                    <small>
                      {t("placeCount", {
                        count: places.filter((place) => place.realmId === realm.id).length,
                      })}{" "}
                      <b>↗</b>
                    </small>
                  </div>
                </button>
              ))}
              {campaigns.map((item) => (
                <button
                  type="button"
                  className="sb-world-card sb-adventure-card"
                  key={item.id}
                  onClick={() => {
                    setCampaign(item);
                    setError(null);
                  }}
                >
                  <span className="sb-eyebrow">{t("preparedAdventure")}</span>
                  <h3>{item.name}</h3>
                  <p>{item.playerIntro || t("adventureIntroEmpty")}</p>
                  <small>
                    {t(item.scenes.length === 1 ? "sceneOne" : "sceneMany", {
                      count: item.scenes.length,
                    })}{" "}
                    <b>↗</b>
                  </small>
                </button>
              ))}
              {realms.length === 0 && campaigns.length === 0 && (
                <div className="sb-empty-world">
                  <span aria-hidden="true">⌖</span>
                  <div>
                    <h3>{t("worldLater")}</h3>
                    <p>{t("worldLaterHint")}</p>
                  </div>
                  <button type="button" className="sb-link" onClick={() => onStudio("places")}>
                    {t("createWorld")}
                  </button>
                </div>
              )}
            </div>
          </section>
          <div className="sb-ecosystem-note">
            <span aria-hidden="true">✧</span>
            <p>
              <strong>{t("hsOneImaginationMoreWays")}</strong>
              <br />
              {t("hsWriteInKaampiWrite")}
            </p>
            <button type="button" className="sb-link" onClick={() => onStudio("campaigns")}>
              {t("hsOpenYourStudio")}
            </button>
          </div>
        </>
      )}
      {error && !world && !campaign && !creating && !chatCharacter && (
        <p className="sb-error" role="alert">
          {error}
        </p>
      )}
      {rulesTest && (
        <Modal
          title={t("hsTryAGameWith")}
          onClose={() => {
            if (!busy) setRulesTest(false);
          }}
        >
          <p>{t("hsChooseAShortScenario")}</p>
          <div className="sb-rules-scenarios">
            {[
              {
                title: "The gatehouse",
                genre: "Fantasy · Exploration & combat",
                description:
                  "Mona guards a locked city gate. Persuade her, find another way in, or face the guards.",
                label: "Try the gate scenario",
                create: (id: string, model?: string) => startGatehouseExample(repo, id, model),
              },
              {
                title: "The Copper Lantern",
                genre: "Exploration · Rooms & return visits",
                description:
                  "Visit an inn, find a key and unlock its store room. Leave and return to see what the world remembers.",
                label: "Try the inn",
                create: (id: string, model?: string) => startInnExample(repo, id, model),
              },
              {
                title: "The orbital depot",
                genre: "Sci-fi · Bargaining, trading & combat",
                description:
                  "Meet quartermaster Imani, bargain for supplies, and explore a depot guarded by officers and a patrol drone.",
                label: "Try the orbital depot",
                create: loadingBayScenario,
              },
            ].map((scenario) => (
              <section key={scenario.title}>
                <small>{scenario.genre}</small>
                <h3>{scenario.title}</h3>
                <p>{scenario.description}</p>
                <button
                  type="button"
                  className="sb-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const connection =
                        discovery.state === "checking" ? await refresh() : discovery;
                      const model =
                        initialModel(preferredModel, connection.models) || session?.runtime.model;
                      await onStart(await scenario.create(sessionId, model));
                      setRulesTest(false);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not start the scenario.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {scenario.label}
                </button>
              </section>
            ))}
          </div>
          <p>{t("hsUncertainChecksUseD100")}</p>
          <div className="sb-dialog__actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRulesTest(false);
                onStudio("rulesets");
              }}
            >
              {t("hsManageRuleSets")}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
      {freePicker && (
        <Modal title={t("hsChooseSomeoneToMeet")} wide onClose={() => setFreePicker(false)}>
          <p className="sb-muted">{t("hsStartFreelyWithA")}</p>
          <div className="sb-free-character-picker">
            {mergeWithExamples(characters, [exampleCharacterTemplate()]).map((character) => (
              <button
                type="button"
                key={character.id}
                disabled={busy}
                onClick={() => {
                  setFreePicker(false);
                  openChatSetup(character);
                }}
              >
                {portraitSrc(character.portraitDataUrl) && (
                  <img src={portraitSrc(character.portraitDataUrl)} alt="" />
                )}
                <span>
                  <strong>
                    {formatPersonName(character.name, character.familyName, character.middleName)}
                  </strong>
                  <small>
                    {character.personality?.slice(0, 150) ||
                      "Choose a setting and begin your conversation."}
                  </small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <div className="sb-dialog__actions">
            <button type="button" className="sb-link" onClick={() => setFreePicker(false)}>
              {t("psCancel")}
            </button>
            <button
              type="button"
              className="sb-button"
              disabled={busy}
              onClick={() => {
                setFreePicker(false);
                openCreate();
              }}
            >
              {t("hsCreateANewCharacter")}
            </button>
          </div>
        </Modal>
      )}
      {chatCharacter && (
        <Modal
          title={`Chat with ${formatPersonName(chatCharacter.name, chatCharacter.familyName, chatCharacter.middleName)}`}
          onClose={() => {
            if (!busy) setChatCharacter(null);
          }}
        >
          <p className="sb-muted">{t("hsChooseASettingOr")}</p>
          {chatFields}
          {error && (
            <p className="sb-error" role="alert">
              {error}
            </p>
          )}
          <div className="sb-dialog__actions">
            <button
              type="button"
              className="sb-link"
              disabled={busy}
              onClick={() => setChatCharacter(null)}
            >
              {t("psCancel")}
            </button>
            <button
              type="button"
              className="sb-button"
              disabled={busy}
              onClick={() => {
                const place = chatPlaces.find((item) => item.id === chatPlaceId);
                void startCharacter(chatCharacter, place, realmFor(place));
              }}
            >
              {busy ? "Opening…" : "Start conversation →"}
            </button>
          </div>
        </Modal>
      )}
      {creating && (
        <Modal title={t("hsSomeoneNewToMeet")} onClose={() => setCreating(false)}>
          <p className="sb-muted">{t("hsANameIsEnough")}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createAndChat();
            }}
          >
            <label className="sb-field">
              {t("hsName")}
              <input
                required
                maxLength={100}
                value={quickName}
                onChange={(event) => setQuickName(event.target.value)}
                placeholder={t("hsWhatAreTheyCalled")}
              />
            </label>
            <label className="sb-field">
              {t("hsPersonality")}
              <span>{t("optional")}</span>
              <textarea
                maxLength={5000}
                rows={4}
                value={quickPersonality}
                onChange={(event) => setQuickPersonality(event.target.value)}
                placeholder={t("hsACuriousCartographerWith")}
              />
            </label>
            {chatFields}
            {error && (
              <p className="sb-error" role="alert">
                {error}
              </p>
            )}
            <div className="sb-dialog__actions">
              <button type="button" className="sb-link" onClick={() => onStudio("characters")}>
                {t("hsOpenFullCharacterStudio")}
              </button>
              <button type="submit" className="sb-button" disabled={busy || !quickName.trim()}>
                {busy ? "Opening…" : "Create & chat →"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {world && (
        <Modal title={world.name} onClose={() => setWorld(null)}>
          <p className="sb-muted">{t("hsChooseAPlaceAnd")}</p>
          <label className="sb-field">
            {t("hsVisitAPlace")}
            <select value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
              <option value="">{t("psChooseAPlace")}</option>
              {places
                .filter((place) => place.realmId === world.id)
                .map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="sb-field">
            {t("hsMeetACharacter")}
            <select value={characterId} onChange={(event) => setCharacterId(event.target.value)}>
              <option value="">{t("hsChooseACharacter")}</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {formatPersonName(character.name, character.familyName, character.middleName)}
                </option>
              ))}
            </select>
          </label>
          {!places.some((place) => place.realmId === world.id) && (
            <p className="sb-muted">{t("hsThisWorldNeedsA")}</p>
          )}
          <ChatSetupFields
            places={chatPlaces}
            voices={chatVoices}
            rulesets={chatRulesets}
            placeId={placeId}
            voiceId={voiceId}
            rulesetId={rulesetId}
            onPlace={setPlaceId}
            onVoice={setVoiceId}
            onRuleset={setRulesetId}
            disabled={busy}
            includePlace={false}
          />
          {characters.length === 0 && <p className="sb-muted">{t("hsAddACharacterTo")}</p>}
          {error && (
            <p role="alert" className="sb-error">
              {error}
            </p>
          )}
          <div className="sb-dialog__actions">
            <button type="button" className="sb-link" onClick={() => onStudio("places")}>
              {t("hsWorldsPlaces")}
            </button>
            {world.worldMap && world.worldMap.nodes.length > 0 && (
              <button
                type="button"
                className="sb-link"
                disabled={busy}
                onClick={() => {
                  setExploring(world);
                  setWorld(null);
                }}
              >
                {t("exploreWorldLink")}
              </button>
            )}
            <button
              type="button"
              className="sb-button"
              disabled={busy || !placeId || !characterId}
              onClick={() => {
                const character = characters.find((item) => item.id === characterId);
                const place = places.find((item) => item.id === placeId);
                if (character && place) void startCharacter(character, place, world);
              }}
            >
              {busy ? "Opening…" : "Begin exploring →"}
            </button>
          </div>
        </Modal>
      )}
      {exploring && (
        <ExploreWorldDialog
          repo={repo}
          world={exploring}
          places={places}
          rulesets={rulesets}
          sessionId={sessionId}
          model={initialModel(preferredModel, discovery.models) || session?.runtime.model}
          onStart={onStart}
          onClose={() => setExploring(null)}
        />
      )}
      {campaign && (
        <Modal title={campaign.name} onClose={() => setCampaign(null)}>
          <p className="sb-muted">
            {campaign.playerIntro || "Choose where to enter the adventure."}
          </p>
          <div className="sb-scene-list">
            {campaign.scenes.map((scene) => (
              <button
                type="button"
                className="sb-scene-choice"
                key={scene.id}
                disabled={busy}
                onClick={() => void startCampaign(scene.id)}
              >
                <strong>
                  {scene.name ||
                    places.find((place) => place.id === scene.placeId)?.name ||
                    "Untitled scene"}
                </strong>
                <span>{t("hsEnterScene")}</span>
              </button>
            ))}
          </div>
          {campaign.scenes.length === 0 && <p className="sb-muted">{t("hsThisAdventureHasNo")}</p>}
          {error && (
            <p role="alert" className="sb-error">
              {error}
            </p>
          )}
          <button type="button" className="sb-link" onClick={() => onStudio("campaigns")}>
            {t("hsOpenAdventureStudio")}
          </button>
        </Modal>
      )}
    </main>
  );
}
