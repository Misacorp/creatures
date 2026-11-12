# Player housing: what players love elsewhere, ranked for the valley

Status: **research** (2026-11-09), asked by Misa: "Research MMOs and other established games where players really enjoy the housing system and how they can interact with it. What aspects are good fits for our game? What aren't? Rank them." Nothing here is decided or built. Housing itself stays parked in `docs/design/valley/systems/later.md` until Misa picks it up; the valley part (homes on the map) is out of scope here.

The mockups and diagrams are in the Claude artifact "Valley Homes" (Misa has the link). They are drawn from sprites the game already has: the living room's props, the creatures, the raid bosses and the valley's house.

## How well each claim is sourced

Four research passes. **Read** means a wiki, developer post or article was opened; **summary** means search results only. Player quotes are single voices. No game publishes how much its housing is used.

## What the games do

| Game                        | Sourced | Players like                                                                                                                                        | Players complain about                                                           |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| World of Warcraft, Midnight | read    | No lottery, no rent. Decor from quests, dungeons, raids and achievements. Endeavors: one shared task bar per neighbourhood, sized to its head count | "No utility", empty neighbourhoods, shop prices                                  |
| Final Fantasy XIV           | read    | A message book and likes from visitors, gardens, a stable, player-run venues                                                                        | Too few plots, a lottery, demolition after 30 days away                          |
| Old School RuneScape        | read    | Rooms that do something (a pool, an altar, teleports), mounted heads, a skill hall, house parties                                                   | Parties need the owner online                                                    |
| WildStar                    | read    | Plots with gardens and mines; neighbours tend your harvest while you are away; rested XP for logging out at home                                    | Plugs needed repair every 7 days (secondary source)                              |
| Lord of the Rings Online    | read    | Houses that feel like homes; trophies as a record of deeds and catches                                                                              | Too few decoration hooks ("a well-spaced museum"); upkeep emptied neighbourhoods |
| New World                   | read    | Up to five trophies that give gathering, crafting and combat buffs                                                                                  | Houses bought "for buffs"; the weekly tax feels like "utility bills"             |
| Guild Wars 2 homestead      | read    | Your other characters and mounts stand around the place; one gather a day, also at a friend's; decor recipes from achievements                      | Private and instanced; "exhausted in a minute"; nodes "never pay off"            |
| Elder Scrolls Online        | summary | Builder creativity, target dummies, Home Tours with a recommend button                                                                              | Furnishing caps                                                                  |
| EverQuest II                | summary | Rated and published houses; quest and event items as furniture                                                                                      | Weekly upkeep; trophies compete with design for item slots                       |
| Neko Atsume                 | summary | Items in a few fixed spots, close the app, see which cats came; rare cats want certain items                                                        | A guide is needed to learn who wants what                                        |
| Blue Archive, Genshin       | summary | Characters appear in your room; furniture raises a comfort score that pays passive income                                                           | Decorating becomes filling a number; clutter wins; paid furniture                |
| Animal Crossing             | summary | A loan with no interest and no deadline; a catalogue to complete                                                                                    | The Happy Home rating pushes one right answer; visits need the owner online      |
| Pokémon Secret Bases        | read    | Visit a saved copy of a friend's base while they are offline; one flag a day per base; fans still ask for it back                                   | An item cap, one base at a time                                                  |
| Stardew Valley              | read    | Each farmhouse upgrade adds a new thing (kitchen, nursery, cellar); a cabin per co-op player                                                        | none sourced                                                                     |
| Terraria, Viva Piñata       | read    | Creatures and townsfolk arrive when the conditions are right                                                                                        | Terraria's happiness changes prices, so some read it as a chore                  |
| Pokémon Sleep, Travel Frog  | read    | The morning reveal: who came, what was brought back                                                                                                 | Sleep's routine can feel like busywork                                           |
| Monster Hunter              | read    | A room for captured creatures that friends can visit; players miss it in Wilds                                                                      | none sourced                                                                     |

Three patterns repeat. Homes are loved when they record what you did and when something of yours lives in them. They are resented when they charge rent, run out, or turn decorating into a score. Features that need an audience (ratings, tours, parties) go quiet without a crowd.

## The ranking (the lead's judgement, for Misa to challenge)

Ranked by fit to a 5 to 15 player valley with an idle week and a Sunday raid, and checked against the valley's filters (`docs/design/valley/goals.md`, F-1 to F-11).

### Build first

1. **Trophies and keepsakes arrive by themselves.** A raid boss you beat hangs on the wall, by rank; fair medals, ribbons, the commons' keepsakes (V-COM-3 already says "for their house") and "I was there" mementos (G-0) land on a bench. Seen in OSRS, LOTRO, WoW.
2. **Your creatures live there.** Shown at home with no new art. Seen in Guild Wars 2, Blue Archive, Monster Hunter.
3. **A side-on cutaway with fixed spots.** Furniture is the long sink G-7 asks for. Fixed spots keep rooms tidy, state tiny and phones usable; give each room enough spots (LOTRO's complaint). The living room's 26 props are a starter set.
4. **Visit any time, leave a gift, stamp the book.** Misa's idea (round 6, Q16). Works with the owner offline, like Secret Bases. Stamps, not typed notes.
5. **The house grows in steps, at the player's pace.** Hut, cottage, house; each step adds a room and one new thing, with no deadline (Animal Crossing's loan, Stardew's upgrades).

### Build next

6. **Porch visitors.** Porch items draw wild creatures while the player is away; each leaves a small find; a silhouette shows who could come. It is the Gazette's "one surprise". Worked out on open from timestamps (F-9).
7. **Furniture is made, not bought.** A carpenter post at the Forge, exotic wood from scouts (Misa's example in `scrap-uses.md`), blueprints from the weekly visitor (V-VIS-5).
8. **Sets and a catalogue.** Finishing a set gives a keepsake, never a bonus.
9. **A street project.** A shared goal for the homes, sized to the server (WoW's Endeavors). Belongs with the homes on the map.

### Only with a twist

10. **Useful things at home:** personal ones only (Journal, Stats, a wardrobe). Work stays in the valley's places.
11. **A garden plot:** as a post, with no watering and nothing that wilts.
12. **A rested bonus:** flat, the same in every house; it competes with the bonfire, so the lead would leave it out.

### Leave out

13. **A comfort score that pays income.** The best room becomes the fullest room.
14. **Trophy buffs.** Players then own a house for the buff.
15. **Rent, upkeep, decay.** The most disliked rule in every game that has it; fails F-1.
16. **Ratings, contests, leaderboards.** Ranks friends (F-6) and needs an audience.
17. **Free placement or an isometric room.** High art and state cost, fiddly on a phone, built for long sessions.

## A first slice that avoids "a ton of new systems and art"

1. **A house that fills itself:** the cutaway with the living room's furniture in set places, the player's creatures at home, trophies, medals and keepsakes arriving by themselves, read-only visits. New art: a roof and walls, a plaque, a mailbox, about eight keepsake icons. No new currency, no editor.
2. **Make it yours:** decorate mode, wall and roof colours, house steps, the carpenter and furniture blueprints, the mailbox and stamps.
3. **The porch:** porch items and visitors, sets and a catalogue, a garden post. Then the row of homes on the map.

Database reads: a house is one row plus its spots (about 20 rows), read only when someone opens it; nothing runs on a timer.

## Open for Misa

1. Who is at home: everyone asleep at night and the unposted by day (the lead's pick), a few chosen housemates, or nobody?
2. Does the house ever give power? The lead's pick: never.
3. Stamps only in the guestbook (the lead's pick), or short notes too?
4. Is slice 1 the right first build?

## Sources

- WoW: <https://eu.forums.blizzard.com/en/wow/t/customer-support-player-housing-faq/597484>, <https://warcraft.wiki.gg/wiki/Endeavors>, <https://mein-mmo.de/en/housing-in-wow-does-anyone-still-play-this,1572784/>
- FFXIV: <https://ffxiv.consolegameswiki.com/wiki/Player_Housing>, <https://gamesradar.com/its-been-nine-years-and-everyone-still-hates-final-fantasy-14s-housing-lottery>
- OSRS: <https://oldschool.runescape.wiki/w/Player-owned_house>, <https://oldschool.runescape.wiki/w/House_party>
- WildStar: <https://www.tentonhammer.com/articles/wildstar-player-housing-preview-from-pax-east-2013>, <https://www.engadget.com/2013-10-28-the-nexus-telegraph-why-does-wildstars-housing-matters.html>
- LOTRO: <https://www.engadget.com/2010-04-16-the-road-to-mordor-homeless-in-middle-earth.html>
- New World: <https://www.newworld.com/en-us/news/articles/making-your-mark-on-aeternum-player-housing>, <https://steamcommunity.com/app/1063730/discussions/0/3042733612674310189>
- Guild Wars 2: <https://wiki.guildwars2.com/wiki/Homestead>, <https://www.gamedeveloper.com/design/guild-wars-2-s-player-housing-pushes-decorating-over-land-grabs>
- EverQuest II: <https://www.engadget.com/2012-01-07-the-tattered-notebook-the-problem-with-leaderboards.html>
- Neko Atsume: <https://nekoatsume.fandom.com/wiki/Goodies>
- Blue Archive, Genshin: <https://gamingonphone.com/guides/blue-archive-the-complete-cafe-levelling-guide-and-tips>, <https://keqingmains.com/misc/teapot/>
- Animal Crossing: <https://www.dbltap.com/posts/animal-crossing-new-horizons-happy-home-academy-how-does-it-work-01e4ke5sjpqn>
- Pokémon Secret Bases: <https://www.gamerguides.com/pokemon-omega-ruby-alpha-sapphire/guide/extra-activities/super-secret-bases>
- Stardew Valley: <https://stardewvalleywiki.com/Farmhouse>
- Terraria: <https://terraria.wiki.gg/wiki/Happiness>
- Travel Frog, Pokémon Sleep: <https://en.wikipedia.org/wiki/Travel_Frog>, <https://www.nintendolife.com/reviews/mobile/pokemon-sleep>
- Monster Hunter: <https://www.gfinityesports.com/article/monster-hunter-wilds-players-want-house-to-store-endemic-life>
