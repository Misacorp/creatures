# Design decisions (moved)

Design decisions now live in `docs/design/decisions/`, one file per topic. Start with its [README.md](decisions/README.md), the index.

Query them with `pnpm decisions` (try `pnpm decisions help`).

Do not add entries to this file. CI rejects them.

If you are resolving a merge conflict in this file, or your branch added entries here before the split, run `pnpm decisions migrate`. It moves your branch's entries into the topic files, asks you which topic each new one belongs to, and restores this stub.

Old references such as "decisions.md 2026-10-24, Some title" still resolve: `pnpm decisions show "Some title"`.
