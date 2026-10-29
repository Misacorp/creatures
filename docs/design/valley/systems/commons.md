# The commons: idling together for the whole server

Status: **proposed**; one shared valley with personal and shared progress taking turns as the limit is **accepted** (Misa, round 1, Q1). Evidence: `docs/research/idle-job-posts.md` ("Co-op idle in a small server"), `docs/research/idle-coop-raids.md`.

## The question

Misa: "Could players offer some of their own resources for the common good? Could they have creatures out performing tasks that benefit the entire server, not just themselves? Can the places where jobs are done on a server themselves be improved in a communal way, through a ton of common resources or the extremely rare find for specifically this purpose?"

## The idea: three ways to give, one valley to build

The valley's places belong to the whole server. Each place has a **server level**, raised by **projects** the server works on together. Players give in three ways, all optional:

1. **Resources.** Each place has a project board (a crate, a scaffold, a donation bowl, drawn in the scene) where a player drops scrap, parts, Bait, supplies. Bait (to be renamed) is the everyday currency both for a player's own posts (lures, tools) and for the server's projects, so every spend is a choice between "my valley" and "our valley" (round 3, Q9). Common resources in large amounts: no one player finishes a project alone in a normal week.
2. **Creatures.** Some posts are **communal posts**: seats any player's creature can take, whose output goes to the server, not the player (road menders at the Signpost, haulers at the Forge's project, sentries at the Watchtower, a lamplighter at the bonfire). The creature still earns its own XP there.
3. **Keystones.** Rare finds made for a purpose: a Stormglass from Storm Ridge for the Watchtower's beacon, an Ancient Root from Verdant Hollow for the School's tree. A scout turns one up only now and then. Delivering a keystone completes a project's special step at once, or opens a branch the common route cannot.

## Rules (draft)

- **V-COM-1** Every player on the server benefits from a place's level, whether or not they gave (no free-rider punishment, F-6). Levels add seats, recipes, better odds, and a visible change to the building (a second anvil, a taller tower, banners).
- **V-COM-2** Giving is recognised, never ranked: the place keeps a plaque of who helped build each level (names in order of their first gift), and the return story says "Sam and 3 others raised the Forge to level 3". No leaderboard of amounts.
- **V-COM-3** Giving has a small personal thank-you so it never feels like a pure loss: example, a share of a project's completion reward to everyone who gave anything, the same for all.
- **V-COM-4** Projects never fail, never decay and have no deadline (F-1). A finished level is kept for good.
- **V-COM-5** Project size scales with the server's active players, counted as those who visited in the last 7 days, so members who drifted away never hold a project back (a 5-player server and a 15-player server finish at a similar pace), and gifts always count in full (Misa, round 2, Q4: "there's no need to obfuscate it behind diminishing returns"). A lone player can finish a project; it just takes them about as many times longer as there are active players, so coordinating with friends is the fast way. The scene shows who is building it and what it still needs, to invite that coordination. The economy lab reports the top giver's share of each project. A project's size is fixed when it opens, so a bar never slides back when players join (progress never goes down), and size grows more slowly than the player count, so a lone player's "slowly" is weeks, not months (a target for the lab). Only the next level's project is open at a time, so a big hoard raises one level, not several.
- **V-COM-6** The scene shows progress: scaffolding rises as resources come in; creatures on communal posts are seen working; a delivered keystone sits in its place for good.
- **V-COM-7** A newcomer joins a valley already built up and benefits from day one; the next project is open to them at once (F-7).
- **V-COM-8** Server state is one row per project and one per player per project, updated on a gift (F-9); communal posts' output is computed lazily like any post.
- **V-COM-10** Personal and shared progress take turns being the limit (round 1, Q1). A place's server level sets a per-player limit (anvils, scout seats, School seats); each player unlocks their own up to it with their own resources. On a new server the two alternate: a player outgrows the place, the server raises it, then the player's own resources are the limit again. Misa: "This hopefully motivates the player to push for the shared forge building upgrade."
- **V-COM-9** Optional, opt-in weekly goals (Hay Day's Derby without its leaderboard): a festival project with a cosmetic for everyone who took part, never a penalty for those who did not.

## Examples (to test in the economy lab)

| Place      | Level up gives everyone                           | Common route                               | Keystone                                    |
| ---------- | ------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| Forge      | a third anvil; a recipe tier                      | scrap, parts, haulers on its communal post | a Heartcoal from the Ember Caves            |
| Signpost   | a new road (a destination seat), rarer finds      | Bait, supplies, road menders               | a Wayfinder's stone from the Old Crossroads |
| Watchtower | readiness for the first stage; the beacon's reach | parts, sentries                            | a Stormglass from Storm Ridge               |
| School     | a second teacher seat; visitors from further away | pages, Essence                             | an Ancient Root from Verdant Hollow         |
| Bonfire    | faster catch-up for everyone's bench              | Bait, a lamplighter                        | an Ember of the first fire                  |

## Questions for the economy lab

- How fast does a typical server of 5, 8 and 15 players level each place over 12 weeks (T-3)?
- What share of a player's resources goes to the commons if they give "when it feels right", and does it starve their own Forge (T-4)?
- How often does a keystone turn up per server, so it feels special but arrives within a few weeks?

## Open questions (also in `../questions.md`)

- Should places have a max level, after which projects become cosmetic (the endgame link to `later.md`)?
