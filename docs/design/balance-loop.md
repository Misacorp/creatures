# Balance loop: findings log, scalars registry and patch notes

Status: **plan**, 2026-10-13. Part of roadmap item 5 (with `analytics.md` phase 2). From Misa: keep a log of findings, of hypotheses for fixing problems, of the actions taken as fixes, and of how those played out (the measured effect). Tie in a patch notes generator once balance patches roll out. Keep a list of the scalars that drive the game's modifiers, as the knobs for fine-tuning balance.

## 1. Scalars registry (`docs/balance/scalars.md`, generated)

- A script, `pnpm scalars`, walks `RULES` (and the numeric content fields that act as knobs: boss HP and exponents, foe stats, supply effects, push-on odds, drop tables). It writes a table with one row per scalar:
  - its path, for example `RULES.gear.skill.xpPerHour`;
  - its current value and unit (basis points, count, hours);
  - a one-line meaning (from the JSDoc comment on the field);
  - the system it belongs to;
  - the sim targets it is known to move.
- A test fails when the generated file is stale, the same way the compendium sync test fails on missing entries. Every change to a knob then shows up in review.
- **Tuning lives here.** Agents tune through these knobs only. A new mechanic that needs tuning gets a named scalar in `RULES`, never a magic number in code.

## 2. Balance log (`docs/balance/log.md`)

An append-only journal, newest last. Every entry has a stable id (`B-001`, …) and these fields:

| Field      | Content                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Finding    | What the live report or the sim showed, with the numbers and the report file it came from.                                           |
| Hypothesis | Why it happens, and what we expect a change to do.                                                                                   |
| Options    | The levers considered, as scalars from the registry, with the sim result of each.                                                    |
| Action     | What was changed (scalar path: old → new) and in which PR. Or "none, watching".                                                      |
| Expected   | The predicted effect, from the sim, with a target band.                                                                              |
| Outcome    | Filled in later from the next live reports: measured effect, verdict (worked, partly, no effect, backfired) and follow-up entry ids. |

- Entries open from `pnpm analyze` anomaly flags or from Misa's observations.
- An entry stays **open** until its outcome is measured, or until it is closed as "no action".
- The weekly report lists the open entries whose outcome window has passed.

## 3. Patch notes generator

- **`pnpm patch-notes <from>..<to>`** (two git refs, default: the last `balance-*` tag to `HEAD`):
  - diffs the scalars registry and the player-visible content;
  - reads the balance log entries whose Action names a PR in that range;
  - outputs a structured draft (JSON and Markdown).
- **The `patch-notes` skill** (`.claude/skills/patch-notes/SKILL.md`, in the repo; it needs a callout in the PR):
  - It tells the agent to run the script, then write **player-facing patch notes** in the game's voice from the draft. The voice comes from `docs/compendium/README.md`.
  - The notes group changes as Buffs, Nerfs, New, Fixes and Quality of life, and use words, not internal numbers, except the numbers players see in game.
  - The notes go in `docs/patch-notes/YYYY-MM-DD.md`.
  - Optional: an in-game "What's new" card, and a Discord post through the existing raid news channel (markdown escaped, `allowed_mentions: { parse: [] }`), only after Misa approves the text.
- Tag each balance release `balance-YYYY-MM-DD` after merge (Misa or CI), so the next patch notes know where to start.
