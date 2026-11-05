# The resource library

One data file names every resource a player holds: `packages/game/src/content/data/resources.json` (schema: `resources-schema.ts`, helpers: `resources.ts`, both exported from `@creatures/game`).

Each entry:

| Field      | Meaning                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`       | The storage key (ledger currency, part kind, supply id). Never renamed.                                              |
| `kind`     | `currency`, `material`, `shard`, `supply`, `prize` or `collectible`.                                                 |
| `name`     | What one is called ("Bait", "Tide Shard").                                                                           |
| `plural`   | What more than one is called (often the same word).                                                                  |
| `icon`     | A glyph, supply, part or element icon, as plain data (same shape as the Activity's `IconRef`, without the gear art). |
| `glossary` | The glossary entry that explains it, if any. Its title must be the entry's `name` or `plural` (a test checks this).  |

Helpers: `resource(id)`, `resourceName(id, count = 1)` (singular for 1, plural otherwise), `resourceAmount(id, count)` ("3 Tide Shards"), `resourceIcon(id)`. In the Activity, `resourceIconRef(id)` (`icon-ref.ts`) gives an `IconRef`; `partName` and `partIcon` delegate to the library.

## Adding a resource

Add an entry. If it has a glossary entry, give it the same title. If it is a new part kind or ledger currency, the tests that list `PART_KINDS`, the supplies and the ledger currencies fail until it has an entry.

## Renaming a resource

```
pnpm resources rename <id> <Name> [<plural>] [--dry-run]
```

Updates the library entry, then rewrites the old name (and plural) in every string value of the content JSON in `packages/game/src/content/data/` (glossary, how-to-play, dungeon events, journal, stall, and so on): whole words only, capitalised and lower-case, never keys or plain ids. It prints every file and line it changed; `--dry-run` prints without writing. `plural` defaults to the new name when the old plural was the same word, else the name plus "s". Review the output for grammar ("a Acorns"), then run `pnpm test`. Code needs no edit: screens read the library.

Not in the library by design: collective words such as "Shards" (any element), "parts", and prose in places that name a thing without counting it (the Games' "medal points" wording is its own entry, `medal-point`).
