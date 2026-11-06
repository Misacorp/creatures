# The reset (combat v2 phase 6, valley phase 6)

Status: **draft, 2026-11-06.** Nothing here is shipped or built. Everything marked **Proposal** waits for Misa. The combat half is written here; the valley session adds its half in the section kept for it.

## What is decided

- Combat v2 and the valley rework go live together with **one reset**. Nothing is migrated: no Boss Rank, gear, talents or creatures carry over (`pnpm decisions show 2026-10-31-after-the-combat-and-valley-reworks`, `pnpm decisions show 2026-11-06-combat-v2-goes-live-with-the`).
- Before the wipe, each player's creatures, their names and some feats are recorded. Today's players become lore: **the first settlers**. The record is fuel for later content (NPCs, rare finds).
- Misa's brief (2026-11-06): "we wipe everything and leave no trace, but before we do, we record each player's creatures and their names, and find some feats to tie them to."

## 1. The settlers' record: what is kept

**Proposal.** One record per server. It holds only what the game already stores today (inventory from the worker's migrations, 2026-11-06).

**Per settler:**

- The name they had in the game (Discord display name, as stored, at most 32 characters) and the day they first played.
- **Every creature:** species (its current form), line, level, shiny, nickname, how it came (starter, trip, Festival), the day it was caught, its quirk, ribbons, fusions.
- **Feats**, each with a date where one is stored (see the list below).

**Per server:** its best Boss Rank, the bosses it beat, and the server's firsts.

### Feats we can read

| Feat (working name) | From                                                                 | Example                                   |
| ------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| First on the server | `server_firsts`: first catch, evolve, jackpot, Festival of a species | "First to find a Lanternfin, 2026-10-12"  |
| Oldest companion    | earliest `caught_at` that is not the starter                         | "Pebbles the Mossling, caught 2026-09-28" |
| Highest level       | creature level                                                       | "Raised Ashmole to level 31"              |
| Shiny finder        | shiny flag                                                           | "Found 2 shinies"                         |
| Boss slayer         | raid week summaries: per-player damage, kills                        | "Top damage the week Old Bogback fell"    |
| Deep diver          | `dungeon_progress`: best depth, longest streak, clears               | "Reached depth 18; 21 days in a row"      |
| Valley Games        | lifetime medals, best score per event, badges                        | "4 gold medals; record in the Pond Dash"  |
| Explorer            | trips, places visited first, journal pages found                     | "First to reach Storm Ridge"              |
| Maker               | gear with their maker's mark                                         | "Made 40 pieces in the Workshop"          |
| Leet regular        | days with a leet payout in the game's ledger                         | "Brought leet on 37 days"                 |

### What is already lost (we can't promise these)

- **Finale moments and fight replays** of any week before the last one: old raid logs are blanked; only each week's summary (damage, contribution, kill) stays.
- **Day-by-day Valley Games placings**: only lifetime medals, records and badges stay.
- **Evolution dates** and creatures a player released or fused away.
- **Avatars and server nicknames**: never stored.

## 2. Who can see the record, and which IDs it keeps

The repository is **public**, so the record never goes into it.

**Technical call (recorded as a decision):**

- The record lives in production only, in one archive object on the Worker (a Durable Object of its own), written by each server just before its wipe. No file, no workflow artifact, no repo copy.
- It keeps **no Discord user IDs and no server IDs**. Each settler gets a random settler id; each server a random archive key.
- Player-typed text (nicknames, notes) stays untrusted: it is stored as it was cleaned at entry, and shown only as text. Private creature notes are **not** recorded.
- Lore that we write by hand from the record (an NPC named after a settler) enters the repo only after Misa approves the names.

**Depends on question 3:** if a returning player should be recognised as a settler ("You were here first"), the record also keeps a keyed hash of their Discord ID (HMAC with a Worker secret), never the ID itself. Without that, nobody can be linked back to a record and it is "no trace" in the strict sense.

## 3. What is wiped

Everything else, on every server: creatures, talents, Talent Books, gear, materials, Bait and Essence balances and the ledger, Boss Rank and raid history, dungeon, Games, trips, journal, lounge, DMs and sessions. Each server's object deletes its whole store and runs the migrations from zero.

- **Leet stays where it is.** The leet bot's own ledger is never touched (we only read it). **Technical call:** after the wipe, leet payouts start from the switch day. Today a fresh server backfills 7 days of leet (`LEET_BACKFILL_DAYS`); the reset must not pay those days twice.
- **Analytics** keep their hashed daily counts (no names), so we can compare before and after.
- Stored v1 fights go with the wipe, so the "old fights still replay" question is moot.

## 4. When the switch goes on

**Proposal:**

1. Phase 7 (a real raid weekend on staging with Misa and testers) passes, valley included.
2. Misa picks the day. A Discord post a week before tells players the date (question 2 decides if they see their record first).
3. One release turns on combat v2 and the valley and carries the reset. Each server resets the first time it wakes on the new build: write the record, confirm it is stored, then wipe. If the record fails, the server does not wipe and stays closed with a "back soon" card, so nothing is lost by accident.
4. A Monday, so the first week starts clean (raid preparation, a full week to the first boss).

## 5. The one-time notice

**Proposal.** A card on first open after the reset, like the level reset's card, and one Discord post. Draft text (tone per the compendium):

> **A new valley**
> The old valley has gone quiet. The first settlers are remembered, and their creatures with them. Pick a starter and find your way.

## 6. How the record feeds content later

**Proposal, ideas only.** Each grows a seed already in the compendium:

- **Settler visitors (NPCs):** a settler's best creature, by its nickname, sits at the bonfire some evenings or posts a job. "Pebbles the Mossling is resting here. It belonged to Marta, one of the first settlers."
- **Rare finds:** a keepsake on a trip, a once-only catch. "An old Ashmole answers to Ember. Its ribbons are faded." It is a fresh creature of that species and nickname, not the old one.
- **The fen keeps old things** (compendium thread T11, the Ancient vault, and motif 14 "Keeping"): a stone of the first settlers where their feats are carved.

Content made from the record stays on the settler's own server unless Misa decides otherwise (question 1): a nickname typed for friends is not shown to strangers.

## 7. Valley's half

Kept for the valley session (owner of `docs/design/valley/`): what the valley resets on its side, where settlers appear in the world, and its part of the notice.

## Open questions for Misa

1. What counts as a feat, and where do settlers show up later (own server only, or every server)?
2. Do players see their record before the wipe (a "Your settler's record" card the last week), or is it a surprise?
3. Should a returning player be recognised as a settler (needs a hashed ID kept), or is the record anonymous?
