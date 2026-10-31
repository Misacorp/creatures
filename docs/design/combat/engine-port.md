# Phase 2 plan: porting the lab's rules into the engine

Status: plan, 2026-10-31. Phase 2 of `roadmap.md`: the combat v2 rules (proposal v0.9, R1 to R24) move from `packages/lab` into `@creatures/engine` as a second rules version. Gate: the engine gives the lab's exact results on the same seeds and inputs, and every engine and replay test is green.

## 1. What is rules and what is measurement

The lab's fight is already pure (no I/O, an injected RNG) and takes resolved input except for one step, `placeFighters`, which looks content up by id. That step is the seam.

| Lab code                                                                                                                       | Kind                         | Where it goes                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------- |
| `fight.ts`: `fight`, `weekend`, `resistedElement`, everything they call                                                        | Rules                        | `packages/engine/src/v2/`, split by rule group (section 3)                         |
| `types.ts`: `Fighter`, `Pattern`, `BossMove`, `Escalation`, `BossDef`, `BossMods`, `FightOptions`, `FightEvent`, `FightResult` | Rules (the input and output) | `engine/src/v2/types.ts`                                                           |
| `rules.ts` (`LAB_RULES`)                                                                                                       | Rules (numbers)              | the engine's `V2Rules` type; the values are carried in every input (section 2)     |
| `knacks.ts` `KnackFx` (the effect vocabulary); `talents.ts` `mergeFx`, `STAT_FIELDS`, `ADDITIVE_FIELDS`                        | Rules                        | `engine/src/v2/effects.ts`                                                         |
| `species.ts` `formStats` (base plus growth by level, capped)                                                                   | Rules                        | `engine/src/v2/` beside the v1 scaling, reading the form data it is given          |
| The Knack and talent catalogues, line pools, armour, stat overrides, rule cards, raid boss specs, foes                         | Content                      | stay in the lab now; phase 3 makes them schema-validated data in `@creatures/game` |
| `placeFighters`' lookups (form id to stats, Knack and talent ids to effects, `talentIdleUnder`)                                | Content resolution           | the lab (now) and the game (phase 3) resolve a placement into an engine fighter    |
| Search, tuners, the track, the path, measures, reports, ownability, the valley seam, teams, answers                            | Measurement                  | stay in the lab                                                                    |

Kept in the engine although the lab uses them for measurement: **damage potential** (the shadow HP, `potential`), Determination and the per-effect `fires` counters. They are cheap, they change no draw of the dice, and phase 5's simulator needs them.

## 2. The rules-version seam

- **v2 lives beside v1.** `packages/engine/src/v2/` with its own entry points (`fightV2`, `weekendV2`) and types. The v1 code is not touched: stored v1 fights replay as they were. v1 goes when phase 8 ships (and, with the reset Misa plans after the combat and valley reworks, there are no v1 fights to keep after that).
- **A v2 input is whole.** It carries `version: 2`, the rules numbers (`V2Rules`, required), the element chart pairs it uses, every fighter resolved (stats, element, role, merged effects, stat-only effects) and the boss with its cards applied. Nothing is optional "for old fights": v1's input grew a dozen optional fields that mean "the rule before this one"; v2 starts with none, and a later rule change adds a field with no default, or a new version.
- **One dispatcher** (`replayFight(stored, rng)`) reads `version` (absent: v1) when the worker needs it (phase 4).
- **Events.** The port keeps the lab's log events (`kind`, `text`, the announce slots). The board's structured events (slot highlights, the mark strip, the turn strip) are designed with the board in phase 4. Events never draw dice, so adding them later changes no result.

## 3. Order of the port

Each slice is one commit with its tests, and the lab's result digest (section 4) stays identical after every one.

1. **Move.** The fight, its types, `V2Rules` and the effect vocabulary into `engine/src/v2/` as they are; the lab's `placeFighters` becomes its resolver, and the lab's `fight` and `weekend` call the engine. The lab gains `@creatures/engine` as a dependency.
2. **Split** the engine's v2 fight into modules by rule group, the way v1 is split: state and helpers; the board (slots, reach, beside, patterns and targets, R2 and R8); creature hits (damage, cuts, armour, the cap, Pierce, crit and Sure Crits: R6, R6.3b, R7.1, R15); marks and reactions (R3 to R7); Support verbs and heals; boss turns (moves, announce, plain attack, cards and mods: R8, R9, R13); dodge and taking hits (R1, R6.5, Guards, wards); escalation and Mired (R22); the weekend (R14 attrition, Adapts, Element Resistance, R24's carried state).
3. **Move the rule tests down.** The lab tests that prove a rule (`fightRules`, `luck`, `fight`, `fightLiving`, `potential`, `strength`, the rule parts of `engine` and `talents`) become engine tests that name effects directly (a fighter with `critOnDodge`, not the Knack that has it), so each rule is proven without the catalogue. Content tests (this Knack has these effects, every form has its Knacks) stay in the lab until phase 3 moves them to the game.
4. **The seam's own tests:** a v2 input round-trips through JSON and replays exactly; the dispatcher sends a v1 input to v1.

## 4. How parity is proven

- **A result digest.** Before the move, a lab script plays a fixed corpus on the lab's own code (every gauntlet card with its answers and the classic line, every raid boss at each track slot with its answers and a casual team, weekends and potential, several seeds each) and writes a digest of every result field and event. The digest is committed. Every slice must reproduce it exactly, and so must every later engine change that claims to change no rule.
- **The lab's own tests** stay green on the engine code, unchanged, through slices 1 and 2.
- **Speed:** the full report stays under 2 minutes and the lab's tests about where they are; the move must not undo the lab's fast paths (uniform effect objects, memos).

## 5. Alongside phase 2

The lab follow-ups in the roadmap's "Where we are" go on beside the port, on the lab's side of the seam (content and measurement). A rule change during the port lands in the engine once slice 1 is in, and changes the digest on purpose, with the new digest committed in the same commit.
