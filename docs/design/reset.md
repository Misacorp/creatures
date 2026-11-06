# The reset (combat v2 phase 6, valley phase 6)

Status: **draft, 2026-11-06.** Nothing here is shipped or built. Everything marked **Proposal** waits for Misa. The combat half is written here; the valley session adds its half in the section kept for it.

## What is decided

- Combat v2 and the valley rework go live together with **one reset**. Nothing is migrated: no Boss Rank, gear, talents or creatures carry over (`pnpm decisions show 2026-10-31-after-the-combat-and-valley-reworks`, `pnpm decisions show 2026-11-06-combat-v2-goes-live-with-the`).
- Before the wipe, each player's creatures, their names and some feats are recorded. Today's players become lore: **the first settlers**. The record is fuel for later content (NPCs, rare finds).
- Misa's brief (2026-11-06): "we wipe everything and leave no trace, but before we do, we record each player's creatures and their names, and find some feats to tie them to."

## 1. The settlers' record: what is kept

One record per server. It holds only what the game already stores today (inventory from the worker's migrations, 2026-11-06).

**Per settler:**

- The name they had in the game (Discord display name, as stored, at most 32 characters) and the day they first played.
- **Every creature:** species (its current form), line, level, shiny, nickname, how it came (starter, trip, Festival), the day it was caught, its quirk. (Misa's brief: "each player's creatures and their names".)
- **The eight feats below**, and nothing else (Misa, 2026-11-06: "only keep a handful").

### The feats (Misa, 2026-11-06)

| Feat                   | How it is read                                                                                                                        | Example                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Deepest dungeon depth  | the deepest depth of a run they cleared (`dungeon_runs`, kept forever); `dungeon_progress.depth` is the next depth unlocked, one more | "Cleared depth 18"                                     |
| First on the server    | per creature line, the earliest catch date among all creatures on the server; ties share it (see below)                               | "First Mossling, Lanternfin and Ashmole on the server" |
| Blueprints owned       | count of `blueprints`                                                                                                                 | "31 blueprints"                                        |
| Creatures owned        | count of `creatures`                                                                                                                  | "42 creatures"                                         |
| Highest level creature | highest level, its name (nickname, else species); a tie goes to the earliest caught                                                   | "Pebbles the Mossling, level 31"                       |
| Total creature levels  | sum of all levels                                                                                                                     | "612 levels in all"                                    |
| Best crafter           | highest Crafting level (`crafting_skill`, level from `skillLevel`) and that creature's name                                           | "Crafting 9: Ember the Ashmole"                        |
| Best explorer          | highest Explorer rank (`explorer_progress`, rank from `explorerRank`) and that creature's name                                        | "Explorer 7: Fizz the Lanternfin"                      |

**First on the server, read by catch date (technical call).** Misa noted the stored server firsts look odd because of evolutions: `server_firsts` also has an `evolve` kind and records the species at the moment of the drop. Instead, for each creature line we take the creature with the earliest `caught_at` on the server and credit its owner, named by the line's first form ("First Mossling"), whatever it has evolved into since. Starters and dev-tool creatures don't count (everyone picks a starter). Creatures are never deleted outside the staging dev tools, so every catch still counts.

**Per server:** its best Boss Rank and the bosses it beat.

### What is already lost (we can't promise these)

- **Finale moments and fight replays** of any week before the last one: old raid logs are blanked; only each week's summary (damage, contribution, kill) stays.
- **Day-by-day Valley Games placings**: only lifetime medals, records and badges stay.
- **Evolution dates.**
- **Avatars and server nicknames**: never stored.

## 2. Who can see the record, and which IDs it keeps

The repository is **public**, so the record never goes into it.

**Technical call (recorded as a decision):**

- The record lives in production only, in one archive object on the Worker (a Durable Object of its own), written by each server just before its wipe. No file, no workflow artifact, no repo copy.
- It keeps **no Discord user IDs and no server IDs**. Each settler gets a random settler id; each server a random archive key.
- Player-typed text (nicknames, notes) stays untrusted: it is stored as it was cleaned at entry, and shown only as text. Private creature notes are **not** recorded.
- Lore that we write by hand from the record (an NPC named after a settler) enters the repo only after Misa approves the names.

**A hidden trace of who was there (Misa, 2026-11-06).** The record keeps a keyed hash (HMAC with a Worker secret) of each player's Discord ID, never the ID itself, and shows it to no one. Later, when players get an identity in the game, a returning settler is matched by it and can get a pioneer tag and a house decoration. The secret must never be lost or rotated, or the link breaks.

**Settlers can appear on every server (Misa, 2026-11-06).** One archive serves all servers, so this costs nothing extra. Before any settler name or creature nickname is used, an agent reads the list once and Misa can strike any name: text typed for friends will reach strangers.

## 3. What is wiped

Everything else, on every server: creatures, talents, Talent Books, gear, materials, Bait and Essence balances and the ledger, Boss Rank and raid history, dungeon, Games, trips, journal, lounge, DMs and sessions. Each server's object deletes its whole store and runs the migrations from zero.

- **Leet stays where it is.** The leet bot's own ledger is never touched (we only read it). **Technical call:** after the wipe, leet payouts start from the switch day. Today a fresh server backfills 7 days of leet (`LEET_BACKFILL_DAYS`); the reset must not pay those days twice.
- **Analytics** keep their hashed daily counts (no names), so we can compare before and after.
- Stored v1 fights go with the wipe, so the "old fights still replay" question is moot.

## 4. When the switch goes on

**Proposal:**

1. Phase 7 (a real raid weekend on staging with Misa and testers) passes, valley included.
2. Misa picks the day. A Discord post a week before tells players the date.
3. One release turns on combat v2 and the valley and carries the reset. Each server resets the first time it wakes on the new build, closed behind a "back soon" card while it works:
   1. Take one snapshot and write the record to the archive; confirm it is stored. If that fails, the server does not wipe and stays closed, so nothing is lost by accident.
   2. DM each player their record from that same snapshot (section 5).
   3. Wipe once the DMs are sent, or after a time limit, so a stuck DM never blocks the reset.
4. A Monday, so the first week starts clean (raid preparation, a full week to the first boss).

## 5. The one-time notice

**Your record, by DM (Misa, 2026-11-06).** Each player gets one Discord DM with their record, and it is not shown in the game. It goes to everyone once, also to those with reminder DMs off (a one-off goodbye, not a reminder). A player whose DMs are closed doesn't get it. It fits Discord's 2,000 characters: the eight feats, then creature names until the limit, then "and N more". Markdown is escaped and mentions are off. Draft:

> **You were one of the first settlers.**
> The valley is starting over, and it will remember you. Here is what it keeps:
> First Mossling and Lanternfin on the server · Cleared depth 18 · 31 blueprints
> 42 creatures, 612 levels in all · Highest: Pebbles the Mossling, level 31
> Best crafter: Ember the Ashmole, Crafting 9 · Best explorer: Fizz the Lanternfin, Explorer 7
> Your creatures: Pebbles, Ember, Fizz and 39 more

**The notice in the game (proposal).** A card on first open after the reset, like the level reset's card, and one Discord post in the announce channel. Draft:

> **A new valley**
> The old valley has gone quiet. The first settlers are remembered, and their creatures with them. Pick a starter and find your way.

## 6. How the record feeds content later

**Proposal, ideas only.** Each grows a seed already in the compendium:

- **Settler visitors (NPCs):** a settler's best creature, by its nickname, sits at the bonfire some evenings or posts a job. "Pebbles the Mossling is resting here. It belonged to Marta, one of the first settlers."
- **Rare finds:** a keepsake on a trip, a once-only catch. "An old Ashmole answers to Ember. Its ribbons are faded." It is a fresh creature of that species and nickname, not the old one.
- **The fen keeps old things** (compendium thread T11, the Ancient vault, and motif 14 "Keeping"): a stone of the first settlers where their feats are carved.

Settlers can turn up on any server (section 2). A returning settler's pioneer tag and house decoration wait for players to get an identity in the game.

## 7. Valley's half

Kept for the valley session (owner of `docs/design/valley/`): what the valley resets on its side, where settlers appear in the world, and its part of the notice.

## Open questions for Misa

1. The switch day and the notice text (sections 4 and 5), when phase 7 is close.
