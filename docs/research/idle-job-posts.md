# Job posts, roster-wide growth and making idling fun (research, 2026-10-29)

Why: Misa is planning an economy and "peaceful systems" overhaul (nothing decided). Goals in his words: let a player grow all their creatures at a steady pace so raids and dungeons can use more than the top three ("collecting them all" becomes a boon); creatures assigned to **job posts** where they work semi-passively, earn XP and focus on different things (expeditions that run constantly and turn up finds, a Workshop that crafts on a loop fed by expedition scrap, a **School** where a creature teaches talents and visiting teachers offer random ones); and the core question, "how do we make idling meaningful, rewarding and fun?". Three researcher passes (job-assignment systems; idle design and roster XP; teaching, visitors and co-op idle). Reddit and GDC Vault were mostly unreachable, so sentiment comes from Steam threads, press and guides. Confidence: confirmed (primary source read), secondary, unconfirmed. Earlier research this builds on: `collectors-idle-and-rewards.md` (AFK Arena caps, catch-up, dark patterns) and `idle-coop-raids.md` (Eric Guan's clocks, the Idle Champions "babysitting" quit). The valley map of this session (the "Valley Map" artifact) sketches posts per place.

## The short answer: fun by doing nothing

Across the sources, idling feels good when **three things happen on return**, and like a chore when any of them is missing:

1. **A story, not a sum.** Something happened while you were away, told as who, what and where: Neko Atsume's yard of visitors and gifts, Pokémon Sleep's morning report, Universal Paperclips' log (secondary; Pokémon Sleep's design intent confirmed). A wall of resource counters is the anti-pattern.
2. **One surprise.** A rare find, a visitor, a creature that learned something. Rarity makes it special (Animal Crossing's Redd, secondary).
3. **At most one real decision.** Who goes where next, which find to keep, which talent to learn. Not "tap to collect" (Victorian Idle's accept-or-discard, secondary; Guan: interaction shifts the curve, never gates it, confirmed).

And **absence never costs anything**: progress never goes down, claims never expire, a full store pauses instead of wasting (Pecorella GDC 2015, confirmed via Game Developer; Pokémon Sleep deliberately avoided rewarding "early bird" schedules, confirmed). Leet Creatures already chose "no babysitting" (systems review, 2026-10-16); the research supports keeping it as the frame for every post.

## Job posts in other games

| Game                          | Assigned to                                          | Liked                                                       | Disliked                                                                                                                      |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Palworld                      | Pals to stations by work suitability                 | industrial output, autonomy with an override                | pals ignore tasks with no reason shown, no priorities, hunger and sanity upkeep (Sportskeeda, GamesRadar, PalMods; secondary) |
| Fallout Shelter               | dwellers to rooms by one SPECIAL stat                | hover preview shows the efficiency change before you commit | checking that nobody is idle (guide; secondary)                                                                               |
| Ni no Kuni II                 | citizens to facilities, "suitable" ones produce more | a big roster that all matters is the best part (PC Gamer)   | fetch quests to recruit (Twinfinite)                                                                                          |
| Cult of the Lamb              | followers to farm, worship, craft                    | the management loop                                         | chores: droppings, beds, sickness (GeekCulture)                                                                               |
| Pokémon Sleep                 | helper team gathers berries                          | low effort                                                  | tired, sad helpers; stored ones did not recover (Automaton)                                                                   |
| Darkest Dungeon               | heroes to stress buildings                           | a clear sink for a clear problem                            | irrelevant with a big roster (Steam)                                                                                          |
| AFK Arena                     | idle chest, no assignment                            | generous, one or two check-ins a day                        | the 12 h cap is built to force two sessions a day (Game Developer, confirmed)                                                 |
| RimWorld, Oxygen Not Included | colonists via a 1 to 9 priority grid                 | granular control                                            | ignored tasks, cross-map thrash, late micromanagement (Steam, Klei forums)                                                    |
| Factory idle games            | workers in a chain                                   | fixing a bottleneck is satisfying (weak)                    | the chain starves when one link outpaces another (guide)                                                                      |

**Misa's worry, chained production** (expedition scrap feeding a looping Workshop, intervene only when a post lags). Players enjoy chains **only when the bottleneck is visible and fixed with one action**. They turn on them when a chain stalls silently, workers ignore posts, workers need upkeep, or every post has to be checked (Palworld, ONI, RimWorld; secondary). What makes it feel good: one visibly limiting post, a plain reason ("Forge: waiting for scrap"), a fix that is one tap (swap a worker), and a chain that keeps running when nothing is wrong. A stockpile hours deep and a small fallback trickle keep it from ever stopping dead.

## Growing the whole roster

- **Works:** shared XP where the active creature earns most and the bench catches up toward the middle (Scarlet and Violet's Exp. Share; Temtem's XP Share for lower levels; Octopath II's flat rewards that lagging characters recover from fast; secondary).
- **Resented both ways:** zero bench XP (Octopath II reviews) and flat, forced XP that over-levels everything and removes choice (Sword and Shield; GamesRadar, The Gamer). A pure split leaves a big bench behind (Monster Crown, Steam). Monster Sanctuary on its hardest setting makes 80% of monsters unusable because few strategies earn XP (Steam).
- **Why the risk is lower here:** the Exp. Share complaint is about levelling trivialising the challenge. Leet Creatures' challenge is the raid and the dungeon (combat v2 adds roles, Knacks and boss-specific answers), not levelling, so a steady floor for everyone does not flatten difficulty, as long as **choice is decided by role, Knacks, element and fit, not by level alone**.

## The School and visiting teachers

- **Teaching:** players like choosing what is taught, a preview before committing, and a visible goal (Dragon Quest Monsters Joker 3's previewed synthesis, Monster Hunter Stories 2's gene grid; secondary). They dislike random inheritance that takes dozens of tries (Palworld breeding, about 130 breeds for one target, Steam), a donor destroyed or a student reset to level 1 (MHS2, DQM J3), hidden recipes, and mandatory weekly lesson planning (Fire Emblem: Three Houses, "a dull, necessary part", Game Informer).
- **Visitors with random offers:** liked are a guaranteed cadence with surprise only in the offer, catch-up weighting for what you missed (Animal Crossing), offers you can influence (Pokémon Sleep), and rare visitors that feel special. Disliked are short windows that force checking (Stardew's travelling cart, inferred), paying to reroll into junk (Balatro, Steam), and visitors so frequent they are dull.

## Co-op idle in a small server

- **Liked:** cheap help that is useful to the receiver, with a small gain for the helper; opt-in weekly goals (Hay Day's Derby, minus its gates and leaderboard); help capped by the receiver's level so a veteran cannot dwarf a newcomer (Clash of Clans' 2021 donation change, confirmed).
- **Disliked:** daily quotas and kicks for inactivity (guild check-in fatigue); help that arrives wrong and costs the requester (Clash of Clans donations); caps that force ranking friends (Pokémon GO gifts, "gift grumps"); nagging requests.

## What this suggests for Leet Creatures

Proposals for the overhaul's design, to weigh with Misa and the combat branch; nothing here is decided.

1. **Posts are places in the valley, and you see creatures at work.** A creature has one post at a time; that is the whole control surface (no priority grid). Unlock posts through milestones the player already reaches, never fetch quests.
2. **Every creature on a post earns steady XP: a floor for the whole roster.** Low-level creatures get a catch-up multiplier that fades toward the roster's middle. Raid and dungeon still pay more, so using a creature still matters.
3. **Fit is visible before you commit.** One trait or element per post (not three), and dragging a creature onto a post previews its output change, Fallout Shelter style. Small differences between posts, so no post is a trap.
4. **No upkeep on workers.** No hunger, sanity, sickness or tiredness. If a limit is needed, it is a cap on gain, shown in advance.
5. **Chains buffer and never starve.** The Forge keeps a scrap stockpile hours deep; when it runs low, output slows and the post says why in plain words ("waiting for scrap"); a small trickle keeps it alive. The fix is one swap.
6. **The return moment is the game.** Opening the valley shows a short "while you were away" story: one line per notable event ("Mossback found a pearl at the Tidepools", "Pip taught Sprout Thick Hide"), routine output grouped, one surprise highlighted, and one or two real decisions. Claims never expire; a full store pauses, nothing is lost.
7. **Expeditions as standing posts.** A scout roams one destination and its finds arrive over time as a log, rare finds as story lines. The place's own residents and journal pages turn up there, so where a scout stands is a choice.
8. **The School: chosen and previewed, never random inheritance.** The teacher has a fixed set of talents and is not used up; the student shows "learns X in N hours" before you commit and is not reset. Teaching is a use for spare and duplicate creatures, which makes collecting a boon. Fits the talent rework on `combat-v2-bosses`.
9. **Visiting teachers on a fixed, visible rhythm.** "A teacher arrives Thursday", with the offer shown ahead and kept until claimed. Weight offers toward what the player lacks, keep rare teachers rare, and let a player lean the offer (who stands at the School) instead of paying to reroll.
10. **One discovery puzzle per place**, Neko Atsume style: a particular creature or item at a post attracts a rare visitor or find, with the hint shown in the UI (no hidden rules).
11. **Social, small and optional.** The valley shows who works where across the server; lending a teacher to a friend's creature or a "helped by Sam" bonus is pull-based, capped by the receiver, and gives the helper a little too. No quotas, streaks, "X hasn't helped" or gift caps. A shared, no-deadline goal (a School that grows with the valley's total teaching) fits the co-op spirit.
12. **Guard the trust.** Progress counters are server-authoritative and never reset; idle gains cannot be faked cheaply (Pokémon Sleep players faked sleep, NME); notifications stay opt-in.
13. **Prototype the return moment first.** Before building many posts, try the "while you were away" story with two posts (a scout and the Forge) on staging. If it reads like a story with a real choice, add posts; if it reads like a to-do list, rework it.

## Gaps

No usable sources were found for Monster Rancher, Slay the Spire and Hades shops, Idle Heroes, Pokétwo, Mudae, IdleMMO, Persona, Temtem's breeding or Pokémon egg moves, and for bench XP rules in Fire Emblem, Persona, Siralim, Dragon Quest Monsters and Cassette Beasts. A follow-up with direct Steam-review fetches would fill these.

## Sources

- Pecorella (GDC 2015) via Game Developer: https://www.gamedeveloper.com/design/the-rise-of-games-you-mostly-don-t-play
- Eric Guan, idle game design principles: https://ericguan.substack.com/p/idle-game-design-principles
- AFK Arena session design: https://www.gamedeveloper.com/design/flexible-time-session-design-in-afk-arena
- Pokémon Sleep: https://corporate.pokemon.co.jp/en/topics/detail/110.html, https://www.nme.com/news/pokemon-sleep-players-are-pretending-to-sleep-to-speedrun-rewards-3471106, https://automaton-media.com/en/news/20230915-21712/
- Palworld: https://sportskeeda.com/mmo/things-palworld-players-hate, https://gamesradar.com/palworld-players-are-begging-for-a-feature-every-colony-sim-should-have-the-ability-to-tell-your-pals-what-to-do, https://www.palmods.gg/blog/palworld-base-automation-fixes, https://steamcommunity.com/app/1623730/discussions/0/4343229179778898149
- Fallout Shelter: https://www.keengamer.com/articles/guides/how-to-play-fallout-shelter/
- Ni no Kuni II: https://pcgamer.com/ni-no-kuni-2-revenant-kingdom-review, https://twinfinite.net/ps4/things-about-ni-no-kuni-2-wish-known/2/
- Cult of the Lamb: https://geekculture.co/geek-review-cult-of-the-lamb/
- Spiritfarer: https://www.pushsquare.com/reviews/ps4/spiritfarer
- Darkest Dungeon: https://steamcommunity.com/app/262060/discussions/0/618459109263471065
- RimWorld and ONI: https://steamcommunity.com/app/457140/discussions/0/5051317596394504333, https://forums.kleientertainment.com/forums/topic/79562-first-100-hours-of-oxygen-not-included-feedback/
- Melvor Idle: https://steamcommunity.com/app/1267910/discussions/0/3199243752768164004
- Exp. Share and bench XP: https://www.thegamer.com/pokemon-sword-shield-exp-share-on/, https://gamesradar.com/you-cant-turn-the-exp-share-off-in-pokemon-brilliant-diamond-and-shining-pearl, https://steamcommunity.com/app/830370/discussions/0/2792747686849405421, https://steamcommunity.com/app/814370/discussions/0/3133919455864280678, https://steamcommunity.com/app/1971650/discussions/0/3777994854961118157
- Teaching: https://www.nintendoworldreport.com/review/15036, https://windowscentral.com/monster-hunter-stories-2-rite-channeling-guide, https://gameinformer.com/2019/08/07/what-fire-emblem-three-houses-gets-right-and-wrong-about-teaching
- Visitors: https://strategywiki.org/wiki/Animal_Crossing:_New_Horizons/Special_Visitors, https://stardewvalleywiki.com/Traveling_Cart, https://steamcommunity.com/app/2379780/discussions/0/4308326918573108841, https://serebii.net/pokemonsleep/gameplay.shtml
- Co-op idle: https://clashofclans.com/blog/news/clan-castle-troop-donation-changes.html, https://support.supercell.com/hay-day/en/articles/about-the-derby.html, https://mein-mmo.de/en/players-in-pokemon-go-complain-about-gift-grumps-but-they-have-good-reasons,783708, https://game-wisdom.com/?p=24957
- Idle as labour: https://www.avclub.com/idle-threat-what-incremental-games-say-about-our-relationship-to-work, https://criticalvideogamestudies.com/?p=1923
- Offline accept or discard: https://alexdb.itch.io/victorian-idle/devlog/978450/110x-is-now-a-thing-
- Neko Atsume: https://swarthmorephoenix.com/2016/03/24/allison-hrabar-16-discusses-purrfectly-addicting-neko-atsume/
