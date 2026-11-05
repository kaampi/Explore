import { MorphExplainer } from "./MorphExplainer";
import { mapTopics, storyboardTopics } from "./worldGuideTopics";
import { Modal } from "../components/Modal";
import "./guide.css";
import { useEffect, useState } from "react";

type Topic = { id: string; label: string; title: string; intro: string; steps: Array<{ title: string; body: string }> };

export const GUIDE_TOPICS: Topic[] = [
{
  "id": "explore",
  "label": "What is Explore?",
  "title": "What is Explore?",
  "intro": "Explore is a place to play and experience your own world through conversations with AI. Meet characters, explore places and shape what happens next — with as much freedom or structure as you want. You can use Explore on its own, or as part of your creative process.",
  "steps": [
    {
      "title": "A conversation can be the whole experience",
      "body": "Choose a character, connect your local AI and start talking. You do not need a complete world, a ruleset or a prepared adventure. Casual chat and free roleplay are full ways to use Explore, not just steps towards something more structured."
    },
    {
      "title": "Part of the kaampi Family",
      "body": "Explore is also a way to discover new possibilities for a world you are writing or drawing. Within the kaampi Family, Write helps you develop your writing, Comic helps you tell stories in comic form, and Explore lets you step into a world and play. Try a conversation between characters, follow an unexpected choice or experience a scene from another point of view. What happens may suggest new dialogue, conflicts or story ideas to take back to Write or Comic. Explore never changes the established truth of your world in Write. Events, dialogue and discoveries from your play remain possibilities and suggestions. You decide which, if any, to bring into Write or Comic and make part of your story."
    },
    {
      "title": "Play freely with god mode",
      "body": "In open chat, you can direct the scene, characters and story yourself. Change the setting, introduce an event or take the conversation in a new direction. Leave rules and storylines out when you want this freedom. For example: “Move the scene to a quiet inn. Our characters already know each other.”"
    },
    {
      "title": "Your AI model has its own boundaries",
      "body": "In open chat, you decide what to explore. Explore does not add its own content filters; your connected AI model determines what it will respond to and how. Different models may have different boundaries. God mode gives you creative control over the story, but it does not override your AI model’s own restrictions. A model may still refuse or ignore requests based on how it was trained or configured."
    },
    {
      "title": "Add structure when you want it",
      "body": "Use a world you create or import, with places, background lore, rulesets and adventures when you want a richer setting or a more guided experience. These give the conversation a framework. You decide whether to play freely or let world rules and consequences shape the experience."
    },
    {
      "title": "Is it like SillyTavern, Agnai or other AI chat apps?",
      "body": "If you have used AI chat apps for character conversations or free roleplay, you will find familiar ideas in Explore. You can stay in open chat, or use Explore’s tools for worlds, rules and adventures. You can also bring worlds and characters from other AI chat apps into Explore using supported import formats. Imported character cards may need review because apps can interpret their fields differently."
    },
    {
      "title": "What Explore is — and what to expect",
      "body": "The experience is driven mainly by conversation and described actions. It is not a traditional game with fully animated environments, and you do not need to be writing a book to use it. The AI can misunderstand or contradict earlier events. Explore supports continuity, but does not guarantee a perfect simulation."
    },
    {
      "title": "Start small",
      "body": "Continue to Your first conversation for a short walkthrough. Open AI setup if your local model is not connected yet. You can return to world building or animated chat portraits in Morph Studio whenever you want."
    }
  ]
},
{
  "id": "start",
  "label": "Your first conversation",
  "title": "Your first conversation",
  "intro": "Start small: connect your AI, choose someone to talk to and write your first message. You can add a world, rules or a longer adventure whenever you want.",
  "steps": [
    {
      "title": "Before you begin",
      "body": "You need a running local AI server with a chat model installed. Open Settings → AI Settings, choose your engine and select a Chat model. If you have not connected one yet, the AI setup section walks you through it."
    },
    {
      "title": "1. Choose someone to talk to",
      "body": "Open My space and choose a character under Someone to talk to. You can use an existing character, create one, import a supported character card from the library or try the built-in conversation example."
    },
    {
      "title": "2. Keep the setup simple",
      "body": "Selecting a character opens the conversation setup. Place, Rule-set and Voice are optional. Leave all three as None for an open conversation. A place adds a setting, a ruleset adds structure, and a voice shapes the narration style. You do not need them to begin."
    },
    {
      "title": "3. Give the scene a starting point",
      "body": "Start the conversation and write something the character can respond to. For example: “Hi, I’m John. Is this seat taken?” Or combine an action and dialogue: “I sit down across from you. What brings you here?” A clear opening gives the AI something concrete to work with."
    },
    {
      "title": "4. Build on the reply",
      "body": "Read the response, then say or do something in return. You can ask a question, describe an action or introduce a detail. Short messages work well; you do not need to explain the entire story in each turn."
    },
    {
      "title": "5. Return to your conversation",
      "body": "Your conversation is saved locally. Open My conversations to continue it later. Use the same browser profile and Explore address: browser storage belongs to that address, so another port, browser or computer may show a different library. Keep separate backups of content you want to protect."
    },
    {
      "title": "If you do not get a reply",
      "body": "Open Settings → AI Settings and check that your server is running and a chat model is selected. If Explore cannot connect, continue to AI setup. You can read the guide and prepare characters while you sort out the connection."
    }
  ]
},
{
  "id": "ai",
  "label": "AI setup",
  "title": "Connect your local AI",
  "intro": "Explore provides the world and conversation tools; your connected AI model generates the replies. You choose and run that model through a local AI engine.",
  "steps": [
    {
      "title": "Understand the three parts",
      "body": "Explore is the app you play in. An AI engine, such as Ollama or Strata, runs the model and lets Explore communicate with it. The model is what generates the text. Installing an engine alone is not enough: it also needs an installed chat model."
    },
    {
      "title": "1. Open AI Settings",
      "body": "Open Settings from Explore’s top menu, then AI Settings. Under AI engine, choose Ollama or Strata (OpenAI-compatible), matching the engine you actually run."
    },
    {
      "title": "2. Connect with Ollama",
      "body": "Install and open Ollama on your computer, then download a chat-capable model in Ollama. Keep it running while you use Explore. Explore looks for Ollama at http://localhost:11434; there is no address field to fill in for this engine."
    },
    {
      "title": "Or connect with Strata",
      "body": "Start Strata and enable its OpenAI-compatible HTTP API. Select Strata (OpenAI-compatible) in Explore and enter the address from Strata in Strata API URL. The address and port must match your Strata configuration. Allow browser access (CORS) in the server configuration."
    },
    {
      "title": "3. Check the connection",
      "body": "Click Try again or Check connection. A successful connection means Explore can reach the engine. If the model list is empty, install a chat model in that engine and check again. Models for tasks such as embeddings are not chat models."
    },
    {
      "title": "4. Select your Chat model",
      "body": "Choose an installed model under Chat model. You are ready when the connection panel confirms the engine and model are available. Close Settings and start a conversation. You can return here to change the model later."
    },
    {
      "title": "If the engine is running but cannot connect",
      "body": "Keep Explore and the AI engine running on the same computer for this setup. Check the server address and port. Ollama may need the Explore page’s address allowed in OLLAMA_ORIGINS; restart Ollama after changing that setting. For Strata, check its API and browser-access settings. Running Explore locally avoids restrictions that can affect a hosted page connecting to a local server."
    },
    {
      "title": "If replies are slow or disappointing",
      "body": "Reply speed depends on your model and computer. First try a short message in a simple conversation. More demanding models may need more memory and take longer. Different models also vary in writing style, instruction following and content boundaries; choose one that suits how you want to play."
    }
  ]
},
{
  "id": "play",
  "label": "Play your way",
  "title": "Play your way",
  "intro": "You choose how much freedom or structure belongs in your experience. A quiet character conversation, an improvised scene and a guided adventure are all ways to play Explore.",
  "steps": [
    {
      "title": "Open chat and god mode",
      "body": "Start with a character and leave rules and storylines out for an open conversation. Speak as yourself or play a role. In god mode, you can also direct the scene: “It starts raining, and we hurry into the inn.” Your model may still refuse or misunderstand a request; creative freedom does not override its own restrictions."
    },
    {
      "title": "Explore a world",
      "body": "Use a world and its places when you want a shared setting. You can follow your curiosity without a fixed storyline: visit a location, ask about its history or see how a character reacts to an unexpected visitor. Imported worlds can be a starting point too."
    },
    {
      "title": "Follow an adventure",
      "body": "A prepared adventure gives you scenes, characters and a starting situation. Rules and storylines can guide what happens. Describe what you attempt and let the response develop the scene, rather than assuming every action succeeds."
    },
    {
      "title": "Revisit familiar characters",
      "body": "You can use familiar characters and settings to explore alternative encounters or possibilities. How closely the conversation follows the source depends on the character information, world details and model. If consistency matters, provide the relevant facts instead of assuming the model knows them."
    },
    {
      "title": "Write dialogue and actions naturally",
      "body": "Try “I ask the guard who passed through the gate” or “I set the lantern on the table and open the map.” Clear actions help the scene stay understandable. In a structured world, describe attempts and respect its rules; in open god mode, you can deliberately change the premise."
    },
    {
      "title": "Steer or retry a response",
      "body": "If a reply misses the point, clarify what you meant in the next message. You can also use regenerate for another version of the latest reply, with an optional note. Replay revisits an earlier beat; later chat is undone, so read the confirmation before continuing. These tools can change the direction of the conversation."
    },
    {
      "title": "Keep ideas worth returning to",
      "body": "Use Save as idea on a message, or Capture ideas to select parts of the conversation. Find saved material in My ideas. A surprising exchange can become inspiration for Write or Comic, but it does not change the truth established in Write. You choose what to take into your story."
    }
  ]
},
  { id: "characters", label: "Characters", title: "Bring characters to life", intro: "A character can be simple or detailed. Start small and add information when you need it.", steps: [
    { title: "Personality and appearance", body: "Describe how someone acts and looks. Short, clear descriptions work well." },
    { title: "Import a card", body: "Use the character library to import supported character cards, including SillyTavern content. Review imported details before playing." },
    { title: "Anatomy and voice", body: "Advanced settings can describe body structure and narration style. You can leave them at their defaults for your first conversation." }
  ] },
  { id: "worlds", label: "Worlds", title: "Give your story a place", intro: "Your world can be one you create in Explore or one you import. Worlds, places and lore help the AI understand its setting.", steps: [
    { title: "Worlds and places", body: "Open My library → World Maps to create a world and its actual locations. Map Studio lets you paint terrain, place entities and connect routes. The Map Studio chapters below walk through these steps. Location templates are reusable starting definitions; placed locations belong to a particular world." },
    { title: "Lorebooks", body: "Keep background information about people, locations and history in lorebooks. Relevant information can guide the conversation." },
    { title: "Objects and rules", body: "Describe important objects and create rulesets when you want the world to follow specific rules." }
  ] },
  { id: "adventures", label: "Adventure overview", title: "Build a playable adventure", intro: "An adventure combines places, playable situations and choices. Build the geography in Map Studio and the prepared situations in Storyboard Editor.", steps: [
    { title: "Start small", body: "Open Adventures and create or select a campaign. Connected adventure example provides a small working adventure: ask Edda about a missing messenger, visit the watchtower, read the note and report back. Test this scene starts a new saved playthrough. My conversations resumes an existing run." },
    { title: "A place and a scene are different", body: "A map location describes where something exists. A scene describes a situation there, such as investigating a ruin or having a private conversation. Multiple scenes can use the same place. A Storyboard connection controls a continuation; it is not itself a road or a travel-time calculation." },
    { title: "Prepare the possibilities", body: "In Storyboard Editor, choose an Adventure map, select a scene’s Place on map and write its arrival text. Add Possible actions with prepared outcomes, optional skill rolls and discovery conditions. Connect scenes to make later choices available after the relevant outcomes. Continue to the following chapters for each step." }
  ] },
  { id: "continuity", label: "Memory and continuity", title: "Keeping the world consistent", intro: "kaampi Explore tries to remember what has changed, not just what was said.", steps: [
    { title: "Persistent state", body: "The engine tracks important changes separately from AI narration. A saved playable adventure retains conversation history, discoveries, player health and equipment across scene transitions. Each scene also has its own tracked state. Shared NPC relationship memory and automatic presence across all scenes are still being developed." },
    { title: "Physical continuity", body: "If both hands are holding something, your character should not suddenly use a third hand. Releasing a grip or changing position should happen explicitly." },
    { title: "AI limitations", body: "Local models can still make mistakes. If something seems wrong, note what happened and include the steps in a bug report." }
  ] },
  { id: "library", label: "Your library", title: "Keep your creations", intro: "Your characters and conversations are yours to manage.", steps: [
    { title: "Saved conversations", body: "Open My conversations to return to an earlier chat. Check that your changes were saved before closing the app." },
    { title: "Import and export", body: "Use the available library import and backup tools to move or protect your content. Keep a separate backup before testing new alpha versions." }
  ] },
  { id: "help", label: "Troubleshooting", title: "When something does not work", intro: "Most first-run problems come from the local AI connection.", steps: [
    { title: "No AI reply", body: "Make sure Ollama or Strata is running. Open Settings → AI Settings and check the engine, connection status and Chat model. Try a smaller model if replies are very slow." },
    { title: "Cannot connect", body: "Open Settings → AI Settings. Check the server is running. For Strata, verify its API URL; for Ollama, check http://localhost:11434. The server must allow browser access (CORS). A hosted page may not be able to reach your local AI." },
    { title: "Model not found", body: "Open Settings → AI Settings and select an installed chat-capable model. After installing a new model, click Check connection or Try again to refresh the list." },
    { title: "Found a bug?", body: "Include what you clicked, what you expected, what happened, and any visible error. Avoid sharing private conversations or API keys." }
  ] }
];

const morphTopics: Topic[] = [
  {
    "id": "morph-intro",
    "label": "What is morphing?",
    "title": "What is morphing?",
    "intro": "In Explore, morphing brings your character’s portrait to life in the chat. Instead of showing a single still image, the portrait can move smoothly between expressions as the conversation develops — for example, from neutral to smiling.",
    "steps": [
      {
        "title": "Why morph portraits in Explore?",
        "body": "The portraits you prepare in Morph Studio are used in the chat. Explore can choose an expression from the character’s saved profile to suit their reply, then animate the transition from the previous expression. This adds a visual layer to the conversation and helps convey the character’s mood."
      },
      {
        "title": "From the studio to the chat",
        "body": "Prepare at least two expressions, align their meshes and use Save profile to activate the morph profile for the character. Save draft keeps work in progress without activating it. Automatic expression selection currently uses Ollama. The available expressions come from the portraits you have added; morphing does not generate new portraits."
      },
      {
        "title": "More than a fade",
        "body": "A fade blends two images together. Morphing also reshapes them so that corresponding features move towards one another during the transition. Morph Studio combines this movement with a gradual blend between the portraits."
      },
      {
        "title": "The mesh is a map of the image",
        "body": "The mesh is a network of control points, called nodes, connected into triangles. These triangles divide the portrait into small areas. Place corresponding nodes on the same features in both images, such as the corners of the eyes and mouth."
      },
      {
        "title": "The areas between the nodes move too",
        "body": "During the transition, each node moves between its position in the starting portrait and its position in the target portrait. The triangles change shape as their corners move, and the image inside each triangle stretches or compresses with them. The whole area follows the mesh, not just the points themselves."
      },
      {
        "title": "Example: making a smile",
        "body": "If a mouth-corner node sits higher in the smiling portrait, it moves upwards during the transition. The connected triangles carry the surrounding image with it. Carefully matching the nodes helps the mouth and cheeks move together instead of appearing doubled or distorted."
      },
      {
        "title": "The mesh is an editing tool",
        "body": "The lines help you see and adjust how the image is divided. They are not part of the finished portrait. Hide the mesh while reviewing the result, and start with two similar portraits to make alignment easier."
      }
    ]
  },
  {
    "id": "morph-start",
    "label": "Start with two portraits",
    "title": "Start with two portraits",
    "intro": "Morph Studio — create expressive transitions between your character’s portraits.",
    "steps": [
      {
        "title": "Choose your portraits",
        "body": "Choose two portraits of the same character with similar crop, head angle and lighting. Use Upload more images if needed."
      },
      {
        "title": "Select and inspect the pair",
        "body": "Select a starting expression under From and an ending expression under To. The third view previews the result."
      },
      {
        "title": "Check the transition",
        "body": "Move Transition from 0% to 100% and inspect the eyes and mouth halfway through."
      }
    ]
  },
  {
    "id": "morph-mesh",
    "label": "Align the mesh",
    "title": "Align the mesh",
    "intro": "Morph Studio — create expressive transitions between your character’s portraits.",
    "steps": [
      {
        "title": "Match facial features",
        "body": "Choose MESH. Drag corresponding points onto the same facial features in both portraits: eye corners, mouth corners and face outline."
      },
      {
        "title": "Zoom and move around",
        "body": "Make small changes and inspect the preview. Use + and − to zoom, hold Space and drag to pan, and Fit to return to 100%."
      },
      {
        "title": "Refine the mesh",
        "body": "Link views keeps the views moving together. Add mesh point adds detail across expressions."
      },
      {
        "title": "Copy a starting layout",
        "body": "Undo mesh change reverses a mesh edit. Copy mesh 1 → 2 replaces the second mesh positions with those from the first."
      }
    ]
  },
  {
    "id": "morph-eyes",
    "label": "Adjust the eyes",
    "title": "Adjust the eyes",
    "intro": "Morph Studio — create expressive transitions between your character’s portraits.",
    "steps": [
      {
        "title": "Position the eye regions",
        "body": "Choose EYES and position the ellipses over the eyes in both portraits. Resize using the square handles."
      },
      {
        "title": "Enable and inspect correction",
        "body": "Enable Eye correction and inspect the middle of the transition. Eye transition midpoint sets where the eye change is centered; Eye transition duration controls its span; Eye strength controls the amount of correction."
      },
      {
        "title": "Tune one setting at a time",
        "body": "Change one setting at a time and compare with correction switched off."
      }
    ]
  },
  {
    "id": "morph-preview",
    "label": "Preview and timing",
    "title": "Preview and timing",
    "intro": "Morph Studio — create expressive transitions between your character’s portraits.",
    "steps": [
      {
        "title": "Play and pause",
        "body": "Play ↔ runs the transition back and forth. Pause stops playback."
      },
      {
        "title": "Set the pace and check pairs",
        "body": "Moving Transition manually also stops playback for close inspection. Morph duration sets the travel time in one direction, from 0.3 to 6 seconds."
      },
      {
        "title": "Review the result",
        "body": "Check other expression pairs too: duration and eye correction belong to the selected ordered From and To pair."
      }
    ]
  },
  {
    "id": "morph-save",
    "label": "Save and back up",
    "title": "Save and back up",
    "intro": "Morph Studio — create expressive transitions between your character’s portraits.",
    "steps": [
      {
        "title": "Save for later or activate",
        "body": "Use the studio save controls before leaving. Editing marks a profile inactive until saved as a profile again."
      },
      {
        "title": "Export and import a backup",
        "body": "Export JSON downloads the current profile, including images and mesh data. Import JSON loads a profile into the editor; review and save the result."
      },
      {
        "title": "Troubleshoot the result",
        "body": "If the face looks distorted, check corresponding mesh points. For doubled eyes, check the eye regions."
      }
    ]
  }
];
const anatomyTopics: Topic[] = [
  {
    "id": "anatomy-intro",
    "label": "What is Anatomy?",
    "title": "What is Anatomy?",
    "intro": "A body plan describes how a body is put together and what its parts can do — not what an individual character looks like.",
    "steps": [
      {
        "title": "Structure, not appearance",
        "body": "Anatomy describes body parts, how they connect and their physical functions. Hair colour, height, broad hips, eye colour and other individual features belong in the character’s appearance. You do not need a separate body plan for every character."
      },
      {
        "title": "One plan, many characters",
        "body": "A tall red-haired human and a short dark-haired elf can share a humanoid body plan. Their appearances are different, but their basic body structure is the same. Four arms, wings or a different arrangement of limbs are reasons to consider a custom plan."
      },
      {
        "title": "Why does Explore use it?",
        "body": "A conversation can involve holding objects, supporting another character or using a particular limb. A body plan gives Explore an explicit set of parts to refer to when tracking these physical interactions, rather than assuming every character has a human body."
      },
      {
        "title": "A simple example",
        "body": "Imagine a character holding a lantern in one hand and a rope in the other. The scene should account for those occupied hands before another exclusive grip is added. Anatomy identifies the parts; physical continuity tracks their use. Describing a third hand in prose does not add one to the saved body plan."
      },
      {
        "title": "What it does not promise",
        "body": "Anatomy is not a visual character generator or a complete biological simulation. It does not animate limbs or guarantee that every AI sentence respects the body plan. Structural checks apply to recorded physical relations when a character has a body plan pinned to the session."
      }
    ]
  },
  {
    "id": "anatomy-choose",
    "label": "Choose a body plan",
    "title": "Choose a body plan",
    "intro": "Start with an existing structure. Only customize it when the body itself needs to be different.",
    "steps": [
      {
        "title": "1. Open Anatomy",
        "body": "In My library, open Anatomy under Characters & creatures. The Anatomy Library shows built-in and custom body plans. Open a plan to inspect its parts."
      },
      {
        "title": "2. Explore the regions",
        "body": "Select a body region on the left, then a part. You can see what it is attached to and its configured functions, such as Grip and hold or Bear weight. Regions organize the list; attachment describes the structural connection."
      },
      {
        "title": "3. Choose the closest structure",
        "body": "Look at the arrangement of parts rather than the illustration’s appearance. A humanoid plan can suit humans, elves and other characters with the same basic structure. Body-plan illustrations are references, not portraits of every character using that plan."
      },
      {
        "title": "When you can leave it alone",
        "body": "Anatomy is optional on a character. You can begin a simple conversation without choosing a template. Add one when an explicit body structure is useful for your characters and physical interactions."
      }
    ]
  },
  {
    "id": "anatomy-custom",
    "label": "Customize a body plan",
    "title": "Customize a body plan",
    "intro": "Make a reusable structure for characters whose bodies differ from an existing plan.",
    "steps": [
      {
        "title": "1. Customize a copy",
        "body": "Open a suitable plan and select Customize a copy. Built-in plans are protected; a custom copy lets you edit without changing the original. Give it a name that describes the structure. Alternatively, use + New body plan to start small."
      },
      {
        "title": "2. Add and describe parts",
        "body": "Open a region and choose + Add part. Enter the Part name, Body region and a short structural Description. Keep individual traits such as red hair or height on the character instead."
      },
      {
        "title": "3. Set the attachment",
        "body": "Use Attached to to identify the parent part, or choose Independent part. For example, a hand can attach to an arm. If a parent is marked unavailable through removal, its attached descendants are treated as unavailable too. The attachment should match the body’s structure."
      },
      {
        "title": "4. Set functions",
        "body": "Choose the functions appropriate to the part: Grip and hold, Bear weight, Move the body, Sense surroundings or Handle objects. These describe intended physical roles; checking a box does not automatically create a new gameplay ability or guarantee that the AI uses it correctly."
      },
      {
        "title": "5. Add an optional illustration",
        "body": "Upload a PNG, JPEG or WebP as a reference for the body plan. The editor accepts files up to 10 MB and scales larger images to at most 1600 × 1600 pixels. Uploading an image does not create body parts; define those in the editor."
      },
      {
        "title": "6. Save the plan",
        "body": "Select Save body plan and check for the saved confirmation. Customize a copy creates an editable draft; save it before leaving. Review parts and attachments before using the plan on a character."
      }
    ]
  },
  {
    "id": "anatomy-use",
    "label": "Use Anatomy on a character",
    "title": "Use Anatomy on a character",
    "intro": "A reusable body plan becomes relevant to play when you select it for a character and start a session with that character.",
    "steps": [
      {
        "title": "1. Select the plan on the character",
        "body": "Open the character editor and find Anatomy (optional). Choose the saved body plan and save the character. Describe hair, build, height and other individual features in the character’s appearance."
      },
      {
        "title": "2. Start a new session",
        "body": "When a session is created, Explore stores an independent copy of the referenced body plan with it. This keeps an ongoing conversation tied to the structure it started with. Editing the library plan later does not automatically update that session."
      },
      {
        "title": "3. Describe physical actions clearly",
        "body": "Name the relevant part when it matters: “I release the rope with my left hand, then pick up the lantern.” This gives the conversation a clearer sequence than assuming an occupied limb can immediately do something else."
      },
      {
        "title": "Understand the limits",
        "body": "The engine checks referenced body parts in recorded physical relations against the session’s body plan, including unavailable parts. Characters without a pinned plan remain more permissive. AI narration can still make mistakes, and not every sentence becomes a recorded physical relation."
      },
      {
        "title": "Anatomy and Morph serve different purposes",
        "body": "Anatomy defines body structure for physical interactions. Morph Studio prepares portrait transitions for the chat. Changing a body plan does not change a portrait, and a portrait does not define the character’s anatomy."
      }
    ]
  }
];
GUIDE_TOPICS.push(...mapTopics, ...storyboardTopics, ...anatomyTopics, ...morphTopics);
export const GUIDE_CHAPTERS = [
  {title:'Getting started',ids:['explore','start','ai','play']},
  {title:'Your world',ids:['worlds','characters']},
  {title:'Map Studio',ids:mapTopics.map(topic=>topic.id)},
  {title:'Adventures & Storyboard',ids:['adventures',...storyboardTopics.map(topic=>topic.id)]},
  {title:'Anatomy',ids:anatomyTopics.map(topic=>topic.id)},
  {title:'Morph Studio',ids:morphTopics.map(topic=>topic.id)},
  {title:'Keep exploring',ids:['continuity','library','help']}
];
let lastTopic="explore";
export function openGuide(topic="") {window.dispatchEvent(new CustomEvent("explore:guide",{detail:topic}));}
export function GuideHost(){const [topic,setTopic]=useState<string|null>(null);useEffect(()=>{const open=(e:Event)=>setTopic((e as CustomEvent<string>).detail||lastTopic);window.addEventListener("explore:guide",open);return ()=>window.removeEventListener("explore:guide",open);},[]);return topic===null?null:<Modal title="Guide to kaampi Explore" onClose={()=>setTopic(null)} wide><div className="sb-guide-window"><GuidePanel key={topic} initialTopic={topic}/></div></Modal>;}
export function GuidePanel({initialTopic="explore"}:{initialTopic?:string}) {
  const [active, setActive] = useState(initialTopic);
  useEffect(()=>{lastTopic=active;},[active]);
  const topic = GUIDE_TOPICS.find(item => item.id === active) ?? GUIDE_TOPICS[0]!;
  const orderedTopics = GUIDE_CHAPTERS.flatMap(chapter=>chapter.ids);
  const position = orderedTopics.indexOf(topic.id);
  return <main className="sb-guide" aria-label="kaampi Explore guide">
<nav className="sb-guide__tabs" aria-label="Guide chapters"><h2>Contents</h2>{GUIDE_CHAPTERS.map(c=><div key={c.title}><h3>{c.title}</h3>{c.ids.map(id=>{const t=GUIDE_TOPICS.find(t=>t.id===id)!;return <button key={id} type="button" aria-current={active===id?"page":undefined} onClick={()=>setActive(id)}>{t.label}</button>;})}</div>)}</nav>    <section key={active} className="sb-guide__content" aria-live="polite">
      <h2>{topic.title}</h2>
      <p>{topic.intro}</p>

      {topic.id === "morph-intro" && <MorphExplainer />}
      {topic.id === "morph-start" && <section aria-label="Choosing suitable portraits">
        <h3>Choose portraits that work well together</h3>
        <p>Start with images of the same character, facing the same direction, with a similar crop, background and lighting. Keep the head size and position as consistent as possible while changing the expression. This makes the mesh easier to align and helps the transition look smoother.</p>
        <figure className="sb-guide__figure">
          <a href="/guide/morph-portrait-examples.png" target="_blank" rel="noreferrer" aria-label="Open portrait examples in full size (new tab)"><img src="/guide/morph-portrait-examples.png" alt="Four matching portraits of the same character with closed eyes, half-closed eyes, an irritated expression and laughter." /></a>
          <figcaption>One character, a consistent setup and four different expressions. These are useful starting images for a morph. Larger changes, such as an open mouth when laughing, may need more mesh adjustment. <a href="/guide/morph-portrait-examples.png" target="_blank" rel="noreferrer">View full size ↗</a></figcaption>
        </figure>
        <h3>Find your way around Morph Studio</h3>
      </section>}
      {topic.id === "morph-start" && <figure className="sb-guide__figure">
        <a href="/guide/morph-studio-overview.png" target="_blank" rel="noreferrer" aria-label="Open Morph Studio overview in full size (new tab)">
          <img src="/guide/morph-studio-overview.png" alt="Morph Studio with an editable starting portrait on the left, a target portrait in the middle and the transition preview on the right." />
        </a>
        <figcaption>Adjust the starting portrait on the left and the target portrait in the middle. The view on the right previews the transition between them. <a href="/guide/morph-studio-overview.png" target="_blank" rel="noreferrer">View full size ↗</a></figcaption>
      </figure>}
      {topic.steps.map((step, index) => <article key={step.title}><h3>{step.title}</h3><p>{step.body}</p>
      {topic.id === "explore" && index === 0 && <figure className="sb-guide__figure">
        <a href="/guide/morph-in-chat.png" target="_blank" rel="noreferrer" aria-label="Open example conversation in full size (new tab)"><img src="/guide/morph-in-chat.png" alt="An Explore chat between the player John and the character Mona Sanchez, with their messages shown in conversation bubbles." /></a>
        <figcaption>A conversation in Explore: your messages and the character’s replies form the scene together. Write what you say or do, then see how the character responds. <a href="/guide/morph-in-chat.png" target="_blank" rel="noreferrer">View full size ↗</a></figcaption>
      </figure>}
</article>)}
      <nav className="sb-guide__paging" aria-label="Continue reading">
        {position > 0 && <button type="button" onClick={()=>setActive(orderedTopics[position-1]!)}>← {GUIDE_TOPICS.find(item=>item.id===orderedTopics[position-1])?.label}</button>}
        {position < orderedTopics.length-1 && <button type="button" onClick={()=>setActive(orderedTopics[position+1]!)}>{GUIDE_TOPICS.find(item=>item.id===orderedTopics[position+1])?.label} →</button>}
      </nav>
    </section>
  </main>;
}
