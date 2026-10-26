# Third-party inspiration and clean-room implementation policy

**Status:** Required engineering review for all third-party-inspired work.
**Scope:** Sandbox AI code, tests, prompts, assets, imports, documentation, and AI-assisted contributions.

## Principle

Study third-party products to understand user-facing behavior, interoperability needs, and general technical ideas. Implement functionality independently within Sandbox AI's own architecture. **Do not copy, translate, lightly rewrite, or mechanically port third-party source code** unless the project has explicitly approved that code and its license obligations.

This policy is a practical engineering safeguard, not a legal opinion. Escalate uncertain cases before merging.

## Allowed by default

- Describe user-visible behavior and independently design a solution from Sandbox AI requirements.
- Use general concepts such as contextual retrieval, chapter summaries, checkpoints, and state machines.
- Read documented exchange-format field names and types as needed for interoperability, and implement our own parser, validation, and mappings.
- Create original tests, fixtures, algorithms, prompts, user interface text, and documentation.
- Reference third-party project names and URLs accurately for attribution and compatibility descriptions.

## Not allowed without explicit license review

- Copying third-party source, tests, configuration, UI text, prompts, images, documentation, or bundled creative content.
- Translating or paraphrasing code line by line, preserving distinctive implementation structure, or asking an AI tool to reproduce an upstream function.
- Importing upstream dependencies or snippets without reviewing the actual license, transitive licenses, notices, and distribution obligations.
- Committing upstream fixtures or user-generated stories/assets without permission and provenance.
- Treating publicly accessible code as public domain.

## Aventuras-specific boundary

Aventuras is distributed under **AGPL-3.0** (verify the upstream license and version before each significant integration). The existence of a similar feature does not by itself mean Sandbox AI is a derivative work. But copying or adapting protected expression may trigger license obligations, including source-availability requirements. Do not assume changing names or using AI to rewrite code avoids those obligations.

For `.avt` and other compatible imports:
- Read and validate the file format using original Sandbox AI code.
- Treat all imported text, prompts, images, state, and references as untrusted user-controlled data.
- Keep raw imported history inactive until explicit review and consent; never execute embedded prompts or macros.
- Preserve the distinction between user-owned exports, third-party licensed content, and executable code.
- Never use upstream application source files as copied implementation templates.

## Required pre-merge checklist

Every third-party-inspired PR or direct-to-main change must be reviewed against these questions:

1. **Source and scope:** Which external project(s), URLs, and licenses informed the work? Is the source version identified?
2. **Independent requirements:** Can the feature be explained as Sandbox AI behavior without referencing upstream implementation details?
3. **Original expression:** Were all implementation code, tests, prompts, UI copy, and fixtures written independently? No pasted or close translations?
4. **Dependencies and assets:** Were new packages, sample data, images, and other assets checked for license, notices, provenance, and permission?
5. **Interoperability and security:** Are imported fields treated as data, with bounded validation, explicit approval, and no implicit activation?
6. **Verification:** Do build/tests pass, and are important compatibility and security cases covered?
7. **Documentation:** Is the decision recorded in the change description or a short note under `docs/`?

If any answer is unknown, **stop and investigate before merging**. For ambiguous copyright, derivative-work, AGPL network-use, or distribution questions, obtain qualified legal advice.

## Development workflow

1. Write an independent feature specification based on Sandbox AI use cases.
2. Compare the specification against existing Sandbox AI architecture; prefer improving existing components.
3. Implement without copying upstream code or creative assets.
4. Write original behavioral tests and adversarial import tests.
5. Apply the checklist above and record the review with the commit/PR.
6. Run CI and address failures; a commit is not considered verified until CI succeeds.

Direct commits to `main` follow the **same review** as pull requests. Where GitHub cannot enforce a manual gate, the developer or AI assistant must explicitly perform and document it before committing.

## Review record template

```text
Third-party inspiration review
External source(s) and license:
Sandbox AI feature requirements:
Files changed:
Original implementation / no copied expression:
Dependencies and asset provenance:
Import trust boundary (if relevant):
Build/test results:
Unresolved questions:
```

## Related guidance

- [GNU AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html)
- [Aventuras repository](https://github.com/AventurasTeam/Aventuras)
- [Sandbox AI world imports](./world-imports.md)

This policy does not replace the repository's own license or create permission to use someone else's content.
