# kaampi Explore — public alpha release checklist

This checklist tracks readiness for the first public tester build. **A public repository is not the same as a verified release.** Do not tag a release until the build and smoke tests pass.

## Release gates

- [x] Public repository and AGPL-3.0-or-later license in `LICENSE`.
- [x] Windows/macOS/Linux launcher scripts and installation guide.
- [x] Updated README and in-app Guide navigation to Settings → AI Settings.
- [x] GitHub Actions workflow for build and tests.
- [ ] **BLOCKER:** GitHub Actions `npm run build` must pass on the current `main` commit.
- [ ] Run `npm run typecheck`, `npm test`, and `npm run build` locally.
- [ ] Fresh-install smoke test on a clean browser profile with Ollama or Strata.
- [ ] Verify a new character can be created, chatted with, saved, and reopened.
- [ ] Verify switching the UI language and Light/Dark, including persistence after reload.
- [ ] Verify Settings and Guide are accurate for the current interface.
- [ ] Verify Anatomy Studio built-in templates and gallery images. Gallery paths reference `public/anatomy/`; confirm image binaries are committed or document missing illustrations.
- [ ] Verify character import, conversations and basic backup/export.
- [ ] Verify Windows launcher on a clean machine; macOS/Linux testers should confirm their launchers.
- [ ] Review bundled images and third-party assets for distribution rights.
- [ ] Create GitHub pre-release tag (proposed: `v0.1.0-alpha.1`) and release notes **only after passing gates**.

## Known limitations to disclose

- Alpha stability: save/export important content before updating.
- UI language support is partial (English, Swedish, Norwegian Bokmål); changing interface language does not set the language of AI-generated conversations.
- AI replies require a separately installed and running local Ollama or Strata model.
- Character/anatomy and gallery UI are actively evolving; some image assets may be absent from the source checkout.
- Local browser storage is not shared across browsers or profiles.

## Tester report template

**Environment:** OS/version, browser/version, app commit or release, AI engine and model.

**What I tried:** Steps from opening kaampi Explore.

**Expected:** What should have happened.

**Actual:** What happened, including error text or screenshot.

**Reproducibility:** Always / sometimes / once.

**Data safety:** Did any saved conversation or character appear to be lost? Please avoid including private data in public issues.

Report issues at https://github.com/kaampi/Explore/issues/new .

## Pre-release notes draft

**kaampi Explore v0.1.0-alpha.1 — early tester preview**

Local-first AI character conversations and creative exploration with Ollama/Strata, saved conversation library, character import, lorebooks, worlds/places, adventures, a customizable appearance, an evolving anatomy library and partial English/Swedish/Norwegian interface localization.

This is an experimental alpha. Expect unfinished UI, changes between versions and possible bugs. Please back up your content. Setup: [docs/running.md](running.md). Feedback: [GitHub issues](https://github.com/kaampi/Explore/issues).
