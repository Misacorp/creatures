# Creature abilities

Status: **agreed with Misa 2026-10-11**. Builds on `m3-combat.md` (finale abilities) and `m5-finale.md` (the live finale).

## What players get

- **One basic ability for everyone.** Before the finale, each player picks one of the four basic abilities: Rally, Shield Wall, Re-mark or Purge. They are deliberately **weak**, so a newcomer has something to press but a trained creature's ability is clearly better. If you don't pick, you get one by round-robin, as today.
- **Creature abilities.** Every evolution line, and every species that doesn't evolve, has its own finale ability:
  - It is **unlocked at level 10** (`RULES.abilities.unlockLevel`).
  - The **stage 2** form has a stronger version of its line's ability. Species without an evolution have one strength, set between the two stages.
- **In the finale** you get one use of each unlocked ability among the **3 creatures in your raid team**, plus your basic ability, so up to 4 uses. Each one fires once.
  - **Absent or idle players:** every ability fires on its own at its default round.
  - **Present players:** Fire and Hold work per ability, exactly as in `m5-finale.md`.
- The Collection shows each creature's ability: "Unlocks at level 10", then the ability, and after evolving its stronger form. That is the payoff for training a creature: it finally gets its move.

## Effects (content data, interpreted by the engine)

An ability is a list of **effects**. The engine interprets a small set of operations, and abilities combine them in data:

| op            | parameters                                                          | meaning                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rally`       | `damageBp`, `rounds` (default 1)                                    | All creatures deal `damageBp` more damage for `rounds` rounds.                                                                                                                                                                                             |
| `shield_wall` | `zone`: `choose` or `own`, `reduceBp` (10000 = no damage), `rounds` | One zone takes `reduceBp` less damage. `own` is the zone of the ability's creature. `choose` takes the player's pick, with the default as now.                                                                                                             |
| `re_mark`     | `element`: `choose` or `own`                                        | Sets the boss's mark (`own` is the creature's element).                                                                                                                                                                                                    |
| `purge`       | `rounds` (absent = the rest of the fight)                           | Turns off the Phase 2 adaptation.                                                                                                                                                                                                                          |
| `strike`      | `atkBp`                                                             | The ability's creature hits the boss at once for `atk × atkBp / 10000`. The hit can cash in the boss's mark like any hit, so reactions and contribution work as usual. A knocked-out creature's strike still lands, so no player is punished for bad luck. |

- The basic abilities are the four ops, at weaker values than M3's single abilities, for example Rally +15% for 1 round and Shield Wall at 50%.
- Creature abilities fit their role. Setters re-mark (often their own element) with a small bonus, payoffs strike, guards shield their own zone, and supports rally.
- Exact numbers come from the balance simulator.

## Engine changes

- `AbilityChoice` gains `key` (unique per fight, for example `m1:basic` or `m1:c2`) and an optional `creatureId` (the source slot, needed for `own` and `strike`).
- A player may hold several choices.
- `defaultAbilityRound` stays per ability definition.
- `FinaleAbilityDef.effect` becomes `effects: Effect[]` (1 to 3).
- Engine tests must stay deterministic, and the prefix-property test must cover the new ops.

## Content changes

- `finaleAbilities` holds the basic set, flagged with `kind: 'basic'`.
- Each species gets an optional `ability: { id }`. For evolution lines, stage 1 and stage 2 point at two ability ids, such as `tidal-mark` and `tidal-mark-2`.
- Ability definitions live in the same `finaleAbilities` list with `kind: 'creature'`.
- The content schema checks that every referenced id exists and that `kind` matches.

## Server and client

- **Server:**
  - At the finale start, each member's abilities are built from their pick plus their frozen team: creature level ≥ `unlockLevel` means its species' ability.
  - The live snapshot's `abilities` gets one entry per use: `key`, `alias`, `abilityId`, `creature` (the slot id, or null), `mode`, `fired`, `defaultRound`, `fireAtRound`.
  - `POST /api/raid/live/action` gains a required `key` (strict schema; it must be one of the caller's own keys).
  - The raid view shows `you.abilities`, the abilities you will bring, before the fight.
- **Client:**
  - The live ability panel lists all your abilities, each with its own Fire/Hold.
  - The Raid tab shows your finale abilities, including locked ones ("Ember Fang: unlocks at level 10").
  - The Collection card shows the creature's ability and its lock state.
  - The ability picker now picks only the basic ability.

## Pity: finale wins only **[Misa]**

The pity counter now advances only on a finale **win** without a jackpot. A loss changes nothing. Soft pity starts at raid 5, not 6 (`RULES.raid.jackpot.softPityFromRaid`); the simulator showed both pity targets pass this way. The sim's `PITY_COUNTS_LOSSES` becomes `false`. The worker's `rollJackpots` makes the same change.
