# Goals and filters

Status of each entry: **proposed** (the lead wrote it from Misa's words; Misa has not confirmed it as written) or **accepted** (Misa confirmed). Only Misa accepts.

## What we want to achieve

- **G-0, be brave** (accepted, Misa 2026-10-29). Nothing in today's game is kept because it exists. Every feature, system and design choice is judged on whether it makes a better, more enjoyable game that matches the vision; what does not is reworked or scrapped. Players who lose something they earned keep an "I was there" memento. The lead challenges Misa's own principles and answers when they contradict his goals, the research or the numbers ([`deciding.md`](deciding.md)).
- **G-1, the world is the game** (accepted in spirit, 2026-10-29: Misa picked the valley). The game feels like a game, not a web form: a valley you walk around, places that are buildings, activities that happen inside scenes. Phone first, desktop uses the whole window.
- **G-2, collecting them all is a boon** (proposed, Misa 2026-10-29). Every creature a player owns can grow at a steady pace and be viable, so raids and dungeons are played with a variety of creatures, not the top three. More creatures means more options, never more chores.
- **G-3, idling is meaningful, rewarding and fun** (accepted, round 1: Q2 and Q3). Creatures work at posts on their own, all the time, with no timers to come back for. Coming back is the reward: a short story of what happened, one surprise, one real choice. A daily visit gets everything; growth slows in steps the longer a player is away, to near zero after about a month, so a returning player still recognises their game. Being away never takes away what a player already has.
- **G-4, the server idles together** (accepted, round 1: Q1). One valley for the whole server: its places belong to the server, and each player's house is their own space. Players put their resources and creatures to work for the common good, and the places grow when everyone builds them up, through many shared resources or a rare find made for the purpose. Personal and shared progress take turns being the limit: a player outgrows a place, the server raises it, then the player's own progress is the limit again.
- **G-5, the raid is defending the valley** (accepted, Misa 2026-10-29; `decisions.md`). A dangerous trial, framed and drawn as one, with a battleground per boss element. It is proactive defence: the creatures go out to meet each threat in a far away place before it reaches the valley (round 5, Q14).
- **G-6, base systems first, content on top** (proposed, Misa 2026-10-29). Plan about a dozen weeks of a player's life in detail; more places, posts and content are added later on systems that are right.
- **G-7, the endgame is cosmetic and personal** (accepted in part, round 4, Q12: places stop at a max level and later projects are cosmetic; the rest is an idea, Misa 2026-10-29). Cosmetics, player housing and decorations are the long-term sink; gardening, fishing and stargazing are possible future posts or pastimes.

## Filters every idea must pass

From Misa's standing priorities (`docs/design/review-brief.md`) and the research (`docs/research/idle-job-posts.md`). A proposal that fails one goes to Misa as a choice, never in quietly.

- **F-1, no babysitting.** No must-check timers, nothing expires, absence never takes away what a player has. A full store pauses; it never wastes. Growth slowing during a long absence (G-3) is the one deliberate cost of being away, and it is a simple, visible scalar.
- **F-2, no upkeep on creatures.** No hunger, sanity, sickness or tiredness to manage.
- **F-3, show, don't tell.** State is drawn in the world (creatures at work, bubbles, a lagging post's reason in a few words). No hidden rules: a discovery puzzle shows its hint.
- **F-4, one control per creature.** A creature holds one post at a time; there is no priority grid or schedule to fill.
- **F-5, the fix is one tap.** When something stalls, the reason is visible and the fix is a single swap or claim.
- **F-6, co-op without guilt.** Helping is optional, pull-based and small to give; there are no quotas, streaks, "X hasn't helped" lines or kicks. Contributions are recognised, never ranked against each other.
- **F-7, fair to small and new players.** A newcomer can contribute and benefit on day one; help given to another player is capped by the receiver where it matters. Gifts to the server's projects are not capped (round 2, Q4); one level's project is open at a time, so a big giver cannot raise several levels at once.
- **F-8, the server is authoritative.** All output, RNG and progress are computed on the server; nothing a client claims is trusted; idle gains cannot be faked by keeping a tab open.
- **F-9, cheap to run.** Every timed or idle system is priced against the Durable Object read budget before it ships (`docs/design/database-reads.md`): idle output is computed lazily from timestamps on read, never by ticking per creature.
- **F-10, light, fun and predictable.** A player can say what will happen if they do nothing, and roughly what a choice will give.

## How we know it works (targets for the simulations)

Example numbers are placeholders until the economy lab sets them (marked as examples).

- **T-1, roster spread.** By week 4 of a typical player, the 10th creature is within a few levels of the 3rd (example: within 5), and by week 8 a player can field two different strong teams.
- **T-2, idle floor and active ceiling.** A once-a-day player gets the full idle rate (round 1, Q3); a twice-a-day player gains from choices, not from rate (example: under 10% more). A weekly player still brings a grown roster to the raid (example: about 40% of a daily player's idle growth). A player back after a month recognises their roster.
- **T-3, commons pacing.** A typical server of 8 players lifts its first communal place a level in the first two weeks, and the rare-find route matters without being required.
- **T-4, no dead chains.** In no simulated week does a typical player's Forge sit idle for want of scrap for more than a small share of the time.
- **T-5, choice stays real.** Even with the roster levelled, the best team differs across bosses (checked with combat v2's lab).
