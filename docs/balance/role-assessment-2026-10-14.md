# Role assessment: what makes players bring each role (2026-10-14)

Sim study by an agent for Misa's question: "players will always bring two setter/payoff creatures and the third is filler". Analysis only; no balance was changed. Modelled with the dungeon always acting left to right (the 2026-10-14 decision). Seeds `roles:econ:0..23` and `roles:raid:<players>:<0..11>`; 500–2000 runs per cell. Raw data and scripts lived in the session scratchpad.

## Findings

1. **The damage spike comes from element pairs, not role labels.**
   - Any creature marks the foe if it has no mark, and any creature of the trigger element cashes the mark in for ×4.5.
   - The payoff's own bonus adds only ×1.1, worth 0–6 clear points. A setter only adds the ability to replace a different mark.
   - Reactions are 50–65% of the best teams' damage.
   - A team that can't react fails from depth 5. At depth 7 the best mono-element team clears 16%, against 99% for a mixed one.
2. **Guard and support look like filler while creatures out-level the depth.**
   - At depth 3 with level 10 creatures, foe attacks are 2–4% of team HP, and every team clears 97–100%.
   - The dungeon pays the same for any clear, so HP saved earns nothing.
3. **Once clears stop being certain, a guard beats a second payoff; a support doesn't.**
   - Foe damage starts to matter at about 25–30% of team HP per run: depth 3 for level 5, depth 10 for level 15, depth 12–14 for level 22.
   - A guard in the middle beats a same-element payoff by +4–9 points at depth 14 and +26–34 points at depth 18–21. For week-1 level 5 teams the edge starts around depth 6–7.
   - Its value comes from the intercept, not its HP.
   - A support is level with or behind a payoff almost everywhere.
4. **Reflect is the main way creatures get knocked out below depth 10.** It comes from the Thorns modifier and from Slag Tyrant's Molten Shell; about half of all runs meet one.
   - The reflected hit is the whole reaction bonus. It can't be intercepted, and it knocks out the payoff in 97–100% of runs at every depth.
5. **Under left to right, order decides whether reactions happen at all.**
   - The same trio swings 30–55 clear points by order.
   - The starters in the suggested order (Splashet / Sproutle / Cindle) never react. At depth 5, level 8, Cindle / Sproutle / Splashet clears about 47% against about 3%.
   - The economy sim's overall numbers barely move under the new rule (overall clear 29.2% → 29.6%).
6. **Abilities that unlock at level 10 are worth +40–55 clear points at the frontier.**
   - Some never fire in foe rooms: Verdant Roar and Aurora Surge default to round 7, but a foe room lasts 6 rounds.
7. **The raid rewards none of this.**
   - Removing guard or support mechanics moves the finale win rate by 0–1.2 points, even with boss Attack ×5. One boss hit a round can't threaten a row of 15–45 creatures.
   - Contribution credit pays a guard about 0.3–0.55× and a support about 0.25–0.75× of a payoff per creature.
   - The setter overwrite is a net negative in parties of 3 or more (about −4 points).

## Levers (scalars in `docs/balance/scalars.md`)

| Lever                                                                     | Effect                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foe Attack scaling (`RULES.dungeon.atkStepBp`, `atkCurveBp`, `baseAtkBp`) | Makes the guard matter 2–3 depths earlier. Everyone clears less, so the HP curve needs a retune to keep the `dungeon-*` targets.                                              |
| `RULES.combat.supportBuffBp`                                              | The only lever for support, and only at the frontier: depth 18 support clear goes 18% → 31% at 3000 and 39% at 5000. In the raid it lifts support credit to about a payoff's. |
| `RULES.combat.guardHpBp`                                                  | Barely matters.                                                                                                                                                               |
| Reaction `multiplierBp` / `payoffBonusBp` (`reactions.json`)              | Sets how dominant the spike is. Changes the whole game.                                                                                                                       |
| Content                                                                   | A single-target strike on landmark bosses gives a clean "guard day". Capping reflect at a share of max HP would punish the spike without deleting a creature.                 |
| New scalar                                                                | A reward for HP kept or a flawless clear would pay the guard at the depths where it saves HP but not the clear.                                                               |
| Raid                                                                      | Needs hits that threaten many creatures at once, or a credit multiplier for guard and support. Boss Attack alone doesn't help.                                                |

## Staging recipes (DEV panel)

The dev grant gives no gear. For each setup, reset today's run and re-roll the seed 6–8 times, and count clears.

1. **Your depth: the third creature looks like filler.** Use level 10, fusion 1, at depth 3, with the modifiers Flooded, Overgrown and Dark. Compare three teams:
   - **A:** Splashet / Stormray / Cindle.
   - **B:** Splashet / Sproutle / Stormray.
   - **C:** Splashet / Ashmole / Stormray.

   All three clear. A loses about 25% of team HP, B and C about 15%. Then swap Dark for Thorns: A clears about 78%, while B and C clear 100%.

2. **A guard that earns its place.** Use level 22, fusion 4, at depth 18 with random modifiers. Compare Tidewing / Pyrelynx / Tempestray (about 4%), Tidewing / Thornbuck / Tempestray (about 37%) and Tidewing / Magmole / Tempestray (about 7%). The failures happen in the boss room.
3. **It's the element pair, not the role.** Use level 15, fusion 2, at depth 10.
   - Thornbuck / Tempestray / Pyrelynx (no setter): 100%.
   - Tidewing / Pyrelynx / Tempestray: 99%.
   - Tidewing / Fogwyrm / Coralynx (all Tide): 9%.
4. **Order is the formation.** Use Tidewing, Thornbuck and Tempestray at level 18, fusion 3, at depth 14. The six orders clear 36–68%. The starters at level 8, fusion 1, depth 5: Cindle / Sproutle / Splashet about 47%, the suggested order about 3%.
5. **The raid only changes your share.** Pick Tidal Colossus, then Cinder Wyrm, and add 9 simulated players. Run a simulated week with a payoff, a guard and a support in your team. The week's result doesn't change, but your contribution drops by about a quarter when a payoff is swapped out.

## Status

No balance change. The order findings feed the 2026-10-14 left-to-right change, which makes "Use my strongest three" element-aware and adds an in-setup reaction hint. The rest waits for live data: see `log.md` entries B-001 to B-004.
