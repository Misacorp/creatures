# Patch notes

Player-facing notes for each balance or content release, one file per release: `YYYY-MM-DD.md`, newest by date. They are written in the game's voice (see `docs/compendium/README.md`) and grouped as Buffs, Nerfs, New, Fixes and Quality of life.

- **How they are made:** the `patch-notes` skill (`.claude/skills/patch-notes/SKILL.md`) runs `pnpm patch-notes --out docs/patch-notes`, reads the draft and writes the notes. The process is in `docs/design/balance-loop.md`, section 3.
- **Drafts are not committed.** `draft.md` and `draft.json` in this folder are gitignored; only the finished `YYYY-MM-DD.md` files belong in the repo.
- **Balance log ids** appear in HTML comments only, so a note can be traced to its findings in `docs/balance/log.md` without showing internals to players.
- **Posting to Discord** happens only after Misa approves the exact text in chat.
- **Releases are tagged** `balance-YYYY-MM-DD` after merge, so the next draft knows where to start.
