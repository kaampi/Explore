# External format fixtures

`onlyworlds-world-export.json` is the upstream OnlyWorlds schema-dist example, read without modification from:
https://github.com/OnlyWorlds/schema-dist/blob/main/example/world-export.json

Upstream blob SHA: `92d825e044a7457f6a09443886fd21f231087f59`.
It validates the actual export envelope and optional fields, rather than a fixture invented to match our adapter.

AI Dungeon and Azgaar samples in the tests are small synthetic examples following the official Story Cards documentation and Azgaar's `export-json.ts` / model interfaces. They are not claimed to be captures from running those applications.
