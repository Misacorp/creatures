# Goals and filters

Status of each entry: **proposed** (the lead wrote it from Misa's words; Misa has not confirmed it as written) or **accepted** (Misa confirmed). Only Misa accepts.

## What we want to achieve

- **G-1, the world is the game** (accepted in spirit, 2026-10-29: Misa picked the valley). The game feels like a game, not a web form: a valley you walk around, places that are buildings, activities that happen inside scenes. Phone first, desktop uses the whole window.
- **G-2, collecting them all is a boon** (proposed, Misa 2026-10-29). Every creature a player owns can grow at a steady pace and be viable, so raids and dungeons are played with a variety of creatures, not the top three. More creatures means more options, never more chores.
- **G-3, idling is meaningful, rewarding and fun** (proposed, Misa 2026-10-29). Creatures work at posts on their own. Coming back is the reward: a short story of what happened, one surprise, one real choice. Being away never costs anything.
- **G-4, the server idles together** (proposed, Misa 2026-10-29). Players can put their resources and creatures to work for the common good, and the server's places grow when everyone builds them up, through many shared resources or a rare find made for the purpose.
- **G-5, the raid is defending the valley** (accepted, Misa 2026-10-29; `decisions.md`). A dangerous trial, framed and drawn as one, with a battleground per boss element.
- **G-6, base systems first, content on top** (proposed, Misa 2026-10-29). Plan about a dozen weeks of a player's life in detail; more places, posts and content are added later on systems that are right.
- **G-7, the endgame is cosmetic and personal** (idea, Misa 2026-10-29). Cosmetics, player housing and decorations are the long-term sink; gardening, fishing and stargazing are possible future posts or pastimes.

## Filters every idea must pass

From Misa's standing priorities (`docs/design/review-brief.md`) and the research (`docs/research/idle-job-posts.md`). A proposal that fails one goes to Misa as a choice, never in quietly.

- **F-1, no babysitting.** No must-check timers, nothing expires, absence never loses anything. A full store pauses; it never wastes.
- **F-2, no upkeep on creatures.** No hunger, sanity, sickness or tiredness to manage.
- **F-3, show, don't tell.** State is drawn in the world (creatures at work, bubbles, a lagging post's reason in a few words). No hidden rules: a discovery puzzle shows its hint.
- **F-4, one control per creature.** A creature holds one post at a time; there is no priority grid or schedule to fill.
- **F-5, the fix is one tap.** When something stalls, the reason is visible and the fix is a single swap or claim.
- **F-6, co-op without guilt.** Helping is optional, pull-based and small to give; there are no quotas, streaks, "X hasn't helped" lines or kicks. Contributions are recognised, never ranked against each other.
- **F-7, fair to small and new players.** A newcomer can contribute and benefit on day one; a veteran cannot dwarf others; help is capped by the receiver where it matters.
- **F-8, the server is authoritative.** All output, RNG and progress are computed on the server; nothing a client claims is trusted; idle gains cannot be faked by keeping a tab open.
- **F-9, cheap to run.** Every timed or idle system is priced against the Durable Object read budget before it ships (`docs/design/database-reads.md`): idle output is computed lazily from timestamps on read, never by ticking per creature.
- **F-10, light, fun and predictable.** A player can say what will happen if they do nothing, and roughly what a choice will give.

## How we know it works (targets for the simulations)

Example numbers are placeholders until the economy lab sets them (marked as examples).

- **T-1, roster spread.** By week 4 of a typical player, the 10th creature is within a few levels of the 3rd (example: within 5), and by week 8 a player can field two different strong teams.
- **T-2, idle floor and active ceiling.** A player who only checks in once a day reaches most of what a twice-a-day player reaches (example: 80% of the XP), and a weekly player is not locked out of the raid.
- **T-3, commons pacing.** A typical server of 8 players lifts its first communal place a level in the first two weeks, and the rare-find route matters without being required.
- **T-4, no dead chains.** In no simulated week does a typical player's Forge sit idle for want of scrap for more than a small share of the time.
- **T-5, choice stays real.** Even with the roster levelled, the best team differs across bosses (checked with combat v2's lab).
