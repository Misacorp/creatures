# Cleanup pass 1: audit

Status: **audit**, 2026-10-13. This is the read-only Step 1 of `docs/design/cleanup-1.md`. Every reference below is `path:line` against branch `analytics` at `0e6cd65`. Paths are relative to `apps/activity/src/` unless they start with `apps/worker/`, `packages/` or `docs/`.

**Headline numbers**

- `styles.css` is **6,888 lines**, not the ~4,600 the plan says.
- The same `.xp` progress-bar markup is copied **7 times**.
- The JSON-POST helper exists **4 times**, and the same code is written inline in another **4** places.
- The parser primitives (`isInt` and friends) are defined again in **6 files**.
- The worker has **4 identical error classes** and **4 copies of `atomically`**.
- There are **3 idempotency wrappers**, plus a 4th, ledger-only check.
- **13 CSS classes** have no reference at all; the selectors that use them cover about 140 lines.

**How dead code was checked.** Every class selector in `styles.css` (671 unique) was grepped as an exact token in non-test `.ts`/`.tsx`, with comment lines excluded. That covers `class="…"`, `class={…}` templates, `classes.push('…')` and array literals. Template prefixes were collected too (`ab-`, `cd-`, `el-`, `t-`, `fx-`, `float-`, `owner-`, `rarity-`, `phase-`, `gtag-` and others). A class that matches one of them is counted as live when its suffix is a real value (for example `phase-shake` ← `phase-${frame.phase}`). Single-word classes (`frame`, `reveal`, `gimmick`, `legend`, `readiness`) were checked again by hand against `class=` contexts only, because the word also turns up in ordinary TS strings. Exports were grepped as `\bName\b` across `apps/` and `packages/`.

---

## 1. Popovers

### Implementations

| #   | Where                                                                                      | What it is                                                                                                                                                                                                                                                                                 | How it differs                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | `StagePopover.tsx:27`                                                                      | The shared shell. `role=dialog`, placed with `--pop-x/-y/-arrow` (`placePopover`, `stage-abilities.ts:111`). Focus goes in and back out; Escape closes (`onEscape` overrides it); a tap outside closes, but a tap inside `.glossary-layer` does not (`:72`). It follows scroll and resize. | Positions itself against its **parent** element. "Stage" vs "page" is decided only by whether the caller wraps it in `.glossary-layer`.                                                                                                                                                                                                                                                    |
| P2  | `Glossary.tsx:118` `GlossaryPopover`                                                       | Tag popover. `<div class="glossary-layer">` + `StagePopover class="gloss-pop"` + `GlossaryBody` (`:74`: `gp-visual`, `gp-title`, `gp-short`, `gp-lines`, `gp-more`).                                                                                                                       | Polls `useCloseWhenGone` every 400 ms (`:107`). State lives in `GlossaryProvider` (`:237`). Toggle logic is `toggleTag` (`glossary-ui.ts:43`).                                                                                                                                                                                                                                             |
| P3  | `Glossary.tsx:150` `CreaturePopover`, opened by `SmallCreature.tsx:17`                     | The creature face (sprite, name, level, two tag buttons) switches to a glossary face with a back button (`cp-back`, `:213`). Escape goes back first (`creature-popover.ts:61`).                                                                                                            | It has its **own** tag buttons, `:189-208` (`gtag gtag-chip chip t-…/role-chip`), which copy `ElementChip` by hand. The role label comes from the glossary title, not from `capitalize(role)`. The remount key is `face:title` (`:170`). `toggleCreature` (`creature-popover.ts:78`) has the same logic as `toggleTag`. The navigation model can only go "back to root" (`goBack`, `:51`). |
| P4  | `BossCard.tsx:52` `BossIcon`                                                               | A local `useState` popover. It copies the `glossary-layer` + `gloss-pop` + `gp-body` markup (`:76-94`) and adds `gp-general` (`styles.css:6699`).                                                                                                                                          | It is **not** in the provider: it calls `glossary.close()` when it opens (`:68`), but opening a tag afterwards with the keyboard does not close it. No `useCloseWhenGone`. No "More in How to play".                                                                                                                                                                                       |
| P5  | `Stage.tsx:1025-1057` (3× `StagePopover`) and `AbilityPopover.tsx:80` `AbilityPopoverBody` | Ability popover (Fire, Auto fire, zone or element chips `Chips`, `AbilityPopover.tsx:32`), the "note" popover (`Live.tsx:286`, which copies the `ab-pop-body` markup) and the help popover (`Live.tsx:504` `AbilityHelp`; its `class="help-pop"` has no CSS rule).                         | Lives inside the stage (`.stage-pop`, 12.5rem wide, 0.75rem text, `styles.css:2223`). State is its own `openKey` (`Stage.tsx:606`). It closes itself when the ability stops being actionable (`:681-700`). `CreatureTags` (`:556`) adds an `ElementChip` under it. The title class is `ab-title` (0.9375rem), while the glossary uses `gp-title` (1.0625rem).                              |

CSS: `.stage-pop` `styles.css:2223-2309` (`::after` is defined at 2244, 2271 **and** 2278; `[data-placement='below']::after` at 2284 and 2294); `.ab-*` 2311-2404; `.glossary-layer`/`.gloss-pop`/`.gp-*` 3661-3711; `button.small-creature` 5081-5109; `.creature-pop .cp-tags` 5111-5116, a byte-for-byte copy of `.pop-tags` 5135-5140; `.cp-back` 5118-5132.

### Proposed API

```ts
// Popover.tsx (replaces StagePopover; same behaviour)
<Popover anchor={() => el} label="…" onClose={…}
         layer="stage" | "page"          // "page" renders inside .popover-layer (fixed, z 60)
         size="compact" | "wide"         // .stage-pop vs .gloss-pop metrics
         nav?={PopoverNav}               // Escape = nav.back() while nav.canBack, else onClose
         closeWhenAnchorGone?={boolean}  // default true for layer="page"
         class?>{children}</Popover>

usePopoverNav<V>(root: V): { view: V; open(v: V): void; back(): void; canBack: boolean }
<PopoverCard visual? title short? lines? note? onMore?/>  // gp-body; BossIcon passes `note` (gp-general)
<PopoverBack label onBack/>                                // cp-back
<PopoverHost>  // renamed GlossaryProvider: one global "open popover" slot:
               //   api.openTag(ref, anchor) | api.openCreature(key, info, anchor) | api.openCustom(key, anchor, render)
```

- **Move to `Popover layer="page"`:** P2, P3, P4. BossIcon calls `api.openCustom`, so only one popover is ever open.
- **Move to `Popover layer="stage"`:** the three popovers in P5.
- **Use `PopoverCard`:** `GlossaryBody`, the creature face, and BossIcon's body.
- **Use the `ElementChip` button variant (§6):** the creature face's tags.
- **Body sections:** `AbilityHelp`, `noteBody` and `AbilityPopoverBody` share an `AbilityPopoverSection` wrapper (`ab-pop-body` + `ab-title`).
- **`toggleTag` and `toggleCreature`:** these become one `toggleActive(current, next)`.
- **Toggle tests:** `creature-popover.test.ts` and `glossary-ui.test.ts` keep their pure functions.

**Risk: medium.** Focus return, outside-tap and Escape order are easy to break.

- **Intended "made consistent" changes:** BossIcon joins the single-popover rule and the anchor-gone polling, and it may gain "More in How to play" if its entry exists.
- **Screenshots, at 390 and 1024:**
  - a glossary tag popover above and below its anchor, and near the left and right edges;
  - the creature popover on both faces;
  - a boss icon popover;
  - in the live stage: the ability popover with zone chips, the Re-mark element chips, the note popover and the "?" help popover;
  - a glossary popover opened from a tag inside a stage popover.

  Manual keyboard pass: Enter opens, Escape goes back then closes, focus returns to the anchor.

**Size:** about −140 / +90 lines TSX (BossIcon −35, CreaturePopover −30, duplicate chip markup −20, toggle helpers −15), and about −25 lines CSS (the `cp-tags`/`pop-tags` copy and the split `::after` rules).

---

## 2. Slots and placement (raid vs dungeon)

| Aspect              | Raid `Placement.tsx`                                                                                                                                                     | Dungeon `DungeonTeam.tsx`                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slot button         | `SlotButton` `:312-393`: `owner-N` colour, `compact` below scale 3, `adjacent`, `slot-owner` line ("You" / owner name), `aria-label` from `slotLabel` (`raid-dnd.ts:27`) | Inline `:161-194`: always `mine`, sprite scale fixed at 3, no owner line, label built inline                                                                          |
| Empty text          | `"empty"` (`:382`)                                                                                                                                                       | `"Empty"` (`:186`). **Inconsistent capital.**                                                                                                                         |
| Layout              | 3 zones with labels, `zoneLayout` sizing (`:242-273`)                                                                                                                    | One grid of 3, `.dungeon-strip` (`styles.css:4773`)                                                                                                                   |
| Keyboard            | Grid-aware: arrows plus `verticalNeighbour` (`:115-160`); also focuses `.team-chip`                                                                                      | Linear; ArrowUp/Down mapped to Left/Right (`:105-124`)                                                                                                                |
| Tray                | `team-list` chips `:200-234`: "Lv N · slot X / not placed", name is `c.name`                                                                                             | `:233-264`: "Lv N", `creatureName(c)`, "Show all N" fold (`TRAY_PREVIEW`, `:25`)                                                                                      |
| Remove button       | "Unplace" (`:276-284`)                                                                                                                                                   | "Take out" (`:202-212`). **Inconsistent wording.**                                                                                                                    |
| Ghost / live region | `:302-307` / `:299-301`                                                                                                                                                  | `:287-292` / `:284-286`. Identical copies.                                                                                                                            |
| Drop logic          | `raid-dnd.ts:46` `resolveDrop(ctx, id, name, target)`, `:80` `slotStatuses`, `outcome` `:34`                                                                             | `dungeon-team.ts:160` / `:196` / `outcome` `:147`. Same shape, different signature. The literal `'Cancelled.'` is written out instead of using `CANCEL_ANNOUNCEMENT`. |
| Types               | `raid-slots.ts:11-13` `Tap {kind:'creature',creatureId}`, `{kind:'slot',slot}`                                                                                           | `dungeon-team.ts:41-43` `{kind:'creature',id}`, `{kind:'slot',index}`                                                                                                 |

The shared parts already in use are `use-drag-drop.ts` (both screens) and `dnd-core.ts`.

CSS: `.team-list`/`.team-chip` 593-619; party row and owners 640-773; `.party-slot` is defined at **677 and again at 1394**; `.party-slot.empty` at 700, 1409 and again as `.dungeon-strip .party-slot.empty` 4786; `min-height: 6rem` appears at both 1396 and 4783; `.dungeon-slot .slot-meta` 4790 repeats `.slot-meta` (737); placement pass 6739-6795.

### Proposed API

```ts
interface SlotModel { index: number; creature: null | { species; name; level; owner?: { name: string; colour: number }; mine: boolean };
                      ariaLabel: string; placeName?: string }
<SlotRow groups={{ key, label?: ComponentChildren, slots: SlotModel[] }[]}   // raid: 3 zones, dungeon: 1 group
         layout="zones" | "grid" stripRef drag={DragDrop} selected adjacent?:Set<number>
         statuses disabled onTap={(index)=>…} />
<SlotButton …/>                                     // the one slot markup
<CreatureTray items={{id,species,name,level,note?}[]} trayRef selected dragging preview?={6} onTap/>
<DragGhost creature/> ; <LiveRegion text/>          // §12
useSlotKeyboard(stripRef, { grid: boolean, onEscape, onEnterSlot })
// shared types: Tap = {kind:'creature', id} | {kind:'slot', slot}; outcome(); CANCEL_ANNOUNCEMENT
```

**Moves:** `Placement.tsx` and `DungeonTeam.tsx`. The pure rules (`raid-dnd.ts`, `dungeon-team.ts`) stay where they are and only share `outcome()` and the types.

**Risk: medium to high.** Drag, tap and keyboard behaviour is covered only by the pure tests (`raid-dnd.test.ts`, `dungeon-team.test.ts`, `dnd-core.test.ts`).

- **Made consistent:** "Empty" capitalisation, and Unplace vs Take out (pick one).
- **Screenshots, raid placement:** empty, selected (adjacent highlight), mid-drag over valid and over invalid, owner colours with 3+ players, locked.
- **Screenshots, dungeon team:** empty, full, mid-drag, "Show all".
- Then a manual drag on touch.

**Size:** about −150 / +110 TSX, about −15 CSS.

---

## 3. Loot and reward display

| #   | Where                                       | What it shows                                                                                                                         | Differences                                                                                                                                                               |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `RewardPile.tsx:25` (+ `reward-pile.ts:39`) | Overlapping icon heap, one per kind                                                                                                   | Its own icon switch, `PileIconView` `:8` (see §12, icons)                                                                                                                 |
| L2  | `GearLoot.tsx:11` `LootList`                | Gear items (`ItemFrame` pop-in), converted notes, blueprints badges, parts (`PartCount`)                                              | Callers strip `parts` (and `supplies`) to avoid showing them twice (`TripReveal.tsx:165`, `DungeonResults.tsx:156`)                                                       |
| L3  | `FinaleGearLoot.tsx:13`                     | Fetches `/api/gear` itself and wraps L2 per grant in `.reveal-gear-box`                                                               | Hand-written `cancelled` effect (see §12)                                                                                                                                 |
| L4  | `TripReveal.tsx:42` (expedition claim)      | `reward-row` = L1 + `PartCount` + an **inline copy of the supply count** (`:153-160`, `part-count supply-count`) + L2                 | No orb and no delayed reveal; `role=status`; tone class                                                                                                                   |
| L5  | `DungeonResults.tsx:86`                     | `reward-row` = L1 + local `RewardCount` (`:47`, a `PartCount` copy for glyphs) + `PartCount` + L2 ×2                                  | Essence counts up from `useRevealFrame` but **there is no orb**; its own `pileLabel` `:30` ("Rewards: …") vs `claim-view.ts:149` ("Loot: …"); buttons instead of "Got it" |
| L6  | `Reveal.tsx:78` `RevealCard` (finale)       | Orb (`RevealStage` `:39`), Essence as a **text line** "You got N Essence" (`:109-115`), festival box, rank, L3, AfterAction, "Got it" | Essence is not a count badge, unlike L5                                                                                                                                   |
| L7  | `JobReveal.tsx:82`                          | Orb with item (`RevealStage opened`), `.reveal-gear-box` outcome, XP line, "Got it"                                                   | Uses `useRevealFrame(0)` just for timing                                                                                                                                  |

There are also two copies of the "Cleared / Not cleared" `badge good|bad`: `Reveal.tsx:103` and `DungeonResults.tsx:107`.

CSS: reveal 1031-1162; `.reveal-festival-box` delay 1104-1110 is the same as `.reveal-gear-box` delay 4664-4670; `.reveal-festival-box.done .pop-in` 1112 is the same as `.loot .pop-in` 4660; loot 4624-4657; reward row 5213-5271; `.part-count` 4265-4281 vs `.supply-count` 6134-6138; claim reveal 6058-6214.

### Proposed API

```ts
<CountBadge icon={IconRef} amount label entry?={string} tag?={true}/>   // replaces PartCount, RewardCount, TripReveal supply inline
<RewardSummary pile={PileSource} counts={CountItem[]} loot?={GrantLoot}   // reward-row + pile + badges + LootList (parts never twice)
               lootLabel delayed?={{done:boolean}}/>
pileLabel(source, prefix: 'Loot' | 'Rewards')     // one helper, claim-view.ts
<RevealShell id title badge?={<OutcomeBadge cleared/>} tone? status? footer?={…default "Got it"}>
useRevealSequence(essence, reduced) // = useRevealFrame; <RevealLater done>…</RevealLater> (.reveal-later)
<OutcomeBadge cleared/>
```

- **Uses `RewardSummary`:** L4, L5, and the L6 Essence line (optional: as a `CountBadge` with count-up).
- **Uses `RevealShell`:** L4, L5, L6, L7.
- **`RevealLater`:** replaces `reveal-gear-box`/`reveal-festival-box` (one CSS rule set instead of two).

**Risk: medium.**

- **Made consistent:** pile label prefix; whether supplies and Essence show as count badges everywhere; whether DungeonResults gets the orb (recommend no; keep the content and only share the shell).
- **Screenshots:** finale reveal (cleared, not cleared, festival, with gear); job reveal for craft, improve, enchant and supply; trip reveal (loot, catches, rank-up gift, failed, nothing); dungeon results (cleared, lost, landmark, streak bonus).

**Size:** about −120 / +90 TSX, about −20 CSS.

---

## 4. Bars

| #   | Where                         | What it is                                                                                                                                                                                            | Differences                                                                                                                                                                                            |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | `PixelBar.tsx:4`              | `.xp` trough plus gold `<span --pct>`                                                                                                                                                                 | `Math.round` pct; `aria-valuemax = max`. Used only by `Collection.tsx:220`                                                                                                                             |
| B2  | `JobSlots.tsx:14` `JobBar`    | **Copy of B1** + `.job-bar` (1 s linear transition, `styles.css:4529`)                                                                                                                                | Takes `pct`; aria max 100                                                                                                                                                                              |
| B3  | `RunningTrip.tsx:118-127`     | **Inline copy** + `.trip-bar(.pushing)`                                                                                                                                                               | spark fill while pushing; transition `styles.css:5892` is the same as 4529                                                                                                                             |
| B4  | `SlotsStrip.tsx:36-45`        | **Inline copy**                                                                                                                                                                                       | `fillPct`                                                                                                                                                                                              |
| B5  | `Journal.tsx:71-80`           | **Inline copy**                                                                                                                                                                                       | pct computed inline `:63`                                                                                                                                                                              |
| B6  | `ExplorerProfile.tsx:65-74`   | **Inline copy** (milestones)                                                                                                                                                                          |                                                                                                                                                                                                        |
| B7  | `ExplorerProfile.tsx:107-116` | **Inline copy** for explorer XP                                                                                                                                                                       | **Inconsistent:** the same explorer XP uses `XpBar` in `ExplorerPicker.tsx:69` and `TripReveal.tsx:183`. Two XP helpers, `trip-view.ts:297 xpBar` and `:320 explorerXp`, plus `xp-bar.ts:18 xpBarView` |
| B8  | `XpBar.tsx:14`                | Thick bar, words drawn twice, caps                                                                                                                                                                    | `aria-valuetext`; CSS 6432-6508                                                                                                                                                                        |
| B9  | `Stage.tsx:48` `HpBar`        | Boss HP, 20 segments, drain blink                                                                                                                                                                     | Used in `Stage.tsx:795`, `BossCard.tsx:170`, `Live.tsx:342`. The last two also add the **same** caption `<p class="muted small">Name HP: a / b</p>`                                                    |
| B10 | `Stage.tsx:448` `UnitHp`      | 5 segments, green                                                                                                                                                                                     | CSS 5057-5075 and 5167; `#3a2033` "gone" colour copied 3× (1326, 2717, 5074)                                                                                                                           |
| B11 | `AfterAction.tsx:123,142,179` | Native `<progress class="bar                                                                                                                                                                          | hp-bar">`                                                                                                                                                                                              | Styled with `accent-color` (1210-1219) plus a **second** `.hp-bar` definition (534-539 **and** 1356-1374, plus 848) |
| B12 | Pip rows                      | `ExpeditionIcons.tsx:39 Pips`, `DungeonPrerun.tsx:22 StreakPips`, `HowToPlayArt.tsx:360` (inline), `SlotsStrip.tsx:22` (`slot-pip`), `BossCard.tsx:23` (`season-pip`), `BossCard.tsx:115` (`rm-pips`) | `.pips` is defined **twice with different sizes**: 1329-1353 (0.875rem) and 5731-5746 (0.375rem). The later rule wins for `i`/`i.on`, so `.pips > i.now` (1346) is dead and 1335/1342 are overridden   |
| B13 | Walker                        | `Banner.tsx:62` (`--p`)                                                                                                                                                                               | Fine as is; a progress visual                                                                                                                                                                          |
| —   | `ProgressTrack.tsx:14`        | Rank and depth track                                                                                                                                                                                  | Already single; keep                                                                                                                                                                                   |

Percent helpers: `trip-view.ts:283 fillPct` (floor, 1 decimal), `PixelBar.tsx:5` (round), `gear-view.ts:340` (inline floor), `Journal.tsx:63`, `xp-bar.ts:93`.

The state line under a timer is styled twice: `.job-state` 4519-4526 is identical to `.trip-timer` 5897-5904.

### Proposed API

```ts
percent(value, max): number                          // one floor-to-0.1 helper (progress-math.ts)
<Bar value max label tone?="gold"|"spark" smooth?={boolean} class?/>   // B1–B7; aria 0..max always
<TimerBar startedAt endsAt now label state={ComponentChildren} ready tone?/>  // Bar + .timer-state; B2+JobSlots:69, B3+RunningTrip:128
<XpBar …/>                                           // B8 unchanged; B7 switches to it (made consistent)
<SegmentBar current max previous? segments={20|5} tone="bad"|"good" size="boss"|"unit" label?/>  // B9, B10
<BossHp name current max previous?/>                 // SegmentBar + caption: BossCard:168-178, Live:340-351
<PipRow count lit={number|((i)=>…)} mark?={(i)=>'fest'|'used'|…} size="sm"|"md" label?/>  // B12
```

**Risk: medium.**

- **Made consistent:** ExplorerProfile explorer XP becomes `XpBar` (visible); optionally AfterAction `<progress>` becomes `Bar`/`SegmentBar` (visible, so list it); the `.pips` size conflict is settled at 0.375rem, which is what currently renders.
- **Screenshots:** collection card; Workshop jobs (running and ready); running trip (out and pushing); slots strip; journal; profile (milestones and explorers); explorer picker; boss card; live lobby (no stage); live stage; dungeon playback (unit HP); dungeon prerun and next (streak pips); haul strip; How to play (streak art); after-action card.

**Size:** about −110 / +70 TSX, about −35 CSS.

---

## 5. Banners and title plates

| #   | Where                                  | Markup and CSS                                                                                                                                                                                                                                            |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `Catalogue.tsx:95-100` place plate     | `h4.place-plate` > `.plate-name.pix` + `.plate-count`; gold inset frame, `styles.css:5448-5475`                                                                                                                                                           |
| T2  | `DungeonPlayback.tsx:118` `RoomBanner` | Overlay `.room-banner(.boss)` with `rb-heading` (3rem gold, 4-way ink outline), `rb-place`, foe sprite, `rb-name` + element, `rb-twist`; CSS 4817-4893, animation 5172-5212                                                                               |
| T3  | `BossCard.tsx:146-167` header          | `h3.boss-name` (gold, element drop shadow, 6611-6619) + `.boss-status` chip row (6621); `--elem` set **again** per element (1626-1640) though `.el-*` (1519-1533) already sets `--el` on the same element                                                 |
| T4  | smaller banners                        | `Reveal.tsx:60 FirstBanner` (`.banner-first` 1092); `BossCard.tsx:187 .festival-banner` (964); `Stage.tsx:784 .stage-callout.banner`; `Stage.tsx:199 RoundIntro`; `TripReveal.tsx:226 .slot-unlocked` (6150-6165); `TripReveal.tsx:192 .rank-gift` (6029) |

The ink-outline `text-shadow` is written 5 times: 2535, 2598 (2px), 2691, 3420, 4849. The h1 / boss-name drop shadows are at 120 and 6615.

### Proposed API

```ts
<TitlePlate as="h3"|"h4" title count?={string} tone?="gold"|"bad"|"element"/>   // T1, T3 header text
<PixelHeading size="xl"|"l"|"m" tone="gold"|"bad"|"bone" outline="ink"|"drop">   // rb-heading, boss-name, round intro, countdown
<Callout tone="gold"|"good"|"festival" icon?>…</Callout>                          // T4 boxes (slot-unlocked, rank-gift, festival-banner)
/* tokens */ --text-outline-ink; --text-drop(--c)
```

T2 keeps its own layout but uses `PixelHeading`.

**Risk: medium.** The text-shadow differences are subtle, so screenshots are essential.

- **Screenshots:** catalogue (a long name at 390); room banner for a foe and for the boss; boss card for each element and in a festival week; round intro; countdown; slot-unlocked; rank gift.

**Size:** about −20 / +35 TSX, about −45 CSS.

---

## 6. Tags and chips

| #   | Where                                                                                                                                        | Classes                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `Glossary.tsx:318` `GlossaryTag`                                                                                                             | `gtag`, `gtag-chip`, `gtag-help`                                                                                                                                                               | `look` = text, chip or help; the chip look **borrows** the classes the caller passes (`tag`, `badge …`, `chip …`)                                                                                                                                                               |
| C2  | `sprites/ElementChip.tsx:12`                                                                                                                 | `chip t-<el>` + `chip role-chip`                                                                                                                                                               | Takes `role` as a **display string**: `role={capitalize(species.role)}` is repeated at Collection:185, DungeonTeam:259, HowToPlayArt:74, Placement:229, Stage:560, StarterPicker:33. Element sanitising regex `:14` duplicates `art.ts:117 elementClass` and `BossCard.tsx:140` |
| C3  | Hand-made role or element chips                                                                                                              | `Glossary.tsx:189-208`, `CoachMark.tsx:18`                                                                                                                                                     | Copies of C2                                                                                                                                                                                                                                                                    |
| C4  | Generic `.tag` pills                                                                                                                         | ~22 `GlossaryTag look="chip" class="tag"` (Collection:186, PushOnChoice:25, RunningTrip:97/101/136, PlaceCard:53/60, JobReveal:66, HowToPlayArt:282…), `tag rank` (BossCard:156, CoachMark:21) | CSS 404-411, 946                                                                                                                                                                                                                                                                |
| C5  | `.badge` variants                                                                                                                            | `badge shiny/first/away/busy/festival/good/bad/free` (Collection:197-214, BossCard:163, Live:310, ExplorerProfile:63, SendTrip:127, GearLoot:43, TripReveal:125-131)                           | CSS 413-422, 513-521, 953; `catchBadgeTags` builds them in TripReveal                                                                                                                                                                                                           |
| C6  | `.chip` icon chips                                                                                                                           | `chip dungeon-depth-chip` (DungeonPrerun:62, no CSS), `chip dungeon-landmark-chip`, which is **copied 3×** (DungeonPrerun:66, DungeonResults:117, HowToPlayArt:350); CSS 1267-1297, 4683       |                                                                                                                                                                                                                                                                                 |
| C7  | `RarityTag` `GearArt.tsx:62`                                                                                                                 | `tag rarity-tag rarity-<r>`                                                                                                                                                                    | CSS 4201                                                                                                                                                                                                                                                                        |
| C8  | `.lvl-tag` Collection:176; `readiness-meter` BossCard:109; `.pips-tag` DungeonPrerun:41; `.mod-icon` DungeonPrerun:84; `.mark-tag` Stage:769 | Four separate "tag without the ?" rules: 337-352 (`.mark-tag`, plus the dead `.gimmick-tag`), 4720-4742 (`.mod-icon`), 4743-4751 (`.pips-tag`)                                                 |
| C9  | Count pills                                                                                                                                  | `.part-count` 4265 (0.875rem) vs `.chip` 1267 (0.8125rem) vs `.tag/.badge` 404 (0.8125rem). Three ink pills with different paddings                                                            | See §3, `CountBadge`                                                                                                                                                                                                                                                            |
| C10 | Choice chips                                                                                                                                 | `pick-chip` (AbilityPopover:43), `basic-chip` (Stage:1008), `team-chip`, `turn-chip`, `ability-chip`                                                                                           | These are buttons, not tags; leave them out of scope except that `pick-chip`'s look should match                                                                                                                                                                                |

### Proposed API

```ts
<Tag entry?={string} kind="tag"|"badge"|"chip" tone?="gold"|"good"|"bad"|"haze"|"festival"|`el-${string}`|`rarity-${string}`
     icon?={IconRef} label? bare?={boolean /* no "?" mark: mark-tag, mod-icon, pips-tag */}>text</Tag>
<ElementChip element role?={RoleId} as?="tag"|"button" onOpen?/>   // capitalises itself; "button" for the creature popover
elementSlug(element): string                                     // one sanitiser (art.ts)
```

**Moves:** all of C2-C8. Glossary CSS keeps `.gtag*`; one `.gtag-bare` rule replaces the four "no ?" rules.

**Risk: medium.** There are many call sites, each a small visual change.

- **Made consistent:** pill padding and font size, and the depth/landmark chips.
- **Screenshots:** collection card (all badges: shiny, festival, away, on a job, first); boss card; coach mark; creature popover; dungeon prerun and results; How to play; trip reveal catches; running trip; place card; item detail; push-on choice; job reveal (enchant).

**Size:** about −60 / +50 TSX, about −40 CSS.

---

## 7. Time and countdown formatting

| Function                               | Where                                                                                                         | Output                            | Used by                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `formatCountdown`                      | `game.ts:61`                                                                                                  | `1h 02m 03s` (**no days**)        | JobSlots:75, RunningTrip:28/30, live.ts:133          |
| `formatLongCountdown`                  | `raid-time.ts:91`                                                                                             | `3d 04h 05m` / `4h 05m 06s`       | raid-time:128, DungeonNext:25                        |
| `formatShortCountdown`                 | `raid-time.ts:108`                                                                                            | `3 d 4 h`, `2 h 10 m`             | raid-now.ts:111                                      |
| `formatDuration`                       | `gear-view.ts:131`                                                                                            | `3 h 44 min` (**"min", not "m"**) | trip-view:57, CreaturePicker:55, SupplyCrafting:73   |
| `formatClock`                          | `live.ts:37`                                                                                                  | `4:12`                            | live.ts:46/128                                       |
| `relativeTime`                         | `leet-status.ts:21`                                                                                           | `5 minutes ago`                   | leet-status:72                                       |
| `formatEventTime(Long)` / `formatTime` | `raid-time.ts:21/26/30`                                                                                       | `Fri 13:37`                       | raid-now, DungeonNext:24, destination-view:103       |
| `localClock` + `clockText`             | `destination-view.ts:52/86`                                                                                   | `{hour,minute}`, `20:00`          | night window. A second `Intl.DateTimeFormat` builder |
| `lengthLabel`                          | `trip-view.ts:39`                                                                                             | `4 h`                             | 5 call sites                                         |
| `countdownText`                        | `raid-time.ts:120`                                                                                            | Used only in tests (dead, §11)    |                                                      |
| `useNow` + `now + offset`              | `hooks.ts:5`; Expeditions:79, JobSlots:110/127, DungeonNext:13-14, Live:81/239, Raid:87, `dungeon-flow.ts:17` | Server-clock pattern repeated     |                                                      |
| `useRemaining`                         | `use-countdown.ts:11`                                                                                         | Separate ticker for the last 30 s | Keep                                                 |

### Proposed API (`time-format.ts`)

```ts
formatCountdown(ms, style: 'long' | 'short' | 'clock'): string   // long = raid-time:91 (adds days), short = :108, clock = live:37
formatDuration(ms): string                                       // keep, or fold into short (decide "m" vs "min")
formatZoned(at, timeZone, { weekday: 'short' | 'long' | 'none' }): string ; zonedClock(at, timeZone): {hour, minute} | null
formatRelative(then, now): string ; formatHours(h): string ; formatHourOfDay(h): string   // "20:00"
useServerNow(offset: number, active: boolean): number
```

The timezone stays an explicit argument everywhere (CLAUDE.md rule).

**Risk: low** for the pure move.

- **Visible only if chosen:**
  - `game.ts:61` → long style shows days for waits over 24 h. Today jobs and trips are ≤ 24 h, so nothing changes now.
  - "min" vs "m" between the Workshop or send flow and the raid "now" line.
- **Tests that protect it:** `game.test.ts`, `raid-time.test.ts`, `gear-view.test.ts`, `live.test.ts`, `leet-status.test.ts`, `destination-view.test.ts`.
- **Screenshots:** Workshop (job timer and supply craft durations), send flow (length options), running trip, Raid timeline and now line, dungeon next run, live lobby.

**Size:** about −60 / +50.

---

## 8. Client API response parsers

Primitives are defined again in each module:

| Primitive                | Definitions                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isRecord`               | `api.ts:91` (**accepts arrays**), `gear-parse.ts:27`, `expedition-parse.ts:29`, `raid-api.ts:208` (exported; `dungeon-parse`, `live-api` and `raid-channel` import it) |
| `isStr`                  | api:334, gear-parse:29, expedition-parse:31, dungeon-parse:20, raid-api:211                                                                                            |
| `isInt`                  | api:207, gear-parse:30, expedition-parse:32, dungeon-parse:21, raid-api:213 (live-api imports it)                                                                      |
| `isCount` / non-negative | gear-parse:32, expedition-parse:34, dungeon-parse:23, raid-api:613, live-api:161 (`isNonNegativeInt`)                                                                  |
| `isBool`                 | expedition-parse:35, dungeon-parse:24, raid-api:212                                                                                                                    |
| `isArrayOf`              | gear-parse:34, expedition-parse:36, dungeon-parse:25, raid-api:217                                                                                                     |
| `isNullableInt`          | api:209, raid-api:652, live-api:162                                                                                                                                    |
| `isNullableStr`          | gear-parse:33, raid-api:215                                                                                                                                            |
| enum checks              | `isRarity` gear-parse:37 and dungeon-parse:32; **dungeon-parse hardcodes `ELEMENTS`/`ROLES` (`:28-31`)** instead of the content or schema                              |

None of the client parsers reject unknown keys; that is the current strictness, and it stays.

### Proposed API (`parse-core.ts`)

```ts
isRecord (array-excluding), isStr, isBool, isInt, isCount, isPositiveInt, isNullable(guard), isArrayOf(guard),
isOneOf(list) // replaces isRarity/isStat/isPartKind/isJobKind/isTier/isRisk/isStatus/isEventId/isZone/ELEMENTS/ROLES
expect<T>(data, guard, what): T   // the "throw new Error('Unexpected … response')" tail every parse* repeats
```

**Moves:** the top of `api.ts`, `gear-parse.ts`, `expedition-parse.ts`, `dungeon-parse.ts`, `raid-api.ts`, `live-api.ts` and `raid-channel.ts`.

**Risk: low.** `server-contract.test.ts` and the fixture tests cover it. One intended tightening: `api.ts`'s `isRecord` stops accepting arrays. Note it in the PR. No screenshots.

**Size:** about −70 / +35.

---

## 9. Client idempotency keys

- **`actions.ts:22` `createKeyStore`** is already the single key helper. It is created twice, at `Game.tsx:67` and `Dungeon.tsx:42`.
- **The duplication is in the runners around it.** Each has the in-flight guard, busy, error, settle, and a reload on 404/409:
  - `Game.tsx:113` `run` (+ `runState` `:146`, + `gear-actions.ts:49` `guarded`);
  - `Dungeon.tsx:118` `enter` and `:100` `watch`;
  - `Raid.tsx:146` `mutate` (no keys: placement is not a spend);
  - `Live.tsx:147` `act` (a per-key lock, `live.ts:425 createKeyLock`).
- **Stale-check:** written 3 times (`Game.tsx:131`, `Raid.tsx:158`, `dungeon-text.ts:40 isStaleDungeonError`).
- **Error text maps:** 2 (`game.ts:169/258`, `dungeon-text.ts:17/32`).
- **`'draft-key'` hack:** `Dungeon.tsx:120` builds a request with a placeholder key only to sign it.
- **Action ids:** made up ad hoc per screen: `starter:`, `train:`, `evolve:`, `send:…` (Game.tsx:211-337), `upgrade:`, `dismantle:`, `job:…`, `claim-job:` (gear-actions.ts), `dungeon-run:` (Dungeon.tsx:123).

### Proposed API

```ts
useActionRunner({ keys?: KeyStore, onStale?: () => void, errorText }) =>
  { busy, error, notice, run<T>(action: ActionId, task: (key?: string) => Promise<T>, opts?: { keyed?: boolean; currency?: string }) }
// actions.ts: ActionId builders (one place), isStaleError(err)
```

**Moves:** Game, Dungeon, Raid and gear-actions. Live keeps its per-ability lock.

**Risk: medium.** This is behaviour, not visuals. The tests are `gear-actions.test.ts` and `game.test.ts`. No screenshots; run a manual retry-after-network-error check.

**Size:** about −80 / +50.

---

## 10. Worker: idempotency wrappers and grant paths

### Keyed actions

| #   | Where                                                         | Tables checked                                                                       | Error class                |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| W1  | `apps/worker/src/gear.ts:271` `idempotent`                    | `gear_actions` (kind + fingerprint) then `lookupSpend` (ledger)                      | `GearError`                |
| W2  | `apps/worker/src/expeditions.ts:638` `keyed`                  | **Copy of W1** with kind fixed to `'expedition_send'`                                | `CollectionError`          |
| W3  | `apps/worker/src/dungeon.ts:449-475` inline                   | `dungeon_runs` (own fingerprint) + ledger + `gear_actions`                           | `DungeonError`             |
| W4  | `apps/worker/src/collection.ts:460/532` + `:503-509/:578-584` | Ledger only (`lookupSpend`, then `spend` replay with a purpose and creatureId check) | `CollectionError`          |
| W5  | `apps/worker/src/ledger.ts:167` `spend`                       | Ledger (currency + amount)                                                           | `SpendResult.key_conflict` |

**Coverage is uneven.** W1 and W2 never look at `dungeon_runs`. W4 never looks at `gear_actions` or `dungeon_runs`. This is harmless today because client keys are per-action UUIDs, but there is no single rule. Separately, `gear.prune` (`gear.ts:307`) also prunes expedition rows after 30 days, because they live in the gear table.

Other repeated pieces:

- **Error classes:** `GearError` gear.ts:74, `DungeonError` dungeon.ts:65, `RaidError` raid-teams.ts:18 and `CollectionError` outcome.ts:8 are identical.
- **`atomically`:** written 4 times (outcome.ts:20, gear.ts:257, raid.ts:145, dungeon.ts:~437).
- **`idempotencyKey` schema:** declared 3 times (collection-schemas.ts:10, dungeon-schemas.ts:6, gear-schemas.ts:6).
- **`parseBody`:** written twice (collection-routes.ts:34, raid-routes.ts:48).

### Grants and credits

- **`gear-grants.ts:87` `grantOnce`** (`gear_grants` table) is used by 8 grant functions (`:172-350`).
- **`ledger.ts:91` `credit`** (ON CONFLICT DO NOTHING) is called at:
  - dungeon.ts:618, 632, 664, 678 (**4 near-identical blocks**);
  - expeditions.ts:1384, gear-grants.ts:276, raid-festival.ts:105, raid-resolve.ts:469 and 652;
  - guild-core.ts:917 (via `this.credit` `:788`).
- **`raid_festival_grants`** (raid-festival.ts:120) is a third once-per-week mechanism.

**Key formats are inconsistent.**

- Dungeon credits add a currency suffix (`dungeon:<day>:<attempt>:bait`) next to the grant key `dungeon:<day>:<attempt>`.
- Raid credits include the party (`raid:<week>:<party>:<phase>`) but the raid grant does not (`raid:<week>:<phase>`).
- The rank gift and festival use the **same** key in the ledger and in `gear_grants` (`rank:<creature>:<rank>`, `festival:<week>`).

### Proposed API

```ts
// apps/worker/src/keyed-action.ts
runKeyed<T>(sql, now, { userId, key, kind, fingerprint }, run: () => T): T   // W1+W2 (+W3 via a store adapter)
keyTaken(sql, userId, key, { except?: 'gear_actions' | 'dungeon_runs' | 'ledger' }): boolean  // one cross-table check for W1–W4
// outcome.ts
class GameError(status, code, reason?) ; atomically(storage, fn)            // replaces 4 classes / 4 copies
export const IdempotencyKeySchema                                            // ledger.ts or schemas.ts
// gear-grants.ts
payOnce(deps, userId, key, { source, meta, bait?, essence?, draw? })         // credits `${key}:bait|essence`, grantOnce(key)
```

**Key namespace rule** (record it in `decisions.md`):

- Client keys match `SPEND_KEY_RE`. They contain no `:`, so they can never collide with server keys.
- Server keys are `<source>:<scope…>`. When one event both credits and grants, the credit gets a `:<currency>` suffix.
- **Existing key strings must stay byte-for-byte the same.** `payOnce` must reproduce today's dungeon keys, and the raid and festival keys stay as they are. No migration.

**Risk: medium.** It is server code, but the tests are strong: `gear.test.ts`, `expeditions-v2.test.ts`, `dungeon.test.ts`, `collection.test.ts`, `ledger.test.ts`, `raid-resolve.test.ts`. Intended behaviour change: a key used in one table is now a `key_conflict` in every other table; that is stricter. No screenshots.

**Size:** about −160 / +90.

---

## 11. Dead code

### CSS (verified: no reference in any non-test TS/TSX, including templates)

| Selector(s)                                                                                    | Lines                      | ≈ lines |
| ---------------------------------------------------------------------------------------------- | -------------------------- | ------- |
| `.hello`                                                                                       | 150-152                    | 4       |
| `.reveal`, `.reveal ul` (old reveal)                                                           | 440-449                    | 11      |
| `.gimmick-tag` (and its half of the shared `::after`/`:hover` selectors)                       | 344-357                    | 9       |
| `.you-badge`                                                                                   | 523-527                    | 6       |
| `.mark-badge`                                                                                  | 775-780                    | 7       |
| `.replay-row`, `.replay-slot*` (and its half of the shared `.turn-chip` rules)                 | 799, 809, 814-836, 924-926 | 30      |
| `.live-banner`                                                                                 | 890-897                    | 9       |
| `.readiness`, `.readiness-band*` (replaced by `.readiness-meter`)                              | 1005-1029                  | 26      |
| `.frame`                                                                                       | 1227-1233                  | 8       |
| `.gimmicks`, `.gimmick`, `.gimmick canvas.sprite`, `.gimmick-text` (replaced by `.boss-icons`) | 1654-1675                  | 23      |
| `.legend`                                                                                      | 3610-3616                  | 8       |
| `.pips > i.now` (no pip ever gets `now`) and the overridden `.pips > i`/`.on`                  | 1335-1348                  | ~10     |

That is about **150 lines**. There are also 9 tokens used fewer than 4 times that only alias newer ones (`--accent` ×3, `--danger` ×2, `--text` ×3, `--panel-2` ×3, `--bg` ×0; `styles.css:62-69`). Fold them into the new names.

**Live classes that look dead but are not:**

- `phase-shake` ← `Reveal.tsx:49`
- `gtag-help` ← `look="help"` (×13)
- `cd-n*`/`cd-*` ← `countdown.ts:47-48`
- `owner-*` ← `Placement.tsx:349`, `RosterStrip.tsx:38`
- `t-*`, `el-*`, `ab-*`, `fx-*`, `float-*`, `rarity-*`

**Hook classes with no CSS rule.** Harmless; keep any that tests or `querySelector` use: `help-pop`, `ab-pop-body`, `cp-body`, `gp-body`, `dungeon-depth-chip`, `boss-hp`, `boss-icon-item`, `job-slots`, `job-reveal`, `dungeon-result`, `stat-part`, `rb-foe`, `rm-word` and about 25 others.

### TypeScript exports referenced nowhere (not even tests)

- **Functions:** `gear-view.ts:57 gearTint`, `dungeon-playback.ts:53 roomNames`, `trip-view.ts:63 tripTakesMs`, `rules/dungeon.ts:134 roomPlanValid` (tests only).
- **Types:**
  - `gear-types.ts:135 GearActionResponse`, `:156 EquipRequest`, `:157 KeyedRequest`;
  - `api.ts:265 DurationId`;
  - `expedition-types.ts:15 SupplyKind`, `:35 PushOnBody`, `:106 TripsState`, `:168 ClaimResponse`, `:174 TripResponse`, `:233 TripErrorCode`.
- **Worker:** `apps/worker/src/gear-store.ts:59 RARITY_SET`.

### Referenced only from tests (dead in production; delete together with their tests, unless a test uses one as a seam)

- `gear-view.ts:560 lootLines`
- `dungeon-playback.ts:218 foeHpLine`, `:223 creatureHpLabel`
- `dungeon-text.ts:117 roomCardTitle`
- `trip-view.ts:99 choiceLabel`
- `live.ts:355 autoFireLabel`
- `creature-popover.ts:56 canGoBack`
- `progress-track.ts:68 nodeSummary`
- `game.ts:144 catchBadges` (superseded by `catchBadgeTags`)
- `raid-time.ts:120 countdownText` (superseded by `raid-now.ts`)
- `stage-fx.ts:94 beatHoldMs`
- `stage.ts:479 beatOffsets`
- `raid-progress.ts:84 READINESS_HINT`, `:87 readinessLabel`
- `coach.ts:21 resetCoachSession` (a test seam: keep)
- In `packages/game`:
  - `rules/expedition.ts:7 expeditionDurationMs` and `:12 expeditionCost`, plus `rules/config.ts:655-656 DURATION_IDS`/`SUPPLIES_IDS`: the v1 expedition rules. `recallCatches` in the same file **is** still used.
  - `rules/catching.ts:55 rollCatch` / `:101 rollCatches`: tests only.

About 60 further exports are used only inside their own file. Dropping the `export` keyword there is optional; there is a full list in the agent's notes.

### Glossary entries that no screen opens

These are forced to exist by `FIXED_GLOSSARY_IDS` (`packages/game/src/glossary.ts:93,109,111,112`) and `packages/game/test/glossary.test.ts:547-550`:

- `readiness` (`glossary.json:555`; the UI opens `readiness-<band>` instead)
- `dungeon-row` (`:1071`)
- `room-modifiers` (`:1099`)
- `room-boss` (`:1110`)

Remove them, or wire them up. **Ask Misa:** these may be meant for How to play.

### Items from the plan

- **Jackpot UI leftovers:** none. Only comments (`Reveal.tsx:73`) and tests remain. The jackpot is a hidden server mechanic and stays.
- **Old "Hold" wording:** none in player text. `hold`/`unhold`/`held` are wire values (`live.ts:333,394-405`, `AbilityPopover.tsx:72,133`) and stay.
- **Removed dungeon ability styles:** already gone. Nothing in the dungeon CSS (4673-5272) mentions abilities except the comment on `.pop-tags` (5134).
- **Fortune streak:** `stage.ts:339` plus `.stage-callout.banner`. Keep.

**Risk: low.** No visible change. Smoke screenshots: Raid, Replay, Live, Collection.

**Size:** about −150 CSS, about −120 TS (plus their tests), about −45 JSON.

---

## 12. `styles.css` split (6,888 lines)

Vite bundles CSS `@import`, so this needs no new dependency. **Step A** is a pure cut: the files are listed in today's source order, so the cascade is identical. **Step B** dedupes. A few blocks that sit far apart have to land in the same file.

| New file                          | Approx. current lines                                                 |
| --------------------------------- | --------------------------------------------------------------------- |
| `styles/fonts.css`                | 1-35                                                                  |
| `styles/tokens.css`               | 36-70, 4060-4066 (gear and rarity tokens)                             |
| `styles/base.css`                 | 72-199, 382-396, 424-491 (cards, details, `dl/.row`)                  |
| `styles/controls.css`             | 200-266, 529-533 (`button.toggle.on`)                                 |
| `components/glossary-tag.css`     | 267-362                                                               |
| `components/tabs.css`             | 363-381, 4084-4136                                                    |
| `components/tag.css`              | 398-423, 513-527, 946-958, 1266-1298, 1546-1555, 3602-3608, 4201-4245 |
| `components/slot-row.css`         | 593-773, 1388-1516, 4768-4797, 6739-6795                              |
| `views/replay.css`                | 774-852                                                               |
| `views/raid-abilities.css`        | 853-876, 3370-3393, 6849-6882                                         |
| `views/live.css`                  | 877-944                                                               |
| `views/raid-progress.css`         | 959-1030, 6509-6588 (timeline)                                        |
| `components/reveal.css`           | 1031-1162                                                             |
| `views/after-action.css`          | 1163-1224, 1677-1687                                                  |
| `components/pixel.css`            | 1225-1265 (`.label`, `.portrait`, sprite)                             |
| `components/bars.css`             | 534-539, 1299-1387, 6432-6508                                         |
| `views/collection.css`            | 1517-1608, 4556-4623                                                  |
| `views/boss-card.css`             | 1609-1676, 6589-6736                                                  |
| `stage/stage.css`                 | 1688-2217, 2406-2508, 5056-5076, 5142-5171                            |
| `components/popover.css`          | 2218-2405 (`.stage-pop`, `.ab-*`), 3660-3712, 5077-5141               |
| `stage/fx.css`                    | 2509-2717                                                             |
| `stage/motion.css`                | 2718-3369                                                             |
| `stage/countdown.css`             | 3394-3599                                                             |
| `views/app.css`                   | 3622-3659                                                             |
| `views/how-to-play.css`           | 3713-4037                                                             |
| `components/coach.css`            | 4038-4057                                                             |
| `components/gear-art.css`         | 4067-4083, 4137-4300                                                  |
| `views/gear.css`                  | 4302-4436                                                             |
| `components/picker.css`           | 4437-4499                                                             |
| `views/workshop.css`              | 4500-4555, 6305-6333                                                  |
| `components/loot.css`             | 4624-4672, 5213-5271                                                  |
| `views/dungeon.css`               | 4673-4767, 4798-5055, 5172-5212                                       |
| `views/expeditions/banner.css`    | 5273-5332                                                             |
| `views/expeditions/catalogue.css` | 5333-5575                                                             |
| `views/expeditions/send.css`      | 5576-5846                                                             |
| `views/expeditions/trips.css`     | 5847-6057                                                             |
| `views/expeditions/claim.css`     | 6058-6214                                                             |
| `views/expeditions/profile.css`   | 6215-6304                                                             |
| `components/progress-track.css`   | 6334-6431                                                             |

### Duplicated and near-duplicated blocks to merge in Step B

- **Same selector defined twice** (the later block wins on conflicts, so check each before merging):
  - `.pips` 1329 / 5731 (conflicting sizes; see §4);
  - `.party-slot` 677 / 1394; `.party-slot.empty` 700 / 1409 / 4786; `.party-slot .slot-num` 717 / 1400;
  - `.tab` 369 / 4088;
  - `.hp-bar` 534 / 1356 (+848);
  - `.xp > span` 1306 / 1566;
  - `.stage-head` 1700 / 1713;
  - `.stage-pop::after` 2244 / 2271 / 2278; `.stage-pop[data-placement='below']::after` 2284 / 2294;
  - `input[type='text']` 203 / 255;
  - `.stat-list` 4252 / 4382; `.goal-odds` 5951 / 5979; `.explorer-row` 6252 / 6273;
  - `.loop-node.br` 3875 / 3893; `.slot-unlocked` 6151 / 6155; `.wipe-notice ul` 6297 / 6301.
- **Identical bodies:**
  - `.creature-pop .cp-tags` 5111 = `.pop-tags` 5135;
  - `.turn-strip` 782 = `.replay-row` 814 (dead);
  - `.job-state(.ready)` 4519-4526 = `.trip-timer(.ready)` 5897-5904;
  - `.job-bar > span` 4529 = `.trip-bar > span` 5892;
  - `.reveal-festival-box` delay 1104-1110 = `.reveal-gear-box` delay 4664-4670;
  - `.reveal-festival-box.done .pop-in` 1112 = `.loot .pop-in` 4660;
  - "tag without the ?" ×4 (337-357, 4720-4742, 4743-4751).
- **Element colours, set 3 ways:** `.t-*` 1283-1297 (hard-coded box-shadow), `.el-*` 1519-1533 (`--el`), `.boss-card.el-*` 1626-1640 (`--elem`). Make it one `--el` and derive the others; `.dungeon-landmark-chip` 4683 follows the same pattern with gold.
- **Raw values to make into tokens:**
  - ink-outline text-shadow ×5 (2535, 2598, 2691, 3420, 4849);
  - `rgb(255 95 109 / x)` ×5 (1448, 1912, 2483, 2494, 2503) → `color-mix(var(--bad) …)`;
  - `rgb(13 10 26 / x)` ×3 → ink alpha;
  - `#3a2033` ×3 (1326, 2717, 5074) → `--hp-gone`;
  - `#c8952b` ×3 (238, 379, 5412) → `--gold-shade`;
  - `#6b3fa0` ×2;
  - 13 different ad-hoc `z-index` values (1-100) → a `--z-*` scale (stage 20/25/30/40, popover layer 60, how-to 100).
- **`prefers-reduced-motion`:** 16 separate blocks. Keep one per file; do not merge across files.

**Risk.**

- **Step A: low.** No changes are expected. Diff the built CSS: the minified output should be byte-equal apart from `@import` ordering.
- **Step B: medium.** Full screenshot set (§14).

**Size.** Step A: ±0 net (6,888 → ~6,900 including `@import` lines). Step B: about −250.

---

## 13. Other duplicated patterns (not on the plan's list)

| #   | Pattern                                            | Where                                                                                                                                                                                                                                                               | Proposal                                                                                         |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| O1  | JSON POST helper                                   | `api.ts:457 postJson`, `expedition-api.ts:18 postJson`, `gear-api.ts:34 post`, `raid-api.ts:698 send`; inline at `dungeon-api.ts:27`, `live-api.ts:261,272`, `raid-channel.ts:84`                                                                                   | `apiPost(path, body, method = 'POST')` in `api.ts` (−30)                                         |
| O2  | Hand-written `let cancelled` fetch effects         | App:76, RaidNews:22, Game:82, Live:100, Replay:33, Raid:94, FinaleGearLoot:19, AfterAction:47; `use-loaded.ts:17 useLoaded` exists but only Expeditions uses it                                                                                                     | Adopt `useLoaded` where it is a plain load (Replay, AfterAction, FinaleGearLoot, RaidNews) (−40) |
| O3  | Playback controls                                  | `Replay.tsx:106-135` (Play is a primary button, "Skip to end") vs `DungeonPlayback.tsx:72-95` (Pause is an `aria-pressed` toggle, "Skip"). **Inconsistent semantics**                                                                                               | `<PlaybackControls playing speed onToggle onSpeed onSkip skipLabel/>`                            |
| O4  | Toggle button `class={x ? 'toggle on' : 'toggle'}` | DungeonTeam:273, Expeditions:120, Replay:120, DungeonPlayback:76/86, Stage:78                                                                                                                                                                                       | `<ToggleButton pressed>`                                                                         |
| O5  | Icon renderers, plus 5 icon type unions            | `RewardPile.tsx:8 PileIconView`, `ExpeditionIcons.tsx:10 ExpIcon`, `DungeonPrerun.tsx:12 ModifierPicture`; types `PileIcon` (reward-pile.ts:11), `RewardIcon` (push-on-view), `WorthIcon` (trip-view), `GiftLine.icon` (claim-view), `ModifierIcon` (dungeon-rooms) | One `IconRef = {kind:'glyph'                                                                     | 'part' | 'gear' | 'element' | 'supply', …}`and one`<GameIcon icon scale/>`; `CountBadge` uses it |
| O6  | Visually hidden live region                        | Placement:299, DungeonTeam:284, Live:336, DungeonPlayback:231                                                                                                                                                                                                       | `<LiveRegion>`                                                                                   |
| O7  | `CreatureInfo` built by hand                       | Stage:530-536, DungeonResults:244-250, `send-view.ts:142 explorerInfo`                                                                                                                                                                                              | `creatureInfoOf(x)`                                                                              |
| O8  | Element slug regex                                 | `ElementChip.tsx:14`, `BossCard.tsx:140`, `art.ts:117`                                                                                                                                                                                                              | `elementSlug()`                                                                                  |
| O9  | "Got it" reveal shells                             | Reveal:100/136, JobReveal:98/128, TripReveal:82/264 (and CoachMark:32 and WipeNotice:47 as notices)                                                                                                                                                                 | `RevealShell` (§3)                                                                               |
| O10 | Boss HP bar + caption                              | BossCard:168-178, Live:340-351                                                                                                                                                                                                                                      | `BossHp` (§4)                                                                                    |
| O11 | XP view helpers                                    | `trip-view.ts:297 xpBar`, `:320 explorerXp`, `xp-bar.ts:18 xpBarView`                                                                                                                                                                                               | One `explorerXpView`; ExplorerProfile uses `XpBar`                                               |
| O12 | Error text maps and stale checks                   | `game.ts:169/258`, `dungeon-text.ts:17/32/40`, inline 404/409 at Game:131 and Raid:158                                                                                                                                                                              | One `errorText(err, table)` and `isStaleError`                                                   |
| O13 | Worker duplicates                                  | 4 error classes, 4 `atomically`, 2 `parseBody`, 3 `idempotencyKey` schemas, 4 dungeon credit blocks                                                                                                                                                                 | §10                                                                                              |
| O14 | Drop-outcome helpers                               | `raid-dnd.ts:34` / `dungeon-team.ts:147`; `'Cancelled.'` literal at dungeon-team:166                                                                                                                                                                                | §2                                                                                               |

---

## 14. Screenshot set

Use the dev-tools harness from `dev-tools.md` if it exists; otherwise the throwaway Playwright harness with the `src/fixtures/*.json`. Take each at **390 and 1024 px**.

| ID  | View                    | State(s)                                                                                                |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| S1  | Collection              | card with all badges, level bar, gear slot                                                              |
| S2  | Raid tab                | boss card (each element plus festival), boss icon popover, timeline, now line, ability chip open        |
| S3  | Raid placement          | empty, selected, dragging valid / invalid, locked, 3+ owners                                            |
| S4  | Live finale             | lobby without stage, live stage, ability popover (zone, element), note popover, help popover, countdown |
| S5  | Replay                  | controls, log open                                                                                      |
| S6  | Finale reveal           | cleared, not cleared, festival plus gear; after-action card                                             |
| S7  | Dungeon setup           | team empty, full, dragging, "Show all"                                                                  |
| S8  | Dungeon prerun and next | depth/landmark chips, streak pips, track                                                                |
| S9  | Dungeon playback        | room banner (foe, boss), unit HP                                                                        |
| S10 | Dungeon results         | cleared, lost, landmark, streak bonus                                                                   |
| S11 | Expeditions catalogue   | title plate (long name), locks                                                                          |
| S12 | Send flow               | lengths, supplies, haul strip                                                                           |
| S13 | Running trip            | out, pushing, choice, ready; slots strip                                                                |
| S14 | Trip reveal             | loot, catches, rank gift, failed, nothing                                                               |
| S15 | Journal, Profile        | progress bars, explorer rows                                                                            |
| S16 | Workshop                | jobs running and ready, supply crafting, job reveal for each kind                                       |
| S17 | Item detail             | rarity tags, enchant                                                                                    |
| S18 | How to play             | all art blocks                                                                                          |
| S19 | Glossary popovers       | page tag (above, below, at edges), creature popover on both faces                                       |

---

## 15. Refactor slices (smallest risk first; each is one commit)

This order is by risk, as asked. `cleanup-1.md` instead orders the slices "popover, bars, loot, slots, tags, time, parse, worker, CSS split, dead code". This list runs dead code and the slices with no UI first, and does the CSS split before the component slices, so that each later component commit edits one CSS file.

| #   | Slice                                                                                                                                                | Files                                                                                                                                                                            | Risk        | Screenshots                                 | ≈ Size                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------- | ----------------------- |
| 1   | **Dead CSS** (§11 table)                                                                                                                             | `styles.css`                                                                                                                                                                     | low         | S1, S2, S4, S5 as a smoke check             | −150                    |
| 2   | **Dead TS exports and test-only helpers** (keep test seams); drop unused `export`s                                                                   | files in §11, their `*.test.ts`                                                                                                                                                  | low         | none                                        | −120 TS, −tests         |
| 3   | **Unused glossary entries and v1 expedition rules** (after asking Misa about the 4 entries)                                                          | `packages/game/src/glossary.ts`, `content/data/glossary.json`, `rules/expedition.ts`, `rules/config.ts`, `rules/catching.ts`, tests                                              | low         | S18 (no change expected)                    | −90                     |
| 4   | **Worker plumbing:** one `GameError` + `atomically`, one `parseBody`, one `IdempotencyKeySchema`                                                     | `apps/worker/src/{outcome,gear,dungeon,raid,raid-teams,collection-routes,raid-routes,*-schemas}.ts`                                                                              | low         | none                                        | −70 / +20               |
| 5   | **Worker keyed actions and `payOnce`** + key namespace rule in `decisions.md` (keys byte-identical)                                                  | `keyed-action.ts` (new), `gear.ts`, `expeditions.ts`, `dungeon.ts`, `collection.ts`, `gear-grants.ts`, `docs/design/decisions.md`                                                | medium      | none                                        | −90 / +70               |
| 6   | **Client `parse-core.ts`**                                                                                                                           | `api.ts`, `gear-parse.ts`, `expedition-parse.ts`, `dungeon-parse.ts`, `raid-api.ts`, `live-api.ts`, `raid-channel.ts`                                                            | low         | none                                        | −70 / +35               |
| 7   | **`apiPost`** + `useLoaded` adoption (O1, O2)                                                                                                        | `api.ts`, `*-api.ts`, `raid-channel.ts`, Replay, AfterAction, FinaleGearLoot, RaidNews                                                                                           | low         | S5, S6                                      | −70 / +15               |
| 8   | **`time-format.ts`** + `useServerNow` (pure move; "m"/"min" decided separately)                                                                      | `game.ts`, `raid-time.ts`, `gear-view.ts`, `live.ts`, `leet-status.ts`, `destination-view.ts`, `trip-view.ts`, `hooks.ts` + callers                                              | low         | S2, S12, S13, S16, S8                       | −60 / +50               |
| 9   | **`useActionRunner`**, ActionId builders, `isStaleError`, `errorText` table; remove `'draft-key'`                                                    | `actions.ts`, `Game.tsx`, `Dungeon.tsx`, `Raid.tsx`, `gear-actions.ts`, `game.ts`, `dungeon-text.ts`                                                                             | medium      | none (manual retry test)                    | −80 / +50               |
| 10  | **CSS split, Step A** (pure cut, same order, `@import`)                                                                                              | `styles.css` → `styles/**`                                                                                                                                                       | low         | full S1-S19 (expect zero diff)              | ±0                      |
| 11  | **CSS Step B:** tokens (outline, alpha colours, element `--el`, z-scale, alias tokens), merge identical and duplicate selectors                      | `styles/**`                                                                                                                                                                      | medium      | full S1-S19                                 | −250                    |
| 12  | **Small shared components:** `ToggleButton`, `LiveRegion`, `PlaybackControls`, `GameIcon` + `IconRef`, `creatureInfoOf`, `elementSlug`               | new `ui/*.tsx`, Replay, DungeonPlayback, Expeditions, Stage, RewardPile, ExpeditionIcons, DungeonPrerun                                                                          | low-medium  | S5, S9, S13, S14                            | −60 / +60               |
| 13  | **Bars:** `percent`, `Bar`, `TimerBar`, `SegmentBar`, `BossHp`, `PipRow`; ExplorerProfile switches to `XpBar`                                        | PixelBar, JobSlots, RunningTrip, SlotsStrip, Journal, ExplorerProfile, Stage, BossCard, Live, ExpeditionIcons, DungeonPrerun, HowToPlayArt, `bars.css`                           | medium      | S1, S2, S4, S8, S9, S12, S13, S15, S16, S18 | −110 / +70 TSX, −35 CSS |
| 14  | **Tags and chips:** `Tag`, `ElementChip role` id plus button variant, `.gtag-bare`                                                                   | ElementChip, Glossary, CoachMark, Collection, BossCard, DungeonPrerun, DungeonResults, HowToPlayArt, GearArt, TripReveal, RunningTrip, PlaceCard, PushOnChoice, Stage, `tag.css` | medium      | S1, S2, S8, S10, S13, S14, S17, S18, S19    | −60 / +50, −40 CSS      |
| 15  | **Loot and reveal:** `CountBadge`, `pileLabel`, `RewardSummary`, `RevealShell`, `OutcomeBadge`, `RevealLater`                                        | RewardPile, GearArt, GearLoot, FinaleGearLoot, TripReveal, DungeonResults, Reveal, JobReveal, `claim-view.ts`, `reveal.css`, `loot.css`                                          | medium      | S6, S10, S14, S16                           | −120 / +90, −20 CSS     |
| 16  | **Banners and title plates:** `TitlePlate`, `PixelHeading`, `Callout`                                                                                | Catalogue, DungeonPlayback, BossCard, Reveal, TripReveal, Stage (RoundIntro), `boss-card.css`, `dungeon.css`, `expeditions/*.css`                                                | medium      | S2, S4, S9, S11, S14                        | −20 / +35, −45 CSS      |
| 17  | **Popover shell:** `Popover`, `usePopoverNav`, `PopoverCard`, `PopoverBack`, `PopoverHost`; BossIcon joins the host                                  | StagePopover → Popover, Glossary, SmallCreature, `creature-popover.ts`, `glossary-ui.ts`, BossCard, Stage, AbilityPopover, Live, `popover.css`                                   | medium-high | S2, S4, S19 + keyboard pass                 | −140 / +90, −25 CSS     |
| 18  | **Slot row:** `SlotRow`, `SlotButton`, `CreatureTray`, `DragGhost`, `useSlotKeyboard`, shared Tap/outcome types; settle "Empty" and Unplace/Take out | Placement, DungeonTeam, `raid-dnd.ts`, `dungeon-team.ts`, `raid-slots.ts`, `slot-row.css`                                                                                        | medium-high | S3, S7 + manual touch drag                  | −150 / +110, −15 CSS    |

**Estimated total:** about −1,700 / +900 lines, net about −800, plus a 6,888-line stylesheet split into ~40 files.

### Decisions to ask Misa (game feel, not implementation)

1. **Unit spelling:** "3 h 44 min" or "3 h 44 m".
2. **Remove button wording:** "Unplace" or "Take out".
3. **Glossary entries:** should the four unused ones (`readiness`, `dungeon-row`, `room-modifiers`, `room-boss`) go, or appear somewhere?
4. **After-action bars:** should they become pixel bars like everywhere else? This is a visible change.
