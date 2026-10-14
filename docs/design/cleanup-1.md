# Cleanup pass 1

Status: **plan**, 2026-10-13. Roadmap item 6/7, after analytics. Misa: "a cleanup pass. I hope it can also include bringing UX components into line with one another: reducing duplicate code, unifying repeating patterns, etc."

**Goal:** the same thing looks and behaves the same everywhere, there is one component per pattern, there is less code, and nothing visibly changes unless the change is to make it consistent. The behaviour is protected by the existing tests plus screenshot comparisons.

## Step 1: Audit (read-only, first)

An agent inventories duplicate patterns and writes `docs/design/cleanup-1-audit.md`. For each pattern it lists the variants, the files, the differences, and a proposed single component with its API. Patterns known to have several versions:

- **Popovers:**
  - `StagePopover`;
  - the glossary popover (`Glossary.tsx`);
  - `SmallCreature`;
  - the boss card's local icon popover;
  - the ability and fire popover.

  Target: one popover shell, with content slots and "switch content, then go back" navigation.

- **Slots and placement:** the raid `Placement` party slots and the dungeon team slots (which reuse `.party-slot`). Target: one slot-row component, plus the shared drag and drop.
- **Loot and reward display:**
  - `RewardPile`;
  - the gear loot list;
  - expedition claim loot;
  - the finale `Reveal` orb;
  - the Workshop job reveal.

  Target: `RewardPile` plus one reveal sequence.

- **Bars:**
  - `PixelBar`;
  - `XpBar`;
  - the Workshop job timer;
  - the expedition walker and timer;
  - the boss HP bar.

  Target: one bar primitive with variants, and `ProgressTrack` for tracks.

- **Banners and title plates:** the expedition title plate, the dungeon room banner, the raid boss card header.
- **Tags and chips:** `GlossaryTag`, `ElementChip`, role chips, rarity tags and badges.
- **Time and countdown formatting:** `raid-time.ts`, dungeon "resets at", expedition and Workshop timers, `formatShortCountdown`. Target: one `time-format.ts`.
- **API parsing:** `gear-parse.ts`, `expedition-parse.ts`, the dungeon parsers and the raid parsers. Target: shared parse helpers, keeping strictness.
- **Idempotency key helpers on the client:** one helper.
- **Worker:**
  - the idempotency wrappers (`gear.ts` `idempotent`, expedition `keyed`, the dungeon's key checks);
  - the grant paths (`grantOnce`, ledger credits).

  Target: one idempotent-action helper and one key namespace rule.

- **`styles.css`:** about 4,600 lines in one file. Split it per component (still plain CSS, no new dependencies), dedupe repeated rules, and use tokens for repeated values.
- **Dead code:** jackpot UI leftovers, old Hold wording, the removed dungeon ability styles, unused helpers and unused glossary entries. Keep the Fortune streak code, which is a documented option.

## Step 2: Refactor in slices

There is one PR, but each pattern is its own commit, in the order popover, bars, loot, slots, tags, time, parse, worker helpers, CSS split, dead code.

Before and after each slice, a screenshot harness captures the main screens at 390 and 1024 px. That harness is the dev tools harness from `dev-tools.md` if it exists by then; otherwise it is the throwaway Playwright harness. The diffs are reviewed by the lead. Intended visual changes are listed in the PR as "made consistent".

## Step 3: Upkeep (from `docs/roadmap.md`)

- Vitest 5 together with `@cloudflare/vitest-pool-workers` 1.4.x, then close Dependabot PR #2.
- `pnpm outdated` (releases at least 7 days old, exact versions), the alerts, refreshed action SHAs with zizmor and actionlint, Wrangler plus `pnpm cf-typegen`.
- The polish backlog items in the roadmap.

## Rules

- No behaviour changes except consistency fixes.
- No new dependencies.
- All gates and the full sim stay green.
