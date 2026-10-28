# Installing and running kaampi Explore

kaampi Explore is a local-first application. You run its interface on your computer and connect it to a local AI server. No cloud AI account or API key is required.

## Before you begin

Install [Node.js](https://nodejs.org/) (including npm). To generate AI replies, also install and run a supported local model server, such as [Ollama](https://ollama.com/) or Strata, and make a chat model available there. The app can open without a working AI connection, but it cannot generate replies until a model is connected.

## Start kaampi Explore

Download the repository as a ZIP from GitHub (**Code → Download ZIP**) and extract it, or clone the repository using Git. Open the extracted project folder. This is an alpha source-code distribution, not a signed desktop installer.

- **Windows:** Double-click `start.bat`. It installs npm dependencies on first run, tries to start Ollama if it is installed but not responding, and opens the app in your browser.
- **macOS:** Run `bash starta.command` in Terminal from the project folder. The launcher is also intended for Finder double-click where macOS allows it.
- **Linux:** Run `bash starta.sh` from a terminal in the project folder.

You can also use the same commands on any platform:

```bash
npm install
npm start
```

The development server opens **http://localhost:5173**. Leave the terminal or command window open while using kaampi Explore. Stop the server with Ctrl+C or by closing the window.

## Connect your local AI

Click **Settings** in the left sidebar. In the Settings dialog, find **AI Settings** in the right-hand column. Choose **Ollama** or **Strata**, check the connection, and select an available **Chat model**. Start the local AI server separately if it is not already running. Ollama commonly uses `http://localhost:11434`; use the address shown by Strata for that backend. If the model list is empty, install or load a model in your local AI server and refresh the connection.

For Ollama, a typical terminal setup is:

```bash
ollama pull llama3.2
ollama serve
```

If Ollama is already running, do not start a second server. If the browser reports a cross-origin (CORS) error, configure the Ollama server to allow the kaampi Explore origin `http://localhost:5173` and restart Ollama. For example, when launching Ollama manually on macOS/Linux:

```bash
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

## Your first chat

On **My space**, choose an existing character or create one with a name and a short personality. In the chat setup, leave **Place**, **Rule-set**, and **Voice** set to **None** for an unstructured conversation. Start the chat and type a message. You do not need a world, campaign, or storyline. Open **Guide** in the app for more details about free chat, God Mode, and adventures.

## Your data and backups

Characters and conversations are saved locally in your browser's storage (IndexedDB), not in the Git repository. Use the app's available export and backup options to keep separate copies. Clearing site data, changing browsers or browser profiles, or using private browsing can make local saves unavailable. Back up your data before upgrading an alpha build.

## Troubleshooting

- **Node/npm not found:** Install Node.js, reopen your terminal, and retry.
- **Port 5173 is occupied:** Stop the other process using that port. Vite may otherwise select a different port; use the URL printed in your terminal.
- **No AI reply:** Confirm the AI server is running, select an installed model in **Settings → AI Settings**, and retry.
- **Cannot connect:** Check the backend URL and local firewall/CORS settings.
- **Slow responses:** Try a smaller local model.

For developer checks, run `npm run typecheck`, `npm test`, and `npm run build`.

## Alpha tester notes

- The interface is partly translated into English, Swedish and Norwegian Bokmål; some screens remain in English.
- This is an early alpha. Please report the operating system, browser, AI engine/model, steps to reproduce, expected result, actual result and relevant console errors for any bug.
- Your data is stored in your browser profile. Back up your characters and conversations before updating or clearing site data. A ZIP download or Git update does not itself migrate browser storage between different site origins or browser profiles.
- If a starter anatomy illustration is missing, the image assets may not be included in your checkout; the gallery currently refers to files under `public/anatomy/`.
- Please avoid posting private character cards, conversations or personal information in public GitHub issues.

[Report a problem](https://github.com/kaampi/Explore/issues/new) or [browse known reports](https://github.com/kaampi/Explore/issues).
