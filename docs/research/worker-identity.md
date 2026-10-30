# Worker identity against rotation (research, 2026-10-30)

For the valley plan's question **work-identity** (`docs/design/valley/questions.md`, Q17 and Q19). Misa wants creatures to "grow into some kind of an identity that they're good at something", while players are "still encouraged to do something else with their creatures instead of just having them in a single place all the time"; he floated per-recipe proficiency at the Forge and worried it might be too granular.

A researcher agent (read-only web) wrote the report; the lead summarised it here. Confidence: **[C]** confirmed by a source read, **[S]** secondary (wiki, guide, forum, search summary), **[I]** inference. Most evidence is [S]; Melvor's primary pages could not be opened, and player-sentiment evidence is thin.

## How games give units an identity through use

- **Per-item mastery (Melvor Idle, Rune Factory).** Melvor gives every item its own mastery level (to 99) with a shared pool; Rune Factory gates recipes by skill per craft category, and players level it by failing junk crafts on purpose. Both are the player's progression, not a unit's identity [S]. Melvor's own wiki once said the system "requires a complete overhaul" [S].
- **Per-job mastery with carry-over (Final Fantasy V and Tactics).** Abilities and stats from a mastered job carry to others; mastering many jobs is the stated goal. Reviewers call Tactics' job system the series' best [S]. The clearest "rotation by design".
- **Mastery that opens the next job (Kairosoft: Dungeon Village 2, Venture Towns, Game Dev Story).** A job must be mastered before others open; Game Dev Story's top class needs every earlier role at level 5 [S]. The closest in genre to an idle management game.
- **Species-fixed perks (Pokémon Sleep, Palworld).** Pokémon Sleep fixes each species' specialty and main skill; individuals vary in sub skills and natures [S]. Palworld gives each species work suitability levels per work type, and passives multiply output, so optimising drifts into spreadsheet breeding [C/S].
- **Earned marks (Darkest Dungeon quirks, Wildermyth).** Narrative marks earned through play create strong attachment ("unique to you") but do not affect where a unit works [S].
- **Fixed visible interests (RimWorld passions, Oxygen Not Included).** RimWorld shows zero, one or two flames per skill: a burning passion learns at 150% against 35% for none, with a mood bonus [S]. A compact identity display [I].

## What creates attachment, and what creates movement

| Pattern                                       | Attachment                       | Reason to move                     | Confidence |
| --------------------------------------------- | -------------------------------- | ---------------------------------- | ---------- |
| Earned narrative marks (Wildermyth, DD)       | high                             | none by itself                     | S/I        |
| Fixed visible traits (RimWorld, ONI)          | medium-high ("the cook")         | weak                               | I          |
| Per-job mastery with carry-over (FFV, FFT)    | high, feels like growing         | strong: the next job is the reward | S          |
| Mastery gauges opening new jobs (Kairosoft)   | medium                           | strong: an explicit path           | S          |
| Per-item mastery (Melvor)                     | low for units                    | rotates items, not units           | S          |
| Species-fixed perks (Pokémon Sleep, Palworld) | collection value, not individual | a slotting puzzle                  | S/I        |

The pattern that serves both of Misa's goals is **permanent mastery, with breadth as the reward**: what a creature masters stays, and mastering one thing opens something elsewhere, so moving on gains instead of loses [I]. "Diminishing returns on staying" has almost no support [I]. Moving should be free: WoW dropped its respec fee, and players call respec costs a barrier to trying things [S].

## What players dislike

- Too many per-item counters and slow pacing (Melvor's recurring complaints) [S].
- A pool that overflows while away: "I don't like waking up knowing I missed out on a lot of mastery xp, or having to remember to check throughout the day to spend it" (a Melvor player, on a mirrored Reddit thread) [S]. Directly against a once-a-day game.
- Lock-in by sunk cost and costly re-specs [S].
- Invisible numbers and guides needed to judge a unit (Pokémon Sleep scoring sheets, Palworld breeding guides, Cult of the Lamb's purposeless traits) [S].
- Grinding for the right roll ("a slot machine", Pokémon Sleep) [S]; numbers that seem to change in secret ("Skillgate", Pokémon Sleep, 2026) [S].

## Designs that would fit (the researcher's, lightly edited)

1. **Craft "hands" by recipe family.** A creature masters a family (4 to 6 of them: hats, scarves, charms...), not each recipe; mastery is permanent and gives a small perk elsewhere. Closest to Misa's idea, but covers only the Forge.
2. **Species perks plus an earned title.** A fixed, visible work perk per species (worth catching), and a title from deeds ("Far-Walker") that is flavour only. Easy to read; perks are the sorting Misa flagged, and nothing asks a creature to move.
3. **Visible mastery per kind of work, with carry-over** (the researcher's pick). About four tracks (scouting, smithing, keeping, teaching) shown as badges; time fills a track fast at first, then slower; a mastered track is permanent and opens a small perk at another kind of post; the card says "ready to learn something new"; moving is free; a species can lean toward a track (learns it faster, RimWorld-style) but is never barred. Optional earned titles on top.

Cautions: do not copy Melvor's per-item pool (overflow, check-in tax); no hidden multipliers or random-roll identities; the numbers come from the economy lab, not from these games [I].

## Sources

- https://wiki.melvoridle.com/w/Mastery_pool
- https://wiki.melvoridle.com/w/V0.17
- https://axebps-redlib.hf.space/r/MelvorIdle/comments/1f8tfkk/mastery_pool_can_overflow_mod_has_been_a_lifesaver (a Reddit mirror)
- https://bulbapedia.bulbagarden.net/wiki/Skill_(Sleep)
- https://daily.pokecommunity.com/2026/02/23/skillgate-a-controversy-for-pokemon-sleep/
- https://palworld.wiki.gg/wiki/Work_suitability
- https://www.exitlag.com/blog/palworld-breeding-guide/
- https://almarsguides.com/retro/walkthroughs/ps1/games/finalfantasyanthology/finalfantasyv/bestjobs/
- https://StrategyWiki.org/wiki/Final_Fantasy_Tactics/Gameplay
- https://kairosoft.wiki.gg/wiki/Jobs_(Dungeon_Village_2)
- https://kairosoft.wiki.gg/wiki/Jobs_(Venture_Towns)
- https://www.tvtropes.org/pmwiki/pmwiki.php/VideoGame/GameDevStory
- https://rimworldwiki.com/wiki/Passion
- https://oxygennotincluded.wiki.gg/wiki/Skills
- https://darkestdungeon.wiki.gg/wiki/Quirks
- https://pcgamer.com/great-moments-in-pc-gaming-transforming-a-hero-into-something-bizarre-in-wildermyth
- https://gideonsgaming.com/wildermyth-review-a-legendary-fable/
- https://indiecator.org/2022/09/08/cult-of-the-lamb-is-good-but/
- https://www.digitaltrends.com/phones/fallout-shelter-guide/
- https://destructoid.com/?p=487425
- https://de.classic.wowhead.com/news=253031
- https://forum.lastepoch.com/t/allow-respecialised-skills-to-keep-old-xp-values-new-ones-start-at-0/41827/11
- https://game8.co/games/Rune-Factory-5/archives/376177
- https://guidestrats.com/rf4-forge-crafting-table/
