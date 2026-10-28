# Combat v2: the rework

Status: **proposal under iteration** (v0.6, 2026-10-26; second panel done: Knacks for every species and combat talents). Nothing here is shipped. The shipped rules are still `docs/design/combat-rules.md` and `packages/engine`.

## North Star

A fight you can read from the board before it plays. Each creature's species gives it one clear job, plus a few **Knacks** that change that job. Each week's boss asks a question that a different combination answers best. Players win by finding that combination together, not by levelling the same three creatures.

## Which document wins (authority, highest first)

1. **Misa's decisions** in `docs/design/decisions.md` (entries tagged combat v2) and the **accepted** entries in [`principles.md`](principles.md).
2. **The proposal** [`proposals/001-combat-v2.md`](proposals/001-combat-v2.md): the draft rules, numbered, step by step.
3. **The lab's data and tests** (`packages/lab`): Knacks (`src/knacks.ts`), keywords (`src/keywords.ts`), rule cards (`src/cards.ts`), starting numbers (`src/rules.ts`). Where the proposal and the lab disagree, fix one of them in the same change; a test should catch it next time.
4. **Generated pages**: [`knacks.md`](knacks.md), [`keywords.md`](keywords.md) and [`lab-report.md`](lab-report.md) are written by `pnpm --filter @creatures/lab report`. Never edit them by hand.
5. **Readable reference**: [`grammar.md`](grammar.md).
6. **The compendium** (`docs/compendium/`) holds names and flavour only, never rules.

Numbers live only in data (`packages/lab/src/rules.ts`, content JSON), never in prose. Prose may give an example with a number, marked as an example.

## Reading order for an agent

1. This page, then [`roadmap.md`](roadmap.md) (the phases from the lab to the game, and where we are).
2. [`principles.md`](principles.md): the filters every idea must pass.
3. [`modifiers.md`](modifiers.md): the modifier library (what Knacks, talents and gear are built from) and the talent library draft.
4. [`grammar.md`](grammar.md): what a Knack, a rule card or a boss may contain, and the templates.
5. [`proposals/001-combat-v2.md`](proposals/001-combat-v2.md): the rules.
6. [`lab-report.md`](lab-report.md): what the prototype says today.
7. The newest review in [`reviews/`](reviews/).

## How we work on it (the loop)

1. **Propose.** Change the proposal or the lab data. A new principle is proposed in `principles.md` with status `proposed`; only Misa accepts it.
2. **Simulate.** `pnpm --filter @creatures/lab report` regenerates the report: scenarios, the best team per rule card, Knack usage and a raid weekend. `pnpm --filter @creatures/lab test` checks the rules and the content rules.
3. **Review.** Run the reviewer panel (the `design-panel` skill): rules, player experience, systems and readability, each against the principles. Its findings go to `reviews/YYYY-MM-DD-*.md`.
4. **Decide.** The lead folds what is clearly right into the proposal and the data, and puts choices that trade against a principle to Misa as questions.
5. **Test the feel.** The staging lab page, `creatures-staging.misacorp.dev/combat-lab.html` (DEV panel, "Combat lab"): set up a fight, run it, read the log, share the address. Later: the port to the engine behind a flag, then a labelled experimental season (see the proposal, "Testing plan").

The **wiki page**, `creatures.misacorp.dev/wiki.html` (staging too; not linked from the game), lists every creature with its Knacks and talents, the current talents and the draft's Knacks, talents, keywords and families, as linked entries, with creature pictures and a hover card on every link. It is generated from the data on every build, so it follows the lab's data without any edit (`apps/activity/src/wiki/`).

Balance stance (principle P-10): strong combos may stand out. We look for outliers, not averages, and we answer a dominant build with a counter card in the rotation before we nerf it.

## Out of scope for this rework

The dungeon's structure (it keeps its one line and its turn order), exploration and crafting talents, relics for the live finale (an idea for later), and the shipped engine until the proposal is accepted.
