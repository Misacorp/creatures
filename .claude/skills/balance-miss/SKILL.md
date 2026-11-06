---
name: balance-miss
description: Work a combat v2 balance miss to a fix on your own, the way Misa asked (2026-11-05). Reads the lab's gate (KNOWN_MISSES), diagnoses the cause, picks scalars yourself, and when numbers alone can't fix it invents content (a new Knack, talent or gear line that adds or chains a mechanic, never a bare number boost), has a review panel judge whether it is fun, measures it in the lab, applies the best, and queues what Misa should glance at later. Use when the gate or a report shows a miss, when Misa says "fix the balance misses", or during the phase 5 balance pass.
---

# Balance miss

Misa's standing rules (decision `2026-11-05-working-rules-scalars-best-guess-and`, `docs/design/decisions/direction.md`): take your best pick on a scalar and ask later; keep each scalar in one place so a morning tweak is one edit; he controls the large direction, not every number; to work around a miss you may invent Knacks, talents and gear lines, judged for fun by a panel.

## Steps

1. **Read the miss.** `cd packages/lab && node scripts/report.mjs --gate` (full, not `--quick`; `--rules` for the boss rules). Take one item from `KNOWN_MISSES` in `packages/lab/src/gate.ts`. Note its target in `targets.ts` and where the target came from. Never loosen a target to clear a miss (balance.md section 4); a target the tuners can't reach is a content problem.
2. **Diagnose.** Find the cause in two or three sentences, with numbers (which cards, seats, forms, Knacks, levels or habits force it). Run the lab with content overridden in memory (`loadCombatV2` on edited copies) rather than editing data first. Check the seed noise: run several search seeds or more servers before believing a small move.
3. **Numbers first.** If a scalar fixes it without breaking another gate item, take your best pick. Make sure the scalar lives in one place (`RULES`, a data file, `targets.ts`), not copied; if the lab copies a game rule, make it read the game's. Record it in the "For Misa to glance at" list (step 8).
4. **Content when numbers can't.** Invent 2–4 candidates: a new Knack, talent or gear line (or a change to one) that **adds a mechanic or chains off an existing one** (a new trigger, a new interaction with marks, Guards, rows, the stage break, the finale), never a plain +X%. Follow the content-as-data schemas (`packages/game/src/combat-v2/data`, `content-as-data.md`), the engine's existing operations, the naming rules (`docs/compendium/README.md`, the names batches), and the principles (P-10 spiky not flat, P-11 classic trio, P-13 second answers).
5. **Fun panel.** Run a review panel on the candidates (the `design-panel` skill, or three reviewers in parallel: player experience, systems and exploits, readability), each given `docs/design/review-brief.md` and the candidates' text. Ask: is it fun, is it readable in a fight, does it chain into something, can it be abused. Drop the ones the panel rejects; a suggestion that trades against a review-brief priority goes to Misa as a choice, not applied.
6. **Measure.** For the survivors: the target item, every other gate item, `--rules`, the journey (stuck shares, one-weekend kills) and parity. A candidate that fixes the miss and moves nothing else wins; otherwise the smallest side effect.
7. **Apply.** Data and rules in one commit each; parity `--write` in the same commit as an intended move, with the moved case groups listed; recapture fixtures if they pin the numbers; update player-facing text (glossary, help, compendium) for anything a player sees. Remove the item from `KNOWN_MISSES`. Decision entry (`pnpm decisions new --topic combat`), balance.md section 8 row.
8. **Queue for Misa.** Add a line to `docs/design/combat/for-misa.md` (create it if missing): what you picked, the one scalar or content item to change if he doesn't like it, and where it lives. Tell him in one short message with the list, not a question per item. Only the large direction (a boss's identity, a new system, a rule players must learn) is a question before acting.

## Who does what

Implementer agents cannot start other agents, so the lead splits the work: one implementer runs steps 1, 2 and 4 and writes a draft to the scratchpad (no data changes); the lead runs the fun panel (step 5) on the draft, as a workflow of three reviewers; a second implementer runs steps 6 and 7 on the survivors; the lead does step 8.

## Lessons (keep adding)

- **Point answers at Knacks, not families** (panel 2026-11-05): a family in a card's `answers` lights every Knack in it, measured or not, which breaks P-13.
- **Check new names against gear lines and talents, not only Knacks** (Echo is a gear line; Kindle is one letter from Kindling).
- **Every new effect needs a visible beat in the replay** using existing parts (a board event, the Knack-name cue, an existing effect icon, a float). An effect with no board event shows nothing on a phone.
- **Off-turn strikes (`counter()`) skip armour, dodge and the cap and fire for every copy in the arena:** give them a once-per-boss-turn limit and a row rule, and measure several copies and stacked cards.
- **Measure close calls at 48 seeds** (24 has about ±0.03 noise); keep SPEC (the lift on the card over a card-free boss) at 1.15 or more as well as beating the classic line.
- **A card that doesn't bite is a fun problem first:** fix the card (or what it is paired with) before adding answers to it.
- **Port check for v1 content** (retro 2026-11-06): before proposing a change to anything carried over from v1 (a gear line, a set text, a card, a talent), say in one line which v2 rule it uses, or flag it "no v2 meaning". First Footprints' "cannot be replaced" and the old Fizzle card meant nothing on v2, because a v2 mark is never replaced, and a proposal was built on them.
- **Spread new Knacks across forms** so one creature (Tempestray, say) doesn't become the answer to every week.

## Rules

- Quick local checks, then push; CI runs the full check (decision `2026-11-05-ci-runs-the-full-check-agents`).
- No tuned number is set by hand where a tuner owns it (the track tuner, the boss tuner): rerun the tuner.
- Keep the procedure here current: when a step proves wrong or a better tool appears, edit this skill in the same branch.
