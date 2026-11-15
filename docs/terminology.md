# Terminology

One word per thing. Use these words in visible text (buttons, headings, hints, error messages). Internal identifiers keep their old names.

| Use this in the UI | Not this | Notes |
| --- | --- | --- |
| **Adventure** | Campaign | A prepared, playable set of people, places, and scenes. Plural: Adventures. |
| **Adventure Builder** | Campaign Builder | The editor where an adventure is built (`CampaignStudio.tsx`). |
| **Save adventure** | Save campaign | One save button label everywhere. |
| **Quick scene** | One-off scene | A single scene with no adventure around it. |
| **kaampi Write** | Storybook | The writing app. |
| **kaampi Explore** | Sandbox | This app. |
| **kaampi Codex** | Core | The shared story bible and manuscript source. |

## Internal identifiers stay as they are

Do not rename these. Renaming them would break saved data, storage keys, and the connection to the other apps.

- Code and data: `campaignId`, `CampaignTemplate`, `CampaignStudio`, the `campaigns` store, `view` ids such as `"campaigns"`.
- Storage keys and tokens: `sandboxai-*`, `SANDBOX_CORE_TOKEN`.
- Wire and file formats: `storybook-ai.manuscript`, export filenames such as `campaign-chapters-*.json`.
- CSS classes such as `campaign-nav` and `sb-core-shelf`.

## Rules

- A string the player or author can read follows the table above. A string only code reads does not.
- When a new visible string would use an old word, use the new word instead.
- Update DOM tests that look up text when a visible string changes.

## Words the interface does not use

Do not write the names of the AI's internal steps in visible text, such as "Pass 1" and "Pass 2". Say what they do instead: "the story AI", "changes to the story state". A test (`tests/ui/no-internal-jargon.test.ts`) fails if they come back.
