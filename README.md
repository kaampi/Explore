<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/kaampi-explore-dark.svg">
    <img src="public/brand/kaampi-explore.svg" alt="kaampi Explore" width="420">
  </picture>
</p>

<p align="center">Meet your characters. Explore their world. Discover your next story.</p>

<p align="center">
  <a href="https://github.com/kaampi/Explore/actions/workflows/verify.yml"><img src="https://github.com/kaampi/Explore/actions/workflows/verify.yml/badge.svg" alt="Build and test status"></a>
  <a href="https://github.com/kaampi/Explore/actions/workflows/desktop-build.yml"><img src="https://github.com/kaampi/Explore/actions/workflows/desktop-build.yml/badge.svg" alt="Windows desktop build status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License: AGPLv3 or later"></a>
</p>

kaampi Explore is a local-first creative playground for character conversations, roleplaying, and interactive stories. Start with one person and a conversation, or bring a whole world of places, lore, and adventures. The AI proposes what happens; you decide what becomes part of your story.

Connect a local model through **Ollama** or **Strata** in **Settings → AI Settings**. No cloud AI account or API key is required. Characters, conversations, and your creative library are saved on your own device.

**Public alpha.** Features and saved-data formats are still evolving. Keep separate exports of important work before updating. The interface has partial support for English, Swedish, and Norwegian Bokmål.

## What's inside

- **Character conversations** — create a character, import a card, or meet the built-in Emma example. A world, campaign, and rule-set are optional.
- **Character Studio & Morph Studio** — develop personalities and appearance, manage portraits, and animate expressions. With an active morph profile, local Ollama can choose a saved expression from a character's chat reaction.
- **Worlds, places & lore** — build your own setting or import supported lorebooks and world formats. Review imported material before adding it to your library.
- **Campaigns & adventures** — bring together characters, locations, objects, voices, and optional rules to explore a story through play.
- **Conversation library** — resume, rename, and archive separate conversations. Edit a line, regenerate a reply, or inspect proposed changes as the story develops.
- **Capture ideas** — save moments from a conversation and export them to kaampi Write's Brainstorm as a separate idea manuscript.
- **Your space** — light and dark layouts, conversation themes, scene backgrounds, ambience, and your own soundtrack.

## The kaampi family

kaampi Explore is one of four sibling apps that share story material via **[kaampi Codex](https://github.com/kaampi/Codex)**, a local service — never a cloud account:

- **[kaampi Write](https://github.com/kaampi/Write)** — long-form prose
- **[kaampi Comic](https://github.com/kaampi/Comic)** — comic scripting and panel layout
- **[kaampi Explore](https://github.com/kaampi/Explore)** (this app) — character conversations, worlds, and adventures
- **[kaampi Codex](https://github.com/kaampi/Codex)** — the local service the others pair with

Each is a sibling, not a module of another. Use Explore on its own, or connect its Windows desktop app to Codex to browse manuscripts and Story Bible material explicitly shared with Explore. Shared material stays under the source app's control.

## Quickstart

**Windows desktop app (Tauri alpha)** — installer builds are available through [Desktop build (Windows)](https://github.com/kaampi/Explore/actions/workflows/desktop-build.yml). Open a successful run, download **kaampi-explore-windows-installer** from **Artifacts**, extract the ZIP, and run **kaampi-Explore-Setup.exe**. GitHub sign-in is required for artifact downloads. If no successful build is available yet, use the source instructions below. Builds are unsigned, and Windows may show a SmartScreen warning. See [Installing and running kaampi Explore](docs/running.md).

The installer includes the app runtime; Node.js and Rust are only needed for development. Your AI model server runs separately. Codex pairing and opening installed sibling apps are Windows desktop features. Linux and macOS currently use the browser version from source; desktop installers for those platforms are not published.

**Running from source** — install [Node.js](https://nodejs.org/), then on Windows double-click **start.bat**; on macOS run **bash starta.command**; on Linux run **bash starta.sh**. Or, on any platform:

```bash
npm install
npm start
```

Opens on [http://localhost:5173](http://localhost:5173). Choose a local AI model in **Settings → AI Settings**, then select a character to start chatting. See the [running guide](docs/running.md) for setup, local data, and troubleshooting. Browser and desktop storage are separate; moving between them does not automatically transfer your library.

## Documentation

- [Installing and running kaampi Explore](docs/running.md) — desktop installer, source setup, local AI, and backups
- [Character pictures & Morph Studio](docs/character-pictures.md) — portraits, expressions, and animation
- [Connecting to kaampi Codex](docs/desktop-codex-pairing.md) — Windows desktop pairing and shared material
- [Importing lorebooks](docs/lore-import.md) and [external worlds](docs/world-imports.md) — supported formats and limits
- [Exporting ideas to kaampi Write](docs/idea-export.md) — turning conversations into writing material
- [Developer reference](docs/developer-reference.md) — architecture, source checks, and historical implementation notes

The app's **Guide** covers everyday use. [Report a problem](https://github.com/kaampi/Explore/issues/new) with steps to reproduce and your app version.

## License

[GNU AGPLv3 or later](LICENSE). Third-party material retains its own licenses; independent user-created or imported content is not automatically covered by the application's license.
