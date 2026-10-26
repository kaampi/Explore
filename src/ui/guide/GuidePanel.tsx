import "./guide.css";
import { useState } from "react";

type Topic = { id: string; label: string; title: string; intro: string; steps: Array<{ title: string; body: string }> };

export const GUIDE_TOPICS: Topic[] = [
  { id: "start", label: "Getting started", title: "Your first conversation", intro: "You only need a local AI and a character. You can build a whole world later.", steps: [
    { title: "1. Connect your AI", body: "Click Settings in the left sidebar. In the dialog, find AI Settings on the right. Choose Ollama or Strata, start its local server, check the connection, and select an installed chat model." },
    { title: "2. Pick a character", body: "Choose a character on the home page, create one, or try the built-in example. A name and a short personality are enough to begin." },
    { title: "3. Leave the extras empty", body: "For a simple chat, leave Place, Rule-set and Voice set to None. You do not need a world, a storyline or a prepared scene." },
    { title: "4. Start talking", body: "Start the conversation and write what you say or do. The AI replies as the characters and describes what happens next. Your conversation is saved locally." },
    { title: "Free Chat — God Mode", body: "In a free chat without a rule-set or storyline, you can steer the story directly. Change the setting, introduce an event or tell the AI to take the story in a new direction. For example: ‘Ignore the previous scene. We are now on a spaceship.’ This kind of creative prompt injection is welcome in God Mode. It changes the story, not the app’s security rules or technical limits. The AI may not always follow your instructions perfectly." }
  ] },
  { id: "ai", label: "AI setup", title: "Connect your local AI", intro: "Open Settings in the left sidebar. AI Settings is in the right column of the dialog.", steps: [
    { title: "1. Open Settings", body: "Click Settings in the left sidebar. The dialog opens directly: Appearance & Themes is on the left and AI Settings is on the right." },
    { title: "2. Choose an AI engine", body: "Select Ollama or Strata (OpenAI-compatible) under AI engine. Install and start your chosen local AI server first." },
    { title: "3. Ollama setup", body: "Install and start Ollama, then download a chat-capable model. SandboxAI checks Ollama at http://localhost:11434 automatically; no server address field is needed. If necessary, start the server with ollama serve." },
    { title: "4. Strata setup", body: "Enable the OpenAI-compatible HTTP API in Strata. Enter its API URL in the Strata API URL field that appears. Use the address and port configured in Strata, and allow browser access (CORS)." },
    { title: "5. Connect and select a model", body: "Click Check connection, or Try again if the server is not ready. Once available, choose an installed model under Chat model. If none appears, install a chat model in your AI server and retry." },
    { title: "6. Start a conversation", body: "Close Settings, choose a character and start chatting. Return to Settings at any time to change the engine or model." },
    { title: "Troubleshooting", body: "Check that the server is running and the port is correct. Ollama may require the SandboxAI browser origin in OLLAMA_ORIGINS. A hosted SandboxAI page may not be able to reach your local server; running SandboxAI locally is more reliable." }
  ] },
  { id: "play", label: "Playing", title: "Play your way", intro: "You decide what your character attempts. The AI describes the response, while SandboxAI keeps track of important facts.", steps: [
    { title: "Adventure", body: "Follow a prepared story with its rules and scenes. Your choices still matter." },
    { title: "Free exploration", body: "Explore a world using its rules, without having to follow a fixed storyline." },
    { title: "Fan fiction", body: "Meet familiar characters and explore their world more freely, without a fixed storyline or game rules." },
    { title: "Free Chat and God Mode", body: "If you start with just a character and no rules or storyline, you can give direct creative instructions to change the scene or direction. This is intentional, but it does not bypass application security or technical limits." },
    { title: "Actions and dialogue", body: "Write naturally: ‘I ask where the road leads’ or ‘I open the door.’ If an action is physically impossible, the story should not treat it as successful." }
  ] },
  { id: "characters", label: "Characters", title: "Bring characters to life", intro: "A character can be simple or detailed. Start small and add information when you need it.", steps: [
    { title: "Personality and appearance", body: "Describe how someone acts and looks. Short, clear descriptions work well." },
    { title: "Import a card", body: "Use the character library to import supported character cards, including SillyTavern content. Review imported details before playing." },
    { title: "Anatomy and voice", body: "Advanced settings can describe body structure and narration style. You can leave them at their defaults for your first conversation." }
  ] },
  { id: "worlds", label: "Worlds", title: "Give your story a place", intro: "Worlds, places and lore help the AI understand the setting.", steps: [
    { title: "Worlds and places", body: "Create a world, then add places where characters can meet or travel." },
    { title: "Lorebooks", body: "Keep background information about people, locations and history in lorebooks. Relevant information can guide the conversation." },
    { title: "Objects and rules", body: "Describe important objects and create rulesets when you want the world to follow specific rules." }
  ] },
  { id: "adventures", label: "Adventures", title: "Build a guided adventure", intro: "An adventure gives players a starting point and a direction, without writing every outcome in advance.", steps: [
    { title: "Scenes", body: "Create scenes with characters, places and a situation to explore." },
    { title: "Rulesets", body: "A ruleset defines how the game should work. Leave it optional when you want a looser conversation." },
    { title: "Storylines", body: "Use a storyline to guide an adventure. For free exploration, you do not need one." }
  ] },
  { id: "continuity", label: "Memory and continuity", title: "Keeping the world consistent", intro: "SandboxAI tries to remember what has changed, not just what was said.", steps: [
    { title: "Persistent state", body: "Characters, places and relationships can change as you play. The engine tracks important changes separately from the AI's narration." },
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

export function GuidePanel() {
  const [active, setActive] = useState("start");
  const topic = GUIDE_TOPICS.find(item => item.id === active) ?? GUIDE_TOPICS[0]!;
  return <main className="sb-guide" aria-label="SandboxAI guide">
    <div className="sb-breadcrumb">Your creative space <span>/</span> Guide</div>
    <h1>Guide to SandboxAI</h1>
    <p className="sb-muted">Start with a character. Learn the other tools when you need them.</p>
    <nav className="sb-guide__tabs" aria-label="Guide topics">
      {GUIDE_TOPICS.map(item => <button key={item.id} type="button" className={active === item.id ? "is-active" : ""} aria-current={active === item.id ? "page" : undefined} onClick={() => setActive(item.id)}>{item.label}</button>)}
    </nav>
    <section className="sb-guide__content" aria-live="polite">
      <h2>{topic.title}</h2>
      <p>{topic.intro}</p>
      {topic.steps.map(step => <article key={step.title}><h3>{step.title}</h3><p>{step.body}</p></article>)}
    </section>
  </main>;
}
