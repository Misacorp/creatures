# Player housing: a house that grows, fills itself and is visited

Status: **spec, 2026-11-09** (the lead's build spec for tonight's parallel build; nothing is built yet). Research and ranking: `docs/research/player-housing.md`. Misa chose items 1 to 5, 7 and 8 of the ranking as one feature; porch visitors (item 6) wait behind a seam. Everything here is behind the `HOUSING` flag (on locally and on staging, off in production until Misa turns it on). Numbers marked **(pick)** are the lead's; they live in one place each (`HOUSING_RULES` in `packages/game/src/housing/rules.ts`, or the content file named) and are listed again in "Numbers" below.

Misa's words this spec answers: the house "grows visibly ... further than just adding more floors: mansions with wings, pools, decorative gardens"; scouts bring "varieties of exotic wood, gemstones, rare metals and all sorts of luxury things" that fuel housing alone; furniture comes in sets whose pieces look alike ("a player who wants an ancient stool might want an ancient cupboard as well") plus wild pieces; "the fun part is slowly collecting and crafting everything"; the house gives **no power, ever**; the guestbook is **stamps, not text**; the bonfire is never emptied and there is no reason to send a creature home over the bonfire; "no reason to aim for an MVP if we can already land the systems". Housing "scrapes" every other system: trips, scouts, the dungeon, the raid and its Festival, the Valley Games, the journal and the commons' keepsakes feed it; the weekly visitor, the carpenter, the porch and the settlers' record are seams.

## 1. What the player sees and does

- **A house of their own.** The first time a player opens the House they get a **hut**: one room, the **Hearth**, already furnished with the living room's furniture (the **Cosy** set: couch, table, chairs, fireplace, rug, bookshelf, clock ...). It is drawn side-on as a cutaway dollhouse, pixel art at an integer scale, on grass under the valley's sky.
- **It grows.** A plan of **parts**: the core grows hut, cottage, house (one to three floors); then the player chooses, in any order the prerequisites allow, a **cellar**, a **west wing** and an **east wing** (each with an upper floor of its own), and grounds: a **terrace**, a **decorative garden** and a **pool**. Each part is bought like Animal Crossing's loan: a price in Acorns (the `bait` currency), scrap, sometimes shards, and **luxury materials**; the player pays into it whenever and however much they like, there is no deadline and no interest, and the part is **built the moment it is fully paid**. The drawing changes at once: a wider roof, a second storey, wings with their own roofs, a hedge and a fountain, a pool with a lounger.
- **Rooms have fixed spots.** Each room has six to ten typed spots (a window, a wall, a small wall, the ceiling, a big floor place, two small floor places, a rug) plus a wallpaper and a floor. Tapping a room focuses it; tapping a spot shows the pieces that fit it. No free placement, no grid.
- **Furniture is made, not bought.** The **workbench** in the Hearth turns a known blueprint plus its materials, Acorns and scrap into the piece **at once** (no timer). Blueprints: the Cosy set and a few wild pieces are known from the start; set blueprints are rare finds from the places and fights each set belongs to; a few come from feats.
- **Sets.** Eight sets (nine since Quiet Verge, 2026-11-11) of nine look-alike pieces (bed, cupboard, table, shelf, stool, lamp, rug, frame, curtains), each tied to a place and its element (the **Ancient** set is Misa's example), plus twelve **wild** pieces in no set and twelve garden and pool pieces. Each set also has a wallpaper and a floor. **Finishing a set** (owning one of every piece) puts the set's **keepsake** in the trophy hall's cabinet and in the catalogue. It is never a bonus.
- **Luxury materials** (sixteen: woods, stones, metals, cloth) drop from the moments that already reward the player: a finished trip, a scout's pack coming home, the end of a dungeon run, the raid finale, a Games medal. They are used by housing alone. The House shows "+N" on a material that grew since the player last looked.
- **Displays fill themselves.** The Hearth's mantel holds the player's best raid plaque, or the empty outlined plaque of this week's boss. The **trophy hall** (the west wing's ground floor) holds a plaque per raid boss beaten (by best rank, with wins), the Games medals bench, the event-badge medallions, the Festival case, the commons' keepsakes, the completed journal sets as bound books, the dungeon depth marker and the set keepsakes. Nothing to place: they come from what the player already did.
- **Housemates.** A bed is a piece like any other; on a bed the player can put one creature. It is drawn asleep in its bed (a "z" over it) when it is not away on a trip, a job, a valley post or an open dungeon run; otherwise the bed is just made. At most **3 housemates** per house (pick), one bed per room. It earns nothing different from resting anywhere: it is a picture, not a post.
- **Visiting.** The House lists the server's houses (up to 15). Any of them opens read-only, owner online or not. A visitor may leave **one gift a day** (in all, not per house: pick) and **one stamp per house a day**. The gift is a small amount of Acorns the server creates (it costs the giver nothing) and waits in the owner's **mailbox** until they collect it with one tap; it never expires. The **guestbook** keeps the latest 30 stamps with who and when.
- **Stamps** are collectibles: one everyone has, the rest unlocked by feats (the journal's sets above all, the raid bosses, the dungeon, the Games, the house itself) and rare drops. A visitor's stamp picker shows only stamps they hold.
- **The catalogue** lists everything that exists (pieces by set, materials, skins, stamps, parts) with owned and placed counts and where each comes from; unknown things are silhouettes with a one-line hint.
- **No power, ever.** Nothing in the house changes a fight, a trip, a job, a price or an experience rate anywhere. There is no comfort score, no rent, no decay, no ranking of houses.

### Where the House is

- **Page-based game (shipped):** a new place, **House**, in the Collection group of the dock and rail (after Stats), behind the flag.
- **Valley shell (`VALLEY` on):** the map's House place keeps its two rows (Journal, Stats) and its keepsakes, and gets a third row, **Your house**, which opens the same page. Player homes on the map (`valley/systems/later.md`) come later and will open the same page.

## 2. Data model (packages/game)

All housing content is schema-validated data (valibot `strictObject`, plain-text names like the other content), loaded once at module load. Adding a set later is entries in `pieces.json` and `sets.json` plus one sprite file; adding a part, a room kind, a stamp or a display kind is data plus, for a display kind, one provider (section 3).

### 2.1 Content shapes

```ts
// packages/game/src/housing/schema.ts (package A)
type Element = 'tide' | 'ember' | 'grove' | 'spark' | 'mire'; // the shipped ElementSchema
type MaterialFamily = 'wood' | 'stone' | 'metal' | 'cloth';
type SpotType =
  | 'window'
  | 'wall-large'
  | 'wall-small'
  | 'ceiling'
  | 'floor-large'
  | 'floor-small'
  | 'rug'
  | 'display'
  | 'yard-large'
  | 'yard-small'
  | 'fence'
  | 'poolside'
  | 'water'
  | 'porch'; // reserved for the porch part (seam): no room uses it yet
type DisplayKind =
  | 'raid-plaques'
  | 'games-medals'
  | 'games-badges'
  | 'festival'
  | 'keepsakes'
  | 'journal'
  | 'dungeon'
  | 'set-keepsakes';
type MomentKind = 'trip' | 'scout' | 'dungeon' | 'raid' | 'games'; // drop moments (2.3)

/** What a piece of a form may be: its spot type and the biggest sprite it may have. */
interface FormDef {
  id: string; // 'bed', 'cupboard', 'stool', 'sofa', 'fountain', ...
  name: string; // 'Bed'
  spot: SpotType;
  box: { w: number; h: number }; // max sprite size in scene px (art must fit; a test checks)
  bed?: true; // a housemate can sleep on it
  size: 'small' | 'large'; // picks the default price (HOUSING_RULES.price)
}

/** A price line: what a part, a piece or a skin takes. */
type PriceLine =
  | { kind: 'bait'; amount: number } // Acorns
  | { kind: 'scrap'; amount: number }
  | { kind: 'shard'; element: Element; amount: number }
  | { kind: 'material'; id: string; amount: number }
  | { kind: 'family'; family: MaterialFamily; amount: number }; // any wood, any stone ...

interface SpotDef {
  id: string; // unique in the room kind: 'window', 'floor-a', 'mantel'
  type: SpotType;
  x: number; // left edge in room px; the piece is centred in [x, x + w)
  w: number; // the spot's width (<= the form box widths it accepts)
  y?: number; // wall, window and ceiling spots: top edge in room px; floor spots stand on the floor line
  display?: DisplayKind; // type 'display' only
  layout?: 'one' | 'row'; // display only: one item (the best) or the whole row
}

interface RoomKindDef {
  id: string; // 'hearth', 'kitchen', 'loft', 'study', 'attic', 'cellar', 'hall', 'gallery', 'conservatory', 'bath', 'guest', 'garden', 'terrace', 'pool'
  name: string;
  outdoor: boolean;
  cells: { w: 1 | 2 | 3; h: 1 }; // in room cells (2.4)
  spots: SpotDef[]; // 6..12
  fixtures: ('workbench' | 'mailbox')[]; // drawn, tappable, never placed
  wall: string;
  floor: string; // default skin ids (outdoor rooms: their ground skin ids)
}

interface PartDef {
  id: string; // 'hut', 'cottage', 'house', 'cellar', 'west-wing', 'west-upper', 'east-wing', 'east-upper', 'terrace', 'garden', 'pool'
  name: string;
  kind: 'core' | 'wing' | 'cellar' | 'grounds' | 'porch';
  requires: string[]; // part ids that must be built first
  rooms: { key: string; kind: string; col: number; floor: number }[]; // where its rooms sit (2.4); core steps add rooms, never move them
  price: PriceLine[]; // [] for the hut
  side?: 'west' | 'east'; // wings and grounds: which outer edge they attach to (2.4)
  unlocks: string[]; // skin and piece ids whose blueprints this part teaches (exterior skins)
  line: string; // one line of flavour for the build list
  order: number; // build-list order
}

interface MaterialDef {
  id: string; // also its id in resources.json (kind 'luxury'), which holds its name, plural and icon
  family: MaterialFamily;
  element: Element | null;
  rare: boolean; // drawn less often (HOUSING_RULES.drops.rareWeight)
  places: string[]; // destination ids it drops at (trips and scouts)
  fights: ('dungeon' | 'raid' | 'festival' | 'games')[]; // fight moments it drops from
  line: string; // flavour
  hint: string; // "Found at the Tidepools", for the catalogue
}

type SetMaterial = { material: string } | { family: MaterialFamily };

interface SetDef {
  id: string; // 'cosy', 'tidepool', ...
  name: string; // 'Tidepool'
  element: Element | null;
  tier: 0 | 1 | 2; // 0: the starter set (free, known); 2: dearer (HOUSING_RULES.price.tierBp)
  primary: SetMaterial | null; // null only for tier 0
  accent: SetMaterial | null;
  sources: { moments: MomentKind[]; places: string[]; bosses: string[] }; // where its blueprints drop
  keepsake: { name: string; line: string }; // shown in the cabinet when the set is complete
  theme: string; // one line for art and the compendium (not shown to players)
  line: string; // shown in the catalogue
}

interface PieceDef {
  id: string; // '<set>-<form>' for set pieces ('ancient-stool'); a plain id for wild ones
  name: string; // 'Ancient Stool'
  form: string;
  set: string | null; // null: a wild piece (or a garden piece)
  unlock:
    | { kind: 'starter' }
    | { kind: 'drop' }
    | { kind: 'feat'; stamp: string }
    | { kind: 'part'; part: string };
  sources?: { moments: MomentKind[]; places: string[]; bosses: string[] }; // wild pieces only (set pieces use the set's)
  price?: PriceLine[]; // override; absent = piecePrice(form, set) (2.2)
  line: string;
  hint: string; // shown under the silhouette while unknown
}

interface SkinDef {
  id: string;
  name: string;
  kind: 'wall' | 'floor' | 'roof' | 'walls' | 'ground';
  set: string | null;
  unlock: PieceDef['unlock'];
  price?: PriceLine[]; // absent = skinPrice(kind, set)
  hint: string;
}

type StampUnlock =
  | { kind: 'starter' }
  | { kind: 'journal-set'; set: string } // every page of a journal set found
  | { kind: 'stat'; stat: string; at: number } // account_stats counter >= at
  | { kind: 'raid-boss'; boss: string } // that raid boss beaten once
  | { kind: 'dungeon-depth'; at: number } // dungeon depth reached
  | { kind: 'games-medal'; medal: 'gold' | 'silver' | 'bronze'; at: number }
  | { kind: 'house-part'; part: string } // that part built
  | { kind: 'house-sets'; at: number } // this many sets finished
  | { kind: 'drop'; moments: MomentKind[] }; // rare drop only

interface StampDef {
  id: string;
  name: string;
  unlock: StampUnlock;
  line: string;
  hint: string;
}

interface HousingContent {
  forms: FormDef[];
  rooms: RoomKindDef[];
  parts: PartDef[];
  materials: MaterialDef[];
  sets: SetDef[];
  pieces: PieceDef[];
  skins: SkinDef[];
  stamps: StampDef[];
  starter: {
    roof: string;
    walls: string;
    layout: Record<string /* spot id of the hearth */, string /* piece id */>;
  };
}
```

`loadHousingContent(raw): HousingContent` (package A) validates each file and the cross references: unique ids across pieces and skins (one item id space); every piece's form exists and its set exists; every room kind's spot ids are unique and its spots fit inside its cells; every part's rooms name room kinds and no two parts claim the same `(col, floor)`; `requires` names parts and has no cycle; every material id has a `resources.json` entry of kind `luxury`; every stamp unlock names a real journal set, boss, part or stat; the starter layout places pieces that fit their spots. It throws an `Error` naming the first problem, like `loadGamesStall`.

### 2.2 Pure rules (package A)

All in `packages/game/src/housing/`, all pure, exported from `@creatures/game`:

- `HOUSING_RULES` (rules.ts): every scalar (section 9).
- `piecePrice(content, pieceId): PriceLine[]` and `skinPrice(content, skinId)`: the override, else the form's size price, scaled by the set's tier, with the set's primary and accent materials.
- `partRemaining(part, paid: PaidLines): PriceLine[]` and `applyPayment(part, paid, offer: HousePay, held: Holdings): { take: Taken; paid: PaidLines; complete: boolean }`: takes the smaller of what was offered, what is held and what is still owed, line by line. A `family` line is paid with materials of that family, the offer naming which ones (`offer.materials`). Never takes more than owed, never more than held. `complete` when nothing remains.
- `buildable(content, built: Set<string>): string[]`: parts not built whose `requires` are all built.
- `houseGrid(content, built: Set<string>): GridRoom[]`: every built room with its cell position, cutaway order and its outer side (2.4). Pure and tested; the client draws from it, the server validates room ids against it.
- `knownBlueprints(content, learned: Set<string>, built: Set<string>): Set<string>`: starters plus learned plus part unlocks.
- `canPlace(content, roomKind, spotId, pieceId): boolean`: the piece's form fits the spot type and width.
- `completeSets(content, owned: Map<string, number>): string[]` (every piece of the set owned at least once; tier 0 included).
- `rollHouseDrops(rng: Rng, content, moment: HousingMoment, known: { blueprints: Set<string>; stamps: Set<string> }): HouseDrop` (2.3).
- `stampsEarned(content, feats: HouseFeats): string[]`: the feat stamps whose unlock holds (never the `drop` ones).
- `HousingHook`, `HousingMoment` (hook.ts): the types the reward paths call (3.6).
- View schemas (view.ts): the strict response shapes of every endpoint (3.4), shared by the worker's tests and the client's parsers, as `packages/game/src/valley/view.ts` does for the valley.

```ts
type HousingMoment =
  | { kind: 'trip'; key: string; place: string; element: Element | null; ticks: number }
  | { kind: 'scout'; key: string; place: string; element: Element | null; finds: number }
  | { kind: 'dungeon'; key: string; depth: number; cleared: boolean }
  | {
      kind: 'raid';
      key: string;
      weekId: string;
      bossId: string;
      rank: number;
      cleared: boolean;
      festival: string | null;
    }
  | { kind: 'games'; key: string; medal: 'gold' | 'silver' | 'bronze' | null };

interface HousingHook {
  drop(userId: string, moment: HousingMoment): void;
}

interface HouseDrop {
  materials: Record<string, number>;
  blueprint: string | null;
  stamp: string | null;
}

interface HouseFeats {
  journalPages: ReadonlySet<string>; // entry ids found
  stats: Readonly<Record<string, number>>; // account_stats
  bossesBeaten: ReadonlySet<string>; // from house_trophies
  dungeonDepth: number;
  medals: { gold: number; silver: number; bronze: number; pins: number };
  built: ReadonlySet<string>;
  setsComplete: number;
}
```

### 2.3 Drops

One function decides what a moment brings: `rollHouseDrops`. The moment says where it happened; the content says what drops there (`materials[].places`, `materials[].fights`, the sets' and wild pieces' `sources`); `HOUSING_RULES.drops` says how often. Per moment:

| Moment                         | Rolls (pick)                             | Each roll                                                               | Blueprint (pick)              | Stamp (pick)  |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------- | ----------------------------- | ------------- |
| `trip` (a finished trip)       | 1 + ⌊ticks / 3⌋                          | 40%: one material of the place (rare ones at ¼ weight)                  | 3%                            | 1%            |
| `scout` (a pack comes home)    | 1 + finds (gear, blueprints, pages)      | 30%: one material of the place                                          | 2%                            | 1%            |
| `dungeon` (a run ends)         | 1 + ⌊depth / 5⌋, +1 if cleared           | 50%: one `dungeon` material                                             | 6% if cleared                 | 2% if cleared |
| `raid` (the finale is paid)    | cleared: 3; lost: 1                      | 100%: one material of the boss's element; cleared also 25% one Old Gold | 25% if cleared                | 5% if cleared |
| `raid` with a Festival species | as above, plus 2 Lantern Silk if cleared |                                                                         | Lantern Night pool if cleared |               |
| `games` (a medal is awarded)   | gold 1 at 100%, silver 60%, bronze 30%   | one `games` cloth                                                       | 5% on gold                    | 2% on gold    |

A blueprint drop picks, among blueprints the player does not know whose sources match the moment (moment kind, place, boss), one at random (sets' pieces and skins and wild pieces alike); none left means no blueprint. A stamp drop picks a `drop` stamp whose `moments` include this one and the player lacks. The draws use the hook's own live RNG (`crypto.getRandomValues`, a separate `housingRng` so no scripted RNG of another system is consumed in tests).

### 2.4 The house as cells (layout)

The cutaway is a grid of **room cells**, each 112×64 scene px (interior wall 112×52, a floor strip of 8, a 4 px slab; outer walls and the walls between rooms are 4 px). Columns count from the core's left (0); floors from the ground (0), the cellar is floor −1. `houseGrid` places rooms from the parts' data; grounds and wings attach to the outer edge on their `side`, so a terrace sits left of a west wing when there is one and left of the core when there is not.

| Part       | Rooms (kind, col, floor)                    | Drawn as                                                      |
| ---------- | ------------------------------------------- | ------------------------------------------------------------- |
| hut        | hearth (0, 0)                               | one room under a small gable roof, chimney, door, mailbox     |
| cottage    | kitchen (1, 0), loft (0, 1)                 | two rooms wide, a second storey on the left with a dormer     |
| house      | study (1, 1), attic (0..1, 2; 2 cells)      | three storeys, a full gable over both columns                 |
| cellar     | cellar (0..1, −1; 2 cells)                  | under the ground line, earth around it, a small vent window   |
| west wing  | hall (2 cells, floor 0), the trophy hall    | a lower wing on the west with its own hip roof                |
| west upper | gallery (2 cells, floor 1)                  | the wing rises a storey                                       |
| east wing  | conservatory (2 cells, floor 0)             | a glass-roofed wing on the east                               |
| east upper | bath (1 cell), guest (1 cell), floor 1      | the wing rises a storey                                       |
| terrace    | terrace (2 cells, outdoor, west edge)       | a stone deck with a rail                                      |
| garden     | garden (2 cells, outdoor, east edge)        | a lawn with a hedge line                                      |
| pool       | pool (2 cells, outdoor, east of the garden) | a tiled basin with water                                      |
| porch      | (seam: not in the content yet)              | a 1-cell outdoor part on the door side, spots of type `porch` |

A full house is 13 cells wide (about 1,460 scene px) and four storeys plus a cellar tall (about 330 scene px with roof and sky): it pans (section 5).

### 2.5 First content (package D enters it; names follow `docs/compendium/`)

**Forms** (the nine set forms, then the extras the starter, wild and garden pieces use):

| Form     | Spot        | Box (w×h) | Size  | Notes                       |
| -------- | ----------- | --------- | ----- | --------------------------- |
| bed      | floor-large | 48×26     | large | `bed`; a sleep anchor       |
| cupboard | floor-large | 30×36     | large |                             |
| table    | floor-large | 44×18     | large |                             |
| shelf    | wall-large  | 40×20     | large |                             |
| stool    | floor-small | 16×12     | small |                             |
| lamp     | ceiling     | 20×16     | small | may glow at night           |
| rug      | rug         | 56×10     | small |                             |
| frame    | wall-small  | 24×16     | small | a painting, a mirror        |
| curtains | window      | 36×26     | small | the window and its dressing |
| sofa     | floor-large | 64×36     | large | starter, wild               |
| hearth   | floor-large | 36×36     | large | the fireplace               |
| chair    | floor-small | 18×18     | small |                             |
| plant    | floor-small | 16×20     | small |                             |
| seat     | floor-small | 20×12     | small | pouf, beanbag, cushion      |
| clock    | wall-small  | 16×16     | small |                             |
| tall     | floor-large | 20×40     | large | tall clock, tank            |
| hanging  | ceiling     | 20×16     | small | chimes, mobiles             |
| yard-big | yard-large  | 40×40     | large | fountain, topiary, arbor    |
| yard-bit | yard-small  | 20×20     | small |                             |
| fence    | fence       | 16×12     | small | a repeating segment         |
| poolside | poolside    | 32×20     | small |                             |
| float    | water       | 24×10     | small |                             |

**Room kinds** (spots per room; x positions are package A's fixture and package D's data; the starter hearth layout is below):

| Room         | Cells | Spots                                                                                                                                                                                                   |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hearth       | 1     | window, wall-large, wall-small, ceiling, floor-large, floor-small ×2, rug, display `mantel` (raid-plaques, one) + the workbench fixture (9 spots)                                                       |
| kitchen      | 1     | window, wall-large, wall-small, ceiling, floor-large, floor-small ×2, rug (8)                                                                                                                           |
| loft         | 1     | window (round), wall-small, ceiling, floor-large ×2, floor-small, rug (7)                                                                                                                               |
| study        | 1     | window, wall-large, wall-small ×2, ceiling, floor-large, floor-small, rug (8)                                                                                                                           |
| attic        | 2     | window ×2 (dormers), wall-small ×2, ceiling ×2, floor-large ×2, floor-small ×2, rug (11; nothing under the slopes)                                                                                      |
| cellar       | 2     | wall-large ×2, wall-small, ceiling ×2, floor-large ×2, floor-small ×2, rug (10; no window)                                                                                                              |
| hall         | 2     | display: plaques (raid-plaques, row), bench (games-medals), badges (games-badges), case (festival), shelf (keepsakes), books (journal), marker (dungeon), cabinet (set-keepsakes); ceiling ×2, rug (11) |
| gallery      | 2     | wall-large ×3, wall-small ×2, ceiling ×2, floor-small ×2, rug (10)                                                                                                                                      |
| conservatory | 2     | window ×3, ceiling ×2, floor-large ×2, floor-small ×3, rug (11)                                                                                                                                         |
| bath         | 1     | window, wall-small, ceiling, floor-large, floor-small ×2, rug (7)                                                                                                                                       |
| guest        | 1     | window, wall-large, ceiling, floor-large, floor-small, rug, wall-small (7)                                                                                                                              |
| terrace      | 2     | yard-large, yard-small ×4, fence ×2, poolside (8)                                                                                                                                                       |
| garden       | 2     | yard-large ×2, yard-small ×4, fence ×2 (8)                                                                                                                                                              |
| pool         | 2     | water ×3, poolside ×3, yard-small, fence (8)                                                                                                                                                            |

**Parts** (prices in `parts.json`; all picks; Acorns are the `bait` currency):

| Part       | Requires      | Acorns | Scrap | Shards   | Luxury                                 |
| ---------- | ------------- | ------ | ----- | -------- | -------------------------------------- |
| hut        |               | 0      | 0     |          |                                        |
| cottage    | hut           | 75     | 400   |          | 6 any wood                             |
| house      | cottage       | 200    | 1,200 |          | 12 any wood, 6 any stone               |
| cellar     | cottage       | 125    | 800   | 10 Mire  | 6 any stone, 4 Bog Oak                 |
| terrace    | cottage       | 100    | 600   |          | 8 any stone, 4 any metal               |
| garden     | cottage       | 100    | 500   | 10 Grove | 6 any wood, 4 Moss Velvet              |
| west wing  | house         | 300    | 2,000 |          | 16 any wood, 8 any metal, 2 Old Gold   |
| west upper | west wing     | 225    | 1,500 |          | 10 any wood, 6 any cloth               |
| east wing  | house         | 300    | 2,000 |          | 16 any wood, 8 any stone, 6 Sea Glass  |
| east upper | east wing     | 225    | 1,500 |          | 10 any wood, 6 any cloth               |
| pool       | garden, house | 350    | 2,500 | 20 Tide  | 12 any stone, 6 Sea Glass, 2 Moonstone |

All parts: 2,000 Acorns and 13,000 scrap, about five weeks of a late-game daily player's spare scrap (`valley/economy/report.md`, T-7b) and the Acorn sink the valley's lab says it lacks after the first weeks.

**Luxury materials** (16; `materials.json`, and `resources.json` for name, plural and icon):

| Material      | Family | Element | Drops at (trips and scouts)    | Fights                      | Rare |
| ------------- | ------ | ------- | ------------------------------ | --------------------------- | ---- |
| Driftwood     | wood   | Tide    | Tidepools, Old Crossroads      | raid (Tidal Colossus)       |      |
| Charwood      | wood   | Ember   | Ember Caves, Old Crossroads    | dungeon, raid (Cinder Wyrm) |      |
| Heartbark     | wood   | Grove   | Verdant Hollow, Old Crossroads | raid (Thornmother)          |      |
| Lightning Ash | wood   | Spark   | Storm Ridge, Old Crossroads    | raid (Storm Sovereign)      |      |
| Bog Oak       | wood   | Mire    | Sunken Fen                     | dungeon, raid (Old Bogback) |      |
| Sea Glass     | stone  | Tide    | Tidepools                      | raid (Tide)                 |      |
| Moonstone     | stone  | Tide    | Moonlit Reef                   |                             | yes  |
| Cinder Garnet | stone  | Ember   | Ember Caves                    | raid (Ember)                |      |
| Storm Quartz  | stone  | Spark   | Storm Ridge                    | raid (Spark)                |      |
| Fen Opal      | stone  | Mire    | Sunken Fen                     | raid (Mire)                 | yes  |
| Cinder Iron   | metal  | Ember   | Ember Caves                    | dungeon                     |      |
| Bright Copper | metal  | Spark   | Storm Ridge                    | dungeon                     |      |
| Old Gold      | metal  | none    | Old Crossroads                 | raid (a cleared finale)     | yes  |
| Sea Silk      | cloth  | Tide    | Moonlit Reef                   | games                       |      |
| Moss Velvet   | cloth  | Grove   | Verdant Hollow                 | games                       |      |
| Lantern Silk  | cloth  | none    | Festival Grounds               | festival, games             |      |

"Raid (Tide)" means any Tide boss's finale; the boss's element picks the table. Flavour lines go in the compendium (package D), in its voice: "Grey wood the tide sanded smooth. It still smells of salt."; "Black oak the bog kept for a hundred years, and gave back."

**Sets** (eight plus the starter at first, nine since Quiet Verge; each has the nine forms, a wallpaper and a floor; 72 set pieces plus the Cosy set's 18, and 18 wallpapers and floors):

| Set           | Element | Primary       | Accent        | Tier | Blueprints drop from                                  | Theme (silhouette and palette)                                                                                                                                                                   |
| ------------- | ------- | ------------- | ------------- | ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cosy          | none    |               |               | 0    | known at start                                        | the living room as it is: warm wood, cream cushions (shipped sprites; only the missing forms are new)                                                                                            |
| Tidepool      | Tide    | Driftwood     | Sea Glass     | 1    | Tidepools trips and scouts; Tidal Colossus            | driftwood with scalloped shell edges; sea blue, sand, pearl white                                                                                                                                |
| Moonlit       | Tide    | Sea Silk      | Moonstone     | 2    | Moonlit Reef; a Tide boss's finale                    | night-reef blue lacquer, coral pink inlay, a soft moonstone knob; silver highlights                                                                                                              |
| Emberhold     | Ember   | Charwood      | Cinder Iron   | 1    | Ember Caves; the dungeon; Cinder Wyrm                 | forge-folk work: black charwood, riveted iron bands, amber glow; rust, coal, ember orange                                                                                                        |
| Rootwood      | Grove   | Heartbark     | Moss Velvet   | 1    | Verdant Hollow; Thornmother                           | woodfolk of the Hollow: living-wood curves, leaf carving, moss cushions; bark brown, moss and leaf greens                                                                                        |
| Stormglass    | Spark   | Lightning Ash | Bright Copper | 1    | Storm Ridge; Storm Sovereign                          | pale ash with a lightning scar, copper coils and glass beads; slate, copper, storm violet                                                                                                        |
| Fenkeeper     | Mire    | Bog Oak       | Fen Opal      | 1    | Sunken Fen; the dungeon; Old Bogback                  | the bog keeps things: dark oak with reed bindings, an oil-sheen opal; peat brown, murky teal, a violet glint                                                                                     |
| Ancient       | none    | any stone     | Old Gold      | 2    | any raid finale cleared; Old Crossroads               | Misa's example: carved standing-stone slabs, spiral carvings, worn gold leaf; sandstone, faded gold, patina teal                                                                                 |
| Lantern Night | none    | Lantern Silk  | any wood      | 2    | Festival Grounds; a Festival finale; a Games gold     | paper lanterns and bunting on painted wood; festival red, gold, cream                                                                                                                            |
| Quiet Verge   | none    | any stone     | Moonstone     | 2    | Old Crossroads; Moonlit Reef; trips, scouts and raids | the Void place (2026-11-11, the first set made with `pnpm housing new-set`): standing stones, an arch with a warm star, floating chips, a still pool; dusk violet, lilac, window dark, star gold |

Set piece ids are `<set>-<form>` for the nine forms (`ancient-stool`, `ancient-cupboard`); names are "<Set> <Form>" ("Ancient Stool"). Skin ids `<set>-wall`, `<set>-floor`.

**The Cosy set** reuses the living room's props (`sprites/data/room-sprites.ts`, day palette): `cosy-sofa` (couchBack + couchFront as its front layer), `cosy-table`, `cosy-chair`, `cosy-stool`, `cosy-lamp`, `cosy-plant`, `cosy-hearth` (fireplace), `cosy-rug`, `cosy-seat` (pouf with poufFront), `cosy-beanbag` (with beanbagFront), `cosy-cushion`, `cosy-shelf` (bookshelf, form `cupboard`), `cosy-clock`, `cosy-frame` (picture), `cosy-curtains` (window), and three new ones so the forms are complete: `cosy-bed`, `cosy-cupboard`, `cosy-shelf-wall` (form shelf). 18 pieces; 15 are shipped art. The hut starts with one of each Cosy piece owned and this layout in the Hearth: curtains (window), shelf-wall (wall-large), clock (wall-small), lamp (ceiling), sofa (floor-large), chair and plant (floor-small), rug; the mantel shows the raid plaque.

**Wild pieces** (12; no set; each its own blueprint source):

| Piece          | Form    | Blueprint from           |
| -------------- | ------- | ------------------------ |
| Rocking Chair  | chair   | starter                  |
| Hammock        | bed     | Tidepools                |
| Reef Tank      | tall    | Moonlit Reef             |
| Tall Clock     | tall    | a cleared raid finale    |
| Cuckoo Clock   | clock   | the dungeon              |
| Wayfarer Globe | stool   | feat: the Wayfarer stamp |
| Music Box      | stool   | a Games gold             |
| Moss Terrarium | plant   | Verdant Hollow           |
| Star Chart     | shelf   | Storm Ridge              |
| Old Map        | shelf   | Old Crossroads           |
| Wind Chime     | hanging | Storm Ridge              |
| Paper Mobile   | hanging | Festival Grounds         |

**Garden and pool pieces** (12): Stone Fountain, Mossback Topiary and Rose Arbor (yard-big); Flowerbed, Lantern Post, Birdbath, Garden Bench, Sundial (yard-bit); Hedge and Picket Fence (fence); Lounger (poolside); Swim Ring (float). Flowerbed and Hedge are starter blueprints, the rest drop from trips and scouts at the elements' places (the Topiary from Verdant Hollow, the Swim Ring from Tidepools, the Lantern Post from the Festival Grounds ...; package D assigns one place each).

**Skins** (47): wallpapers and floors `cosy-wall`, `cosy-floor` (starter) and one of each per set (16), and one of each for the Kitchen, Attic, Cellar, Trophy Hall, Gallery, Conservatory, Bath and Guest Room (16; `<room>-wall`, `<room>-floor`, no set, free with the part that has the room; art pass 2); roofs Thatch (starter), Slate, Red Tile, Copper Green, Moss; walls (the cutaway's frame) Plaster (starter), Timber, Fieldstone, Brick, Shingle; ground Lawn, Deck, Pool Tile (the outdoor rooms' defaults, always known). Exterior skins are taught by building parts (`unlocks`): Slate by the cottage, Timber by the house, Fieldstone by the cellar, Red Tile by the west wing, Copper Green by the east wing, Brick by the terrace, Moss by the garden, Shingle by the pool.

**Stamps** (24; 16×16 art each):

| Stamp          | Unlock                          |
| -------------- | ------------------------------- |
| Paw Print      | starter                         |
| Ledger Shell   | journal set The Tide Ledger     |
| Ash Feather    | journal set The Ash Records     |
| Root Knot      | journal set Rootwork Notes      |
| Static Spark   | journal set Static Letters      |
| Signpost       | journal set The Signpost Series |
| Crescent       | journal set Moonlit Verses      |
| Peat Bubble    | journal set The Peat Notes      |
| Torn Page      | journal set Lost Pages          |
| Colossus Wave  | Tidal Colossus beaten           |
| Wyrm Coil      | Cinder Wyrm beaten              |
| Thorn Crown    | Thornmother beaten              |
| Storm Crown    | Storm Sovereign beaten          |
| Bogback Moss   | Old Bogback beaten              |
| Deep Door      | dungeon depth 10                |
| Gold Medal     | a Games gold                    |
| Wayfarer       | stat `places_visited` at 7      |
| Glimmer Star   | stat `shinies_found` at 1       |
| Housewarming   | the cottage built               |
| Matched Set    | one set finished                |
| Old Coin       | rare drop: the raid             |
| Lantern Key    | rare drop: the dungeon          |
| Pressed Flower | rare drop: trips and scouts     |
| Rosette        | rare drop: the Games            |

**Display kinds** (the registry, section 3.5): `raid-plaques`, `games-medals`, `games-badges`, `festival`, `keepsakes`, `journal`, `dungeon`, `set-keepsakes`.

## 3. Server (apps/worker)

### 3.1 The flag

`HOUSING` mirrors `FINALE_LIVE`'s shape: `"on"` turns everything on, any other value turns it off (routes answer 404, no hook is passed, `/api/config` says nothing). `wrangler.jsonc`: top-level `"HOUSING": "on"` (local), staging `"on"`, production `"off"`, with a comment block like the others. A test pins all three (`apps/worker/test/housing.test.ts`, "the HOUSING flag: configuration"). It does not depend on `VALLEY` or `COMBAT_V2`: housing works in both shells. `GuildWorld` passes `housing: env.HOUSING === 'on'` to `GuildCore`; `/api/config` adds `housing: true` when on (absent, not false, as `valley`).

### 3.2 Tables: migration 67

Migration **67** (`apps/worker/src/housing-migration.ts`, `housingMigration`). Versions 64 to 66 belong to the valley session's branch (`ccr-93a1de17-yutb1a`: visitor, school, trials), which has already run them on staging. They are **reserved** in `MIGRATIONS` as three `null` entries, not no-ops. The runner (`applyMigrations` in `migrations.ts`) applies every version it has not recorded in `schema_version` (it no longer applies "everything above the highest"), and a reserved version is skipped without a record. So in either merge order each real migration runs exactly once: if housing reaches production first, production records 67 but not 64 to 66, and the valley's real migrations run there later, after 67; staging, which has 64 to 66, runs only 67. **When the valley branch merges:** replace the three `null`s with its migrations in place and keep housing at 67; nothing else changes. Migrations must therefore not depend on running in version order against a later one (64 to 66 and 67 are independent tables). If housing needs a second migration it is **68**. Additive; production runs it with the flag off and every table stays empty.

```sql
CREATE TABLE houses (
  user_id TEXT PRIMARY KEY,
  roof TEXT NOT NULL, walls TEXT NOT NULL,          -- exterior skin ids
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX houses_updated ON houses (updated_at);  -- the visit list's 15 most recent

CREATE TABLE house_parts (
  user_id TEXT NOT NULL, part_id TEXT NOT NULL,
  paid_json TEXT NOT NULL,                           -- PaidLines so far: {"bait":40,"scrap":120,"material:driftwood":3,"family:wood":{"heartbark":2}}
  built_at INTEGER,                                  -- null while being paid
  PRIMARY KEY (user_id, part_id)
);

CREATE TABLE house_rooms (
  user_id TEXT NOT NULL, room_id TEXT NOT NULL,      -- '<part>:<key>', e.g. 'hut:hearth'
  wall TEXT NOT NULL, floor TEXT NOT NULL,           -- skin ids
  spots_json TEXT NOT NULL,                          -- {"<spotId>": {"p": "<pieceId>", "m": "<creatureId>"?}}
  PRIMARY KEY (user_id, room_id)
);

CREATE TABLE house_items (                           -- everything a player holds for housing
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('piece','skin','material','stamp','blueprint')),
  item_id TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  fresh INTEGER NOT NULL DEFAULT 0 CHECK (fresh >= 0), -- materials: gained since last seen ("+N")
  at INTEGER NOT NULL,                               -- first gained
  PRIMARY KEY (user_id, kind, item_id)
);

CREATE TABLE house_trophies (                        -- written at the moment: the raid hook
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('raid','festival')),
  ref TEXT NOT NULL,                                 -- boss id, or the Festival species
  best INTEGER NOT NULL,                             -- best rank beaten at (festival: 0)
  wins INTEGER NOT NULL,
  last_week TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, ref)
);

CREATE TABLE house_guestbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL, visitor_id TEXT NOT NULL, stamp_id TEXT NOT NULL,
  day TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE UNIQUE INDEX house_guestbook_once ON house_guestbook (owner_id, visitor_id, day);
CREATE INDEX house_guestbook_owner ON house_guestbook (owner_id, id);
CREATE INDEX house_guestbook_visitor ON house_guestbook (visitor_id, day);

CREATE TABLE house_mail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL, from_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('gift')),       -- room for later kinds
  amount INTEGER NOT NULL CHECK (amount > 0),
  day TEXT NOT NULL, at INTEGER NOT NULL,
  claimed_at INTEGER
);
CREATE UNIQUE INDEX house_mail_gift_once ON house_mail (from_id, day) WHERE kind = 'gift';
CREATE INDEX house_mail_open ON house_mail (owner_id, claimed_at);
CREATE INDEX house_mail_day ON house_mail (owner_id, day);

CREATE TABLE house_drops (                           -- one row per paid moment: idempotency and "recent finds"
  user_id TEXT NOT NULL, key TEXT NOT NULL,
  at INTEGER NOT NULL, json TEXT NOT NULL,           -- the HouseDrop
  PRIMARY KEY (user_id, key)
);
CREATE INDEX house_drops_at ON house_drops (user_id, at);
```

Kept small without a timer: the guestbook keeps the owner's latest `guestbookKeep` rows (each stamp deletes older ones of that owner in the same write, through `house_guestbook_owner`); `house_drops` deletes the player's rows older than `dropsKeepDays` in the hook's own write (through `house_drops_at`). Nothing goes in `old-data.ts`. Every table carries `user_id` or `owner_id` so the reset's wipe and any purge can clear a player (note for the reset session, section 7).

The "game day" (`day`) is `gameDay(now, timezone, RULES.daily.reset)` from `time.ts`, the allowance's day.

### 3.3 The module

| File (package B)       | What                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `housing-migration.ts` | migration 67                                                                                                                                                                                         |
| `housing-store.ts`     | row reads and writes, nothing else (houses, parts, rooms, items, trophies, guestbook, mail, drops)                                                                                                   |
| `housing.ts`           | `class Housing` (deps: storage, now, timezone, `currentBoss: () => string \| null`): `own`, `visit`, `list`, `catalogue`, `build`, `craft`, `place`, `skin`, `housemate`, `gift`, `stamp`, `collect` |
| `housing-displays.ts`  | the display registry (3.5)                                                                                                                                                                           |
| `housing-feats.ts`     | `readFeats(sql, userId): HouseFeats` (cheap reads, 3.4 prices) and awarding feat stamps                                                                                                              |
| `housing-drops.ts`     | `class HousingDrops implements HousingHook` (deps: storage, now, rng): writes a moment's drop once                                                                                                   |
| `housing-schemas.ts`   | request bodies (valibot, strict)                                                                                                                                                                     |
| `housing-routes.ts`    | `housingRoutes: Routes<HousingRouteContext>`                                                                                                                                                         |
| `dev-tools-housing.ts` | staging tools (3.7)                                                                                                                                                                                  |

`own(userId)` makes the house on first call (houses row with the starter roof and walls, the hut part built, the Hearth room with the starter layout, one of each Cosy piece, the starter stamp; one transaction), then answers. Every spend runs inside `atomically` + `runKeyed` (`keyed-action.ts`), and the Acorn part through the ledger's `spend` with `settleSpend`, exactly as `valley-gifts.ts` does; scrap and shards through `debitParts` (`gear-store.ts`); materials through `house_items` with `count >= amount` checked in the same transaction. A refused spend throws `GameError` and the transaction rolls back.

### 3.4 Endpoints

All under the normal session auth; the caller is always the session's user. The caller's own house is under `/api/house/...` (fixed paths only); other houses are under `/api/houses/...`, so no template path can swallow a fixed one (`/api/house/:userId` would match `/api/house/catalogue`). Path ids are validated (`pathId`); a `:userId` must be a Discord snowflake of a player of this guild with a `houses` row (else 404 `no_house`). Bodies are strict valibot objects (unknown keys rejected); ids `IdSchema` (≤ 64, plain id characters); amounts integers 0 to 1,000,000; record bodies at most 16 keys; idempotency keys `SPEND_KEY_RE`. The guild's shared per-player token bucket (`RATE_CAPACITY` 30, 1 a second, `guild-core.ts`) covers every route; gifts and stamps are capped per day on top. Reads are priced for a server of 15 players with a full house (the worst case), measured by the read meter in package B's tests.

| Method, path                     | Request                                                                                                                | Answer (schemas in `housing/view.ts`)                                                                                                                                                 | Rows read (worst)                                                                                                   | Errors                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/house`                 |                                                                                                                        | `{ house: HouseView, own: OwnHouseView }`                                                                                                                                             | about 450 (house 1, parts 11, rooms 14, items ≤ 250, displays ≤ 150, mail ≤ 20, guestbook 30, purse 8); typical 150 | 404 when the flag is off                                                                                                                                                               |
| `GET /api/houses/:userId`        |                                                                                                                        | `{ house: HouseView }` (no `own`)                                                                                                                                                     | about 250                                                                                                           | 404 `no_house`; the caller's own id answers as `GET /api/house` without `own`                                                                                                          |
| `GET /api/houses`                |                                                                                                                        | `HouseListView`                                                                                                                                                                       | about 50 (houses 15 by `houses_updated`, names 15, the caller's guestbook rows today and gift today)                |                                                                                                                                                                                        |
| `GET /api/house/catalogue`       |                                                                                                                        | `CatalogueView`                                                                                                                                                                       | about 300                                                                                                           |                                                                                                                                                                                        |
| `POST /api/house/build`          | `{ partId, pay: HousePay, idempotencyKey }`                                                                            | `{ part: PartProgressView, built: boolean, purse: Purse, materials: Record<string, { have, fresh }>, grown?: BuildGrown }` (`materials`: only the ones paid; `grown` only when built) | about 50; finishing about 70                                                                                        | 404 `not_found`; 409 `already_built`, `part_locked`, `nothing_to_pay`, `insufficient_funds`, `insufficient_parts`, `insufficient_materials`; `key_conflict`                            |
| `POST /api/house/craft`          | `{ itemId, idempotencyKey }` (a piece or a skin)                                                                       | `{ itemId, kind: 'piece' \| 'skin', count, purse: Purse, materials }` (`materials`: only the ones taken)                                                                              | about 55                                                                                                            | 404 `not_found`; 409 `not_known`, `already_owned` (a skin), the three `insufficient_*`; `key_conflict`                                                                                 |
| `PUT /api/house/place`           | `{ roomId, spotId, pieceId: string \| null, from?: { roomId, spotId } }`                                               | `{ room: RoomView, from: RoomView \| null, own: { free: Record<string, number> }, housemates: HousemateView[] }`                                                                      | about 280                                                                                                           | 404 `not_found` (room not built, spot not in the room, or in `from`); 409 `spot_mismatch` (also: `from` does not hold the piece, or is the target), `none_free` (every copy is placed) |
| `PUT /api/house/skin`            | `{ target: 'room', roomId, wall?: string, floor?: string }` or `{ target: 'exterior', roof?: string, walls?: string }` | `{ target: 'room', room: RoomView }` or `{ target: 'exterior', exterior: { roof, walls } }` (as asked)                                                                                | about 30                                                                                                            | 404; 409 `not_owned`, `skin_mismatch`                                                                                                                                                  |
| `PUT /api/house/housemate`       | `{ roomId, spotId, creatureId: string \| null }`                                                                       | `{ housemates: HousemateView[] }`                                                                                                                                                     | about 40                                                                                                            | 404 `creature_not_found` (not the caller's), `not_found`; 409 `not_a_bed`, `housemate_cap`, `already_housemate` (the creature sleeps elsewhere: it moves)                              |
| `POST /api/houses/:userId/gift`  | `{ idempotencyKey }`                                                                                                   | `{ gift: { amount }, today: VisitToday }`                                                                                                                                             | about 10                                                                                                            | 404 `no_house`; 409 `own_house`, `gift_used_today`, `gift_cap_reached`; `key_conflict`                                                                                                 |
| `POST /api/houses/:userId/stamp` | `{ stampId }`                                                                                                          | `{ guestbook: GuestbookEntry[], today: VisitToday }`                                                                                                                                  | about 40                                                                                                            | 404 `no_house`; 409 `own_house`, `stamp_used_today`, `stamp_not_owned`                                                                                                                 |
| `POST /api/house/mail/collect`   | `{ idempotencyKey }`                                                                                                   | `{ collected: number, balance: number }`                                                                                                                                              | about 30                                                                                                            | 409 `nothing_to_collect`; `key_conflict`                                                                                                                                               |
| `POST /api/house/seen`           | `{}`                                                                                                                   | `{ ok: true }` (clears `fresh` on materials)                                                                                                                                          | about 20                                                                                                            |                                                                                                                                                                                        |

Place and move: without `from` the call sets one spot (a piece, or `null` to empty it). With `from` it is a move, in one transaction (a refusal changes nothing): the old spot is emptied, so the piece's own copy is free again, and the piece is placed in the new spot; a bed takes its sleeper along (a bed placed over another bed, with no move, keeps that spot's sleeper). A sleeper whose bed is emptied, or replaced by a piece that is no bed, goes home to no bed. The answer carries `housemates` as they now stand (so a sleeper that left, or moved with its bed, is right on screen) and `from`, the room a move left when that is another room (else `null`). The client never does a move as empty-then-place.

Gift: the server credits nothing to anyone at the gift; it writes a `house_mail` row (`amount` = `HOUSING_RULES.gift.acorns`) after checking the caller has no gift row today (`house_mail_gift_once`) and the owner has fewer than `gift.perReceiverPerDay` rows today (`house_mail_day`). Collect: in one transaction, reads the owner's unclaimed rows, credits their sum to the ledger (`currency: 'bait'`, `source: 'house_gift'`, the client's key; a repeat returns the stored result), marks them claimed. Stamp: one row per (owner, visitor, day) by the unique index; the stamp must be one the caller holds (`house_items` kind `stamp`).

Shapes (strict, in `packages/game/src/housing/view.ts`):

```ts
HouseView = {
  owner: { userId: string; name: string };                 // the stored, sanitised display name
  built: string[];                                         // part ids
  exterior: { roof: string; walls: string };
  rooms: RoomView[];                                       // every built room, indoor and outdoor
  displays: DisplayView[];                                 // one per display spot of a built room
  housemates: HousemateView[];
  guestbook: GuestbookEntry[];                             // newest first, at most guestbookKeep
  setsComplete: string[];
};
RoomView = { id: string; kind: string; wall: string; floor: string; spots: Record<string, string | null> };
HousemateView = { roomId: string; spotId: string; home: boolean;
  creature: { id: string; species: string; shiny: boolean; nickname: string | null; level: number } };
GuestbookEntry = { visitor: { userId: string; name: string }; stampId: string; at: number };
DisplayView = { roomId: string; spotId: string } & DisplayData;
DisplayData =
  | { kind: 'raid-plaques'; plaques: { bossId: string; best: number; wins: number }[]; current: string | null }
  | { kind: 'games-medals'; gold: number; silver: number; bronze: number; pins: number }
  | { kind: 'games-badges'; events: { eventId: string; wins: number }[] }
  | { kind: 'festival'; species: string[] }
  | { kind: 'keepsakes'; places: { place: string; count: number }[] }
  | { kind: 'journal'; sets: string[]; pages: number }
  | { kind: 'dungeon'; depth: number; clears: number }
  | { kind: 'set-keepsakes'; sets: string[] };

OwnHouseView = {
  progress: PartProgressView[];                            // parts started but not built
  buildable: string[];
  items: { pieces: Record<string, number>; skins: string[]; stamps: string[]; blueprints: string[] }; // learned blueprints (starters are known from content)
  free: Record<string, number>;                            // piece copies not placed
  materials: Record<string, { have: number; fresh: number }>;
  purse: { bait: number; scrap: number; shards: Record<Element, number> };
  mailbox: { gifts: number; acorns: number; from: { userId: string; name: string }[] }; // unclaimed
  recent: { at: number; materials: Record<string, number>; blueprint: string | null; stamp: string | null }[]; // the last 10 drops
};
PartProgressView = { partId: string; paid: PriceLine[]; remaining: PriceLine[] };
HousePay = { bait?: number; scrap?: number; shards?: Partial<Record<Element, number>>; materials?: Record<string, number> };

HouseListView = {
  houses: { userId: string; name: string; built: string[]; updatedAt: number; today: VisitToday }[]; // at most 15, sorted by name; the caller's own house left out
  me: { giftLeft: boolean };
};
VisitToday = { gifted: boolean; stamped: boolean };       // what the caller did at this house today

CatalogueView = {
  pieces: { id: string; owned: number; placed: number; known: boolean }[];
  skins: { id: string; owned: boolean; known: boolean }[];
  stamps: { id: string; owned: boolean }[];
  materials: { id: string; have: number }[];
  parts: { id: string; built: boolean }[];
  sets: { id: string; complete: boolean }[];
};
```

Build, craft and skin answer with what changed, so the client folds them in and never re-reads the house (a partial payment used to answer with its progress only, and the client read the whole house again, about 540 rows):

```ts
Purse = { bait: number; scrap: number; shards: Record<Element, number> };      // absolute, after the action
BuildGrown = {                                                                 // a finished part
  parts: string[];        // every built part id, content order
  buildable: string[];    // parts that can be paid into now
  learned: string[];      // blueprints the part taught (added to the learned ones)
  rooms: RoomView[];      // the rooms the part made
  displays: DisplayView[]; // the display spots of those rooms (read only when such a room exists)
};
```

A payment's or a craft's `materials` holds the new `{ have, fresh }` of each material the action took (an emptied one is `{ have: 0, fresh: 0 }`: the client drops it). A craft of a piece adds one free copy (`count` is the new total held); a skin is `count` 1. The whole build or craft answer is the stored result of its key, so a retry answers the same. A skin change is not keyed (setting the same skin twice is the same state).

Names, hints, sources and prices are not sent: the client has the content (`@creatures/game`). The client parses every answer with these schemas (`v.safeParse`); the worker's tests `v.parse` every answer they get, so a shape change fails both sides (the valley's pattern; no captured fixture set is added, so `pnpm fixtures:capture --check` stays green with nothing new).

A housemate's `home` is false when the creature is away: `busyReason(sql, creature)` (`gear-access.ts`: a trip or a Workshop job) is not null, it stands at a valley seat (`valley_seats` by `valley_seats_creature`), or it is in an open dungeon run of today. A creature placed in the raid stays home (raiders lounge in the living room too, and a placement lasts the week). A creature that was released or fused away drops off its bed on the next read (the read cleans the spot).

Nothing housing reads or writes runs on `/api/state`, an alarm tick or the object's start. A house loads only when opened; visiting reads one house.

### 3.5 Displays: a small registry

`housing-displays.ts` exports `DISPLAY_PROVIDERS: Record<DisplayKind, (ctx: DisplayCtx) => DisplayData>` where `DisplayCtx = { sql, userId, content, currentBoss, owned }`. Each provider reads a few rows by primary key or index, once per house view (memoised per kind within the call):

| Kind            | Reads                                                                                                                 | Rows |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ---- |
| `raid-plaques`  | `house_trophies` (user, 'raid'); `currentBoss()` (the week's boss: the raid's week row, one or two rows)              | ≤ 8  |
| `games-medals`  | `games_medals` by user                                                                                                | 1    |
| `games-badges`  | `games_badges` by `games_badges_by_user`, summed per event                                                            | ≤ 60 |
| `festival`      | `house_trophies` (user, 'festival')                                                                                   | ≤ 5  |
| `keepsakes`     | `valley_gifts` by its primary key (user first), `plaque = 1`, counted per place (empty with the valley's systems off) | ≤ 30 |
| `journal`       | `journal` by user (entry ids), sets completed from `journal.json`                                                     | ≤ 45 |
| `dungeon`       | `dungeon_progress` by user (depth, clears)                                                                            | 1    |
| `set-keepsakes` | none (from the items already read)                                                                                    | 0    |

Adding a display kind elsewhere: a variant in `DisplayData`, a provider here, a `display` spot in a room kind, a sprite in the art pack. No backfill of past raid wins is done: `house_trophies` starts empty and the planned reset (`docs/design/reset.md`, PR #132) wipes history anyway.

`readFeats` uses the same rows (journal, trophies, dungeon, medals) plus `account_stats` by user (about 12 rows) and the built parts. `GET /api/house` (own) runs `stampsEarned` and writes any new feat stamps (and the Wayfarer Globe's feat blueprint) in its transaction.

### 3.6 The housing-drops hook: exact touch points

`HousingDrops.drop(userId, moment)` runs inside the caller's transaction: if `house_drops (userId, moment.key)` exists it returns; else it reads the player's known blueprints and stamps (`house_items` by key prefix, ≤ 120 rows, only when a blueprint or stamp was actually rolled), calls `rollHouseDrops`, upserts the materials (`count += n, fresh += n`), learns the blueprint, adds the stamp, writes the `house_drops` row and prunes old ones. A `raid` moment with `cleared` also upserts `house_trophies` (`best = MAX(best, rank)`, `wins + 1`) and, with `festival`, the festival row. No house needed: drops wait in `house_items` until the player opens the House. Writes per moment: 1 to 5 rows; reads without a rolled blueprint or stamp: one per upsert.

Each reward path gets an optional `housing?: HousingHook | undefined` in its deps (absent: nothing happens, so tests that do not pass it are unchanged) and one call. Line numbers are as of `main` at `b8b2f17`; the call goes where the comment says.

| File                                  | Add                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Where                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/worker/src/expeditions.ts`      | `housing?: HousingHook \| undefined` in `ExpeditionsDeps` (l. 168)                                                                                                                                                                                                                                                                                                                                                                                                                                                                | interface                                                                                                  |
| `apps/worker/src/expedition-claim.ts` | `if (finished) env.deps.housing?.drop(userId, { kind: 'trip', key: \`trip:${expedition.id}\`, place: dest.id, element: dest.element ?? null, ticks });`                                                                                                                                                                                                                                                                                                                                                                           | `payTrip`, right after `const result: ExpeditionResult = { recalled: !finished, catches, loot };` (l. 333) |
| `apps/worker/src/collection.ts`       | `housing?` in `CollectionDeps` (l. 295), passed through to `new Expeditions({ ... })` (l. 380)                                                                                                                                                                                                                                                                                                                                                                                                                                    | constructor                                                                                                |
| `apps/worker/src/dungeon-rows.ts`     | `housing?` in `DungeonDeps` (l. 22)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | interface                                                                                                  |
| `apps/worker/src/dungeon-finish.ts`   | `deps.housing?.drop(userId, { kind: 'dungeon', key: \`dungeon:${row.id}\`, depth, cleared });`                                                                                                                                                                                                                                                                                                                                                                                                                                    | `finishRun`, right after `const rewards = payRun(...)` (l. 201)                                            |
| `apps/worker/src/raid-resolve.ts`     | `housing?` in `ResolveDeps` (l. 84); in `payStage`, after the `--- Finale loot ---` jackpot line: `if (phase === 'finale') { const festival = facts.cleared ? (readWeekProgression(sql, week.weekId)?.festivalSpecies ?? null) : null; for (const userId of memberIds) deps.housing?.drop(userId, { kind: 'raid', key: \`raid:${week.weekId}:${String(party)}\`, weekId: week.weekId, bossId: facts.bossId, rank: payout.rank, cleared: facts.cleared, festival }); }` (`festivalSpecies`only when`progression.festival` is true) | `payStage` (l. 737)                                                                                        |
| `apps/worker/src/raid.ts`             | `housing?` in `RaidDeps` (l. 118), so it reaches `payStage` (check that `RaidDeps` is what both `settleParty` and `raid-v2-stage.ts` pass as `ResolveDeps`)                                                                                                                                                                                                                                                                                                                                                                       | interface                                                                                                  |
| `apps/worker/src/games-lock.ts`       | `housing?` in `GamesDeps` (l. 46)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | interface                                                                                                  |
| `apps/worker/src/games-award.ts`      | `if (p.medal !== null) deps.housing?.drop(p.user_id, { kind: 'games', key: \`games:${day}:${p.event_id}\`, medal: p.medal });`                                                                                                                                                                                                                                                                                                                                                                                                    | `awardDay`, in the placings loop right after the `addMedals(...)` call (l. 97)                             |
| `apps/worker/src/valley-finds.ts`     | `housing?` in `ScoutDeps` (l. 64); `this.deps.housing?.drop(userId, { kind: 'scout', key: \`scout:${seatId}:${String(at)}\`, place: place.id, element: place.element, finds: store.gear + store.blueprints + store.pages });`                                                                                                                                                                                                                                                                                                     | `collect`, right after `creditParts(this.sql, userId, parts);` (l. 320)                                    |
| `apps/worker/src/guild-core.ts`       | build `HousingDrops` (when the flag is on) before the Collection; pass `housing: hook` to `new Collection`, `new ValleyFinds`, `new Dungeon`, `new Raid`, `new Games`                                                                                                                                                                                                                                                                                                                                                             | constructor (l. 528 to 651)                                                                                |

The Games' Prize Stall (Wednesdays) is a natural blueprint shop later: a stall offer kind `house-blueprint` (`games-stall-schema.ts`, `games-stall.json`, the stall's grant). Not tonight.

### 3.7 Dev tools (staging only)

In `dev-tools-housing.ts`, registered in `dev-tools.ts` (`TOOLS`) and `dev-schemas.ts` (`DEV_ACTION_TOOLS` and the body schemas), like `dev-tools-games.ts`:

- `housing-grant` `{ materials?: number, acorns?: number, scrap?: number, blueprints?: 'all', stamps?: 'all' }`: fills the caller's holdings for a try-out.
- `housing-build` `{ parts: 'all' | string[] }`: builds parts without paying.
- `housing-guests` `{ count?: number }`: gives the raid's dev guests (`dev-guest-*`) houses with random built parts, furniture, housemates and stamps in the caller's guestbook, so the visit list and the guestbook have something on staging.
- `housing-fresh`: deletes the caller's housing rows (all eight tables) so the first-visit hut can be seen again.

### 3.8 Touch points in shared worker files (all small)

`migrations.ts` (import + version 67 entry), `guild-core.ts` (option, `readonly housing: Housing | null`, routes spread, the hook passes, `currentBoss`), `guild-world.ts` (one option), `index.ts` (`/api/config` line), `wrangler.jsonc` (vars and comment), `env.d.ts`/`worker-configuration.d.ts` (`HOUSING`), `dev-tools.ts` and `dev-schemas.ts` (registration), and the reward files of 3.6.

## 4. Client (apps/activity)

### 4.1 Where it mounts

| File                             | Change                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api.ts`                         | `housing: boolean` in the config type and its parse (`data['housing'] === true`)                                                                                                                       |
| `App.tsx`                        | pass `housing={config.housing}` to `Game`                                                                                                                                                              |
| `tabs.ts`                        | `'house'` in `Tab`; a `TABS` entry `{ id: 'house', label: 'House', glyph: 'house-nav', group: 'collection' }` after Stats                                                                              |
| `nav-places.ts`                  | `navPlaces(alerts, options?: { housing?: boolean })`: leaves `house` out unless `housing` (default off, so other callers are unchanged)                                                                |
| `Game.tsx`                       | a `housing` prop; pass it to `navPlaces`; render `{tab === 'house' && housing && <HousePlace ... />}` with the shared props (creatures, offset, balances, the gear view's parts, `onState`)            |
| `valley/valley-nav.ts`           | `viewOf`: tab `house` is the House place with `book: 'house'` (as `journal` and `stats` are); widen the book type                                                                                      |
| `valley/ValleyFrame.tsx`         | a `housing?: boolean` prop; in the House block one more `PlaceRow` (glyph `house-nav`, "Your house", line from the house, `onBook('house')`) before Journal                                            |
| `glyphs.ts`                      | `...HOUSING_GLYPHS` in `BUNDLED_GLYPHS` (art package E5)                                                                                                                                               |
| `icon-ref.ts`, `ui/GameIcon.tsx` | an `IconRef` kind `{ kind: 'house'; id: string }`: a piece or skin's picture at 1x (or the `size`'s integer scale), so `RecipeCard`, `CountBadge` and `FindRow` show furniture without a new component |
| `styles/index.css`               | `@import './views/housing.css';`                                                                                                                                                                       |
| `workbench/registry.ts`          | `housingEntries`                                                                                                                                                                                       |

`HousePlace` is loaded with a dynamic `import()` so the furniture art is not in the first load. The Home board gets no notice row tonight (it would need `/api/state` to read housing); a "gift waiting" notice is a later step.

### 4.2 Files

All new files in `apps/activity/src/housing/` unless named:

| File                                      | Package | What                                                                                                                                        |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `housing-api.ts`                          | C1      | the request functions (4.5), parsing with the `housing/view.ts` schemas                                                                     |
| `use-house.ts`                            | C1      | loads the own house, runs actions through the action runner with one idempotency key per action (`actions.ts`' key store), keeps the answer |
| `HousePlace.tsx`                          | C1      | the place: own house page, the drill-ins (room, build, workbench, catalogue, mailbox, visit list, a visited house)                          |
| `HouseScene.tsx`, `house-scene.ts`        | C1      | the cutaway: pure composition (`house-scene.ts`) and the canvas, pan and focus (`HouseScene.tsx`)                                           |
| `house-art.ts`                            | C1      | the art registry: `import.meta.glob('../sprites/data/house/*.ts', { eager: true })` collects each file's `HOUSE_ART` pack; fallbacks        |
| `house-placeholder.ts`                    | C1      | a grey, ink-outlined box of a form's size for any item with no art yet                                                                      |
| `RoomFocus.tsx`                           | C1      | one room at a larger scale: spots as buttons (own) or pieces as tappable pictures (visit)                                                   |
| `VisitHouse.tsx`                          | C1      | a visited house: the scene read-only, the gift and stamp actions, the guestbook                                                             |
| `HouseRows.tsx`                           | C1      | the house page's rows (Build, Workbench, Catalogue, Mailbox, Visit) and the valley's "Your house" row                                       |
| `BuildPanel.tsx`, `build-view.ts`         | C2      | the parts as rows (picture, name, progress pips); a part's page: remaining lines, pay                                                       |
| `PartPreview.tsx`                         | C1+C2   | a part of the house as a picture (the build rows and a part's page)                                                                         |
| `WorkbenchPanel.tsx`, `workbench-view.ts` | C2      | known blueprints by set, each a `RecipeCard`                                                                                                |
| `CataloguePanel.tsx`, `catalogue-view.ts` | C2      | everything with counts; silhouettes                                                                                                         |
| `SpotPicker.tsx`                          | C2      | a spot's choices (pieces that fit, owned copies free, Empty), and for a bed the housemate drill-in                                          |
| `SkinPicker.tsx`                          | C2      | wallpaper, floor, roof, walls                                                                                                               |
| `MailboxPanel.tsx`                        | C2      | unclaimed gifts and Collect                                                                                                                 |
| `VisitList.tsx`                           | C2      | the server's houses as rows                                                                                                                 |
| `Guestbook.tsx`                           | C2      | the latest stamps with who and when                                                                                                         |
| `StampPicker.tsx`, `GiftButton.tsx`       | C2      | a visitor's two actions, each a `valley/PinnedAct` (one at a time, then a calm line)                                                        |
| `SkinTrigger.tsx`                         | fix 2   | the roof, walls, wallpaper and floor in use as a dropdown-looking trigger (`equip-trigger` and `DropChevron`)                               |
| `HousePostcard.tsx`, `house-postcard.ts`  | fix 1   | the whole house as a small outside picture: above a cutaway that cannot show it, in the visit list's rows, in the build-complete note       |
| `house-sample.ts`                         | C2      | sample `HouseView`, `OwnHouseView`, `CatalogueView`, `HouseListView` for tests and the workbench (they pass the schemas)                    |
| `styles/views/housing.css`                | C1      | all housing CSS (C2 adds its classes in its own section, see 6)                                                                             |
| `workbench/entries/housing.tsx`           | C1      | workbench entries for every housing component, from `house-sample.ts`                                                                       |

### 4.3 Shared components each screen reuses (rows of `ux-patterns.md`)

| Screen or part                                          | Reuses                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The house page's actions                                | "Places as rows": `valley/PlaceRow` (glyph, name, the line of what is next there: "Cottage: 2 / 4 lines paid", "3 gifts"); never a toolbar                                                                                                                                                                                                                      |
| The scene                                               | "A map or scene that pans sideways": `ui/PanHint` and `ui/use-drag-scroll` (as the living room and the valley map); creatures "stand by their feet" with `ui/Nameplate`; "A popover is above every scene": the scene is its own stacking context                                                                                                                |
| Room focus, build, workbench, catalogue, mailbox, visit | "A page opened from another page": `ui/DrillHead` with "‹ Back" and `onDrillKey`; on a desktop "A main area with a side panel": `ui/WideLayout` + `ui/SidePanel` (the scene stays beside the panel)                                                                                                                                                             |
| A spot's choices, a skin                                | "A drawer": `ui/Drawer` on a phone (`SidePanel` on a desktop), inside it the cells of "Pick one of many similar things from pictures": `ui/SupplyGrid`'s square picture buttons with the stock count in a corner (free copies), the standard selection ring; extend `SupplyGrid` with a flat `cells` list if its kinds-by-tiers grid does not fit, never a copy |
| The bed's housemate                                     | "Where a creature list opens": inside the drawer, a drill-in with `ui/DrillHead` and `ui/CreatureList` (`pick`, `flat`); "What a creature list shows": the basics plus "Away" as the reason on the right                                                                                                                                                        |
| A part to build                                         | "A recipe": `ui/RecipeCard` (inputs with have / need, the part as the output, no duration, "Pay in" as the action); costs as "Counts and resources" (`CostLine`, `ShortOfLine`, resource icons, never names)                                                                                                                                                    |
| A piece to make                                         | `ui/RecipeCard` (materials, Acorns, scrap in; the piece out via the new `IconRef` kind `house`; "Make")                                                                                                                                                                                                                                                         |
| The catalogue                                           | `ui/Segmented` for the kinds (Furniture, Garden, Skins, Stamps, Materials, Parts); `ui/Accordion` per set; tiles as in the spot picker; a tile opens a `Popover` with the name, the set as a `ui/Tag`, the source line and the counts as `ui/CountBadge`s ("3 / 1": owned, placed)                                                                              |
| New finds                                               | "Something found or gained": `ui/FindRow` / `FindList` for the last drops (recent), and the material badges' "+N" gain as `ui/Nameplate`'s `gain` does it                                                                                                                                                                                                       |
| Mailbox                                                 | `ui/CountBadge` (Acorns) per gift with the giver's name; one `ui/ActionButton` "Collect" with the total                                                                                                                                                                                                                                                         |
| Gift and stamp                                          | `ui/ActionButton` (Gift; disabled with the reason "Given today" when used); the stamp: "A trigger that opens a list looks like a dropdown": the trigger with `ui/DropChevron` opening `ui/DropList` of owned stamps; "A pick acts right away"                                                                                                                   |
| The visit list                                          | `valley/PlaceRow` rows (a house glyph, the owner's name, the line "Gift given · Stamped" or nothing); "Pick lists show everyone"                                                                                                                                                                                                                                |
| Guestbook                                               | a plain list of rows (stamp picture, the visitor's name, the time via `time-format.ts`); `ui/ScrollHint` if it scrolls                                                                                                                                                                                                                                          |
| Errors and refusals                                     | `ui/Alert` (level alert for a failed spend; inline)                                                                                                                                                                                                                                                                                                             |
| Notes in the scene                                      | none: the scene shows, it does not tell (no captions over rooms; the room's name is the focus view's `DrillHead` title)                                                                                                                                                                                                                                         |

New shared parts: none planned. If C1 or C2 builds something no row fits, its reuse list names the nearest row and why (CLAUDE.md, "UI review checks reuse"). C1 adds one row to the `ux-patterns.md` table: "A player's house (the cutaway, a room, a visit)" naming `housing/HouseScene`, `RoomFocus` and `VisitHouse`.

### 4.4 The scene

- **Logical size.** Room cells of 112×64 (2.4); the house's box from `houseGrid` plus 16 px of grass to each side and 40 px of sky above the roof. A cottage is about 260×200, a full house about 1,500×330.
- **Scale.** The overview uses the largest whole scale of 1 or more, at most 2 on a phone and 3 from 700 px wide, at which the building (its box and the grass its door stands on; the yard's workbench and mailbox are a pan away) fits the box (`overviewScale`), in a box at most 60vh high. When nothing fits it draws at 2 and starts centred on the building's whole box, scrolled down so the grass line sits near the bottom and as much roof shows as fits (`overviewScroll`); the whole house then also shows above the cutaway as a `HousePostcard` sized to the width, so the player always sees all of it. A visit uses the same framing. It pans both ways (`use-drag-scroll`, native touch scroll) and shows `PanHint` at edges with more to see. A focused room is drawn alone at the largest integer scale up to 4 that fits the content width (a 1-cell room is scale 3 on a 390 px phone).
- **Layers**, back to front: sky (the valley's sky sprites, `valley-sky`), grass and earth, the exterior frame (outer walls in the walls skin, slabs, the roof in the roof skin, chimney, door, mailbox), then per room: wallpaper tiles, floor tiles, back pieces (window, wall, ceiling, displays, floor-large), the housemate creature on its bed's sleep anchor with a "z" glyph, the bed's and sofa's front layer, floor-small pieces, rug. Outdoor rooms: ground tiles, fence, yard-large, yard-small, water and poolside. Canvases as `room-canvas.ts` draws (`drawSprites`, integer scale, sharp edges): one back canvas and one front canvas for the whole house; creatures are `SmallCreature`-style buttons between them only in the focused room (the overview draws them on the back canvas, no buttons).
- **Spots.** In a focused own room every spot is a button over the canvas (spoken name: "Window: Tidepool Curtains", "Small floor: empty"); an empty spot draws one small pixel plus at its base (the dashed outline only while it is hovered or focused, the gold one while its picker is open), a filled one nothing extra. A tap opens the spot picker. Displays are buttons that open a popover listing what they show (a plaque: boss name, best rank, wins).
- **Day, twilight and night.** `roomPhase` (`@creatures/game`) picks the phase. Day is required tonight. Twilight and night are a stretch for C1: a pure colour map per phase applied to every palette (as `swapPalette` does), the windows' sky from the phase, and lamps with a `glow` sprite drawn at night. If it is not cheap, it waits; say so in the PR.
- **Motion.** Housemates breathe as loungers bob (off under reduced motion); nothing else moves.

### 4.5 States and screens

- **Own house (the place).** The scene band; under it the rows: Build ("next: Cottage" with the part's pips), Workbench (how many blueprints known), Catalogue ("48 / 196 found"), Mailbox (gifts waiting, a pip), Visit ("7 houses"); then the guestbook. The materials strip is not a row: the recipe cards show have / need where things are spent, and what grew since the player last looked shows as `CountBadge`s with "+N" under the scene, once (then `POST /api/house/seen`), never on the first open (when every material counts as new).
- **Decorate.** Tap a room: `RoomFocus` drill-in (DrillHead title: the room's name; Back to the house). Spots are buttons; the room's wallpaper and floor are two dropdown triggers (`SkinTrigger`) under the room that open `SkinPicker`. Tap a spot: `SpotPicker` in a `Drawer` (the title is spoken, not shown): "Empty" first, then owned pieces that fit (free copies counted; placed elsewhere shows "From the Loft" and moves it), then known blueprints not made yet, greyed, with "Make" leading to the workbench recipe in the same drawer as a drill-in. The tiles keep a fixed order (owned first, then by set, pieces in no set first) in runs under the set's name as a small label; a spot that is empty starts on the first free piece. A bed spot has a `ui/Slot` "Who sleeps here" above the main button that opens the creature drill-in (`ui/CreatureList`).
- **Build complete.** Paying the last line closes the part's page and returns to the house: a success `Alert` ("The Cottage is built") with the postcard, the new rooms lifted in a short stepped reveal (not at all with reduced motion), the cutaway scrolled to them and the first new room's button focused.
- **Build.** `BuildPanel` is rows of parts (`valley/PlaceRow` with a small picture of the part's new rooms, the name and a pip for every line of the price, lit when paid); a tap opens the part's own page (the host keeps which one is open, so Back and the title follow): a larger picture, the part's pips (one per line, lit when something is paid into it, so a first payment lights one), a `RecipeCard` of what is still owed (have / need, no output: the picture is the output) with "Pay in", which pays what the player holds of every line at once up to the price (`HousePay` with every line at the most held); with nothing to pay in the button gives way to a `ShortOfLine` ("You have 0; this costs 75"). There is no holdings strip and no way to hold a line back. The pictures come from `housing/PartPreview` (`house-scene.ts` `partPreview`, the house with the part built, cropped to the rooms it adds). Parts not yet buildable follow in the list as muted rows with their picture and reason ("Needs the Garden and the House first"); a tap opens their page, a goal to look at: the picture, the price and the reason in place of Pay in.
- **Workbench.** By set (`Accordion`, with the set's made / total beside its name, the same numbers as the catalogue); inside one the set's pieces as `SupplyGrid` pictures (dimmed when short, the owned count in the corner) over one `RecipeCard` for the chosen piece; "Make" crafts at once and the count in the corner goes up.
- **Catalogue.** As in 4.3, with four tabs (Furniture with the garden and pool pieces as its last groups, Skins, Stamps, Materials) so they fit one row on a phone; the parts are the Build page's; unknown items are the art's solid silhouette in the panel colour (a `swapPalette` to one colour) with the hint line.
- **Visiting.** `VisitList` (rows; the caller's own house is not in it), a tap opens `VisitHouse`: the scene read-only, rooms focus read-only, displays and pieces open popovers; at the bottom, pinned with `valley/PinnedAct`, one action at a time: Gift (its detail says what it gives, "+5 for Anna"), then "Leave a stamp" (a dropdown list), then a calm line with the check when both are done ("Gift and stamp given today"); never a disabled action. The list's rows show each house as a `HousePostcard`.
- **Mailbox.** `MailboxPanel` drill-in: one row per gift (giver, Acorns badge), "Collect" once; then a success `Alert` with the gain as a `CountBadge` "+15" and the givers' names. The mailbox in the scene has its flag up while gifts wait and down when empty (`mailbox-empty` in the shell pack; until it is drawn the flag-up one stands for both).
- **Phone and desktop.** Phone (390 px, checked at 360): the scene band full width, rows under it, every panel a drill-in page or a drawer. Desktop (1100 px): `WideLayout`, the scene in the main area at scale 3, panels in a `SidePanel`; a focused room stays in the main area and its spot picker opens in the side panel.

Client request functions (`housing-api.ts`, C1; C2 never calls them, it gets callbacks):

```ts
fetchOwnHouse(): Promise<{ house: HouseView; own: OwnHouseView }>
fetchHouse(userId: string): Promise<{ house: HouseView }>
fetchHouses(): Promise<HouseListView>
fetchCatalogue(): Promise<CatalogueView>
buildPart(partId: string, pay: HousePay, key: string): Promise<BuildAnswer>
craftItem(itemId: string, key: string): Promise<CraftAnswer>
placePiece(roomId: string, spotId: string, pieceId: string | null): Promise<PlaceAnswer>
setSkin(body: SkinBody): Promise<{ house: HouseView }>
setHousemate(roomId: string, spotId: string, creatureId: string | null): Promise<{ housemates: HousemateView[] }>
giftHouse(userId: string, key: string): Promise<GiftAnswer>
stampHouse(userId: string, stampId: string): Promise<StampAnswer>
collectMail(key: string): Promise<{ collected: number; balance: number }>
markSeen(): Promise<void>
```

C2 component props (the contract C1 renders against):

```ts
BuildPanel(props: { house: HouseView; own: OwnHouseView; busy: boolean; error: string | null; onPay: (partId: string, pay: HousePay) => void; open?: string | null; onOpen?: (partId: string | null) => void; renderPreview?: (partId: string, size: 'row' | 'page') => ComponentChildren })
WorkbenchPanel(props: { own: OwnHouseView; busy: boolean; error: string | null; focus?: string; onCraft: (itemId: string) => void })
CataloguePanel(props: { catalogue: CatalogueView | null; failed: boolean; onRetry: () => void })
SpotPicker(props: { room: RoomView; spotId: string; own: OwnHouseView; housemates: HousemateView[]; creatures: readonly Creature[]; placedIn?: Record<string, string>; busy: boolean; onPlace: (pieceId: string | null) => void; onHousemate: (creatureId: string | null) => void; onMake: (itemId: string) => void })
SkinPicker(props: { kind: 'wall' | 'floor' | 'roof' | 'walls'; current: string; own: OwnHouseView; busy: boolean; onPick: (skinId: string) => void; onMake: (itemId: string) => void })
MailboxPanel(props: { mailbox: OwnHouseView['mailbox']; busy: boolean; onCollect: () => void })
VisitList(props: { list: HouseListView | null; failed: boolean; onRetry: () => void; onOpen: (userId: string) => void })
Guestbook(props: { entries: readonly GuestbookEntry[]; now: number })
StampPicker(props: { owned: readonly string[]; used: boolean; busy: boolean; onStamp: (stampId: string) => void })
GiftButton(props: { today: VisitToday; giftLeft: boolean; busy: boolean; onGift: () => void })
```

## 5. Art plan

Everything is pixel art in the repo's `SpriteDef` format, drawn with the art studio (`docs/design/art-studio.md`): `pnpm art <set>` renders and lints, `pnpm art library` updates `docs/art/README.md`. Read `creatures.md` "Art direction for sprites", the studio's "Briefing a drawing agent" and the living room's props (`sprites/data/room-sprites.ts`) first: housing art is the same style, the same ink (`#0d0a1a`), hard edges, two or three colours per thing.

**Files.** The game reads art from `apps/activity/src/sprites/data/house/<pack>.ts`, each exporting `HOUSE_ART: HouseArtPack` (collected by `house-art.ts`'s glob, so packs never edit a shared list):

```ts
interface PieceArt {
  sprite: SpriteDef;
  front?: SpriteDef;
  sleep?: { x: number; y: number };
  glow?: SpriteDef;
}
interface HouseArtPack {
  pieces?: Record<string, PieceArt>; // by piece id
  skins?: Record<string, { tile: SpriteDef; ridge?: SpriteDef; eave?: SpriteDef }>; // by skin id
  stamps?: Record<string, SpriteDef>; // 16×16
  keepsakes?: Record<string, SpriteDef>; // by set id, 12×12
  displays?: Partial<
    Record<
      | 'plaque'
      | 'plaque-empty'
      | 'bench'
      | 'badge-slot'
      | 'case'
      | 'shelf'
      | 'books'
      | 'marker'
      | 'cabinet',
      SpriteDef
    >
  >;
  shell?: Partial<
    Record<
      'slab' | 'earth' | 'chimney' | 'door' | 'mailbox' | 'workbench' | 'vent' | 'z',
      SpriteDef
    >
  >;
}
```

Each pack also has a concept wrapper, `apps/activity/src/sprites/concepts/house-<pack>.ts`, that imports the pack and exports it as a `ConceptSet` (kind `free`, status `draft`, one alternative palette row for night where it matters) so the studio can render, lint and catalogue it, and Misa can like or redo pieces on the art review page. Nothing in the game imports the concept folder. When Misa likes a pack, the wrapper is deleted (the studio's "promote" step), and `pnpm art library` is run.

**Sizes.** Pieces fit their form's box (2.5; a test checks), stand on their bottom row (floor pieces) or hang from their top row (ceiling). Wallpaper tiles 16×52 (repeat across), floor tiles 16×8, roof tiles 16×8 with a ridge cap and an eave end, wall-frame tiles 8×8, ground tiles 16×8 (lawn, deck, pool tile; pool water 16×8 with a seam variant). Stamps 16×16 with the ink outline and at most 5 colours. Keepsakes 12×12. Material icons 8×8 glyphs (`glyph` kind lint: flat colour, at most 5 colours, 6 px from every shipped glyph). Raid plaques: a 28×32 board that frames the shipped 24×24 boss sprite at 1x (no new boss art) with a 3-digit rank plate drawn in the world map's pixel font; the empty plaque is the same board with a dashed outline where the boss would be.

**How a set stays one set.** Each set has one palette (8 to 10 colours plus the ink) shared by all its pieces and skins (one `palette` object at the top of the pack, every sprite uses its keys) and one **silhouette motif** that appears on every piece: Tidepool's scalloped shell edge, Moonlit's crescent inlay, Emberhold's iron bands with rivets, Rootwood's leaf curl at the top corners, Stormglass's zigzag copper trim, Fenkeeper's reed binding with an opal drop, Ancient's spiral carving and stepped top, Lantern Night's hanging tassel and red lacquer. A piece's form sets its outline (every bed has the same footprint, so housemates sleep in the same spot); the set's motif and palette make it that set's. The set sheet's "nearest sprite" row must show the nine pieces closer to each other than to another set's.

**Art batches** (independent; each owns its pack file and its concept wrapper):

| Batch | Pack file(s)                                                                              | Contents                                                                                                                                                                                                                                                                  | Sprites      |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| E1    | `house/shell.ts`                                                                          | the building: slab, earth, chimney, door, mailbox, workbench, vent, the "z"; roof skins (5) and wall-frame skins (5) with ridge and eave; ground skins (lawn, deck, pool tile, water)                                                                                     | about 30     |
| E2    | `house/tidepool.ts`, `house/moonlit.ts`, `house/emberhold.ts`, `house/rootwood.ts`        | four sets: 9 pieces, a wallpaper, a floor, a keepsake each                                                                                                                                                                                                                | 48           |
| E3    | `house/stormglass.ts`, `house/fenkeeper.ts`, `house/ancient.ts`, `house/lantern-night.ts` | four sets, as E2                                                                                                                                                                                                                                                          | 48           |
| E4    | `house/cosy.ts`, `house/wild.ts`, `house/garden.ts`                                       | the Cosy set mapped from `ROOM_SPRITE_DATA` (day palette) plus its three new pieces, the starter wallpaper and floor; the 12 wild pieces; the 12 garden and pool pieces                                                                                                   | about 32 new |
| E5    | `house/displays.ts`, `housing/housing-glyphs.ts`                                          | the 24 stamps, the display art (plaque board, empty plaque, bench, badge slot, case, shelf, books per journal set, depth marker, cabinet), the 16 material glyphs `lux-<id>`, the nav glyph `house-nav`, `mail`, `stamp`; and the `...HOUSING_GLYPHS` line in `glyphs.ts` | about 60     |

E2 and E3 can be split further by set (one agent a set) since each set is its own file. Every batch reports one line per sprite and what still reads badly, and its set sheets, for the lead's review before Misa sees them (studio, "Reviewing a set"). Night palettes: E1 and E4 give a `night` alt row; the sets do not need one if C1's phase colour map is used.

## 6. Work packages

Every brief starts with `git fetch origin <session branch> && git reset --hard origin/<session branch>`, works only inside its own worktree (absolute paths), never a bare `git stash`, never hand-edits captured fixtures, commits on its worktree branch, never pushes, and finishes with `pnpm format:check`, then `pnpm check:changed` as a **background job writing a log** (about 11 minutes; wait on the log, a foreground call times out), then `pnpm fixtures:capture --check`. UI packages bring a reuse list. Migration numbers: **67** to B (and 68 if B needs a second one). Nobody else adds a migration.

### A. Game package: schemas, rules, pure functions, view schemas

- **Goal.** Everything pure: content schemas and loader, `HOUSING_RULES`, prices, payments, layout grid, sets, drops, stamps, the hook types and the view schemas. No shipped content (that is D).
- **Owns.** `packages/game/src/housing/**` (`schema.ts`, `rules.ts`, `price.ts`, `layout.ts`, `sets.ts`, `drops.ts`, `stamps.ts`, `hook.ts`, `view.ts`, `index.ts`), `packages/game/test/housing-*.test.ts`, `packages/game/test/housing-fixture.ts` (a small hand-made `HousingContent` for its tests: three parts, two room kinds, one set, two materials, three stamps), and these one-line edits: `packages/game/src/index.ts` (`export * from './housing';`), `packages/game/src/content/resources-schema.ts` (`'luxury'` in `RESOURCE_KINDS`).
- **Contract (exports).** The types of 2.1 and 2.2 with these names; `loadHousingContent(raw: { forms; rooms; parts; materials; sets; pieces; skins; stamps; starter }, resources: readonly ResourceDef[], ctx: { journalSets: readonly string[]; bosses: readonly string[]; destinations: readonly string[] }): HousingContent`; `HOUSING_RULES`; `piecePrice`, `skinPrice`, `partRemaining`, `applyPayment`, `buildable`, `houseGrid(content, built): GridRoom[]` with `GridRoom = { roomId: string; kind: string; col: number; floor: number; w: number; outdoor: boolean; part: string }`, `knownBlueprints`, `canPlace`, `completeSets`, `rollHouseDrops`, `stampsEarned`, `HousingHook`, `HousingMoment`, `HouseDrop`, `HouseFeats`, and the view schemas `HouseViewSchema`, `OwnHouseViewSchema`, `HouseListViewSchema`, `CatalogueViewSchema`, `PartProgressViewSchema`, `GuestbookEntrySchema`, `HousemateViewSchema`, `RoomViewSchema`, `DisplayViewSchema`, `HousePaySchema` with inferred types of the same names minus `Schema`, and `parseHouseAnswer`-style helpers returning `undefined` on a bad shape.
- **Tests.** Loader rejects each cross-reference error (one case each); `applyPayment` never takes more than owed or held, pays family lines with the named materials, completes exactly at zero; `houseGrid` places every part of the table in 2.4 with no overlap, wings and grounds on the outer edges with and without wings; `rollHouseDrops` with a seeded RNG: counts within the table's bounds, only known-source materials, no known blueprint, no owned stamp, rare weight applied; `stampsEarned` per unlock kind; `completeSets`; `piecePrice` by size and tier; view schemas accept a sample and reject unknown keys. Under 1 s per file.
- **Acceptance.** `pnpm --filter @creatures/game test` and typecheck green; no I/O; no `Math.random`.
- **Depends on.** Nothing. Start at once. Merge first.

### B. Worker: storage, endpoints, displays, feats, drops, flag, dev tools

- **Goal.** Section 3 except the reward-path call lines (F).
- **Owns.** `apps/worker/src/housing*.ts` (all files of 3.3), `apps/worker/src/dev-tools-housing.ts`, `apps/worker/test/housing*.test.ts`, and the edits of 3.8: `migrations.ts`, `guild-core.ts` (except the five hook passes, which F adds), `guild-world.ts`, `index.ts`, `wrangler.jsonc`, `env.d.ts` / `worker-configuration.d.ts`, `dev-tools.ts`, `dev-schemas.ts`, and its additions to `read-budget.test.ts` and `query-plan-audit.test.ts` (new cases only).
- **Contract.** Endpoints, bodies, answers and errors exactly as 3.4; answers pass the A view schemas. Exports for F: `class HousingDrops implements HousingHook` (`housing-drops.ts`, deps `{ storage: LedgerStorage; now: () => number; rng: Rng }`), and `GuildCore.housingHook: HousingHook | null` (null with the flag off). `GuildCore` option `housing?: boolean` and `housingRng?: Rng` (tests seed it).
- **Tests.** Flag pin (top-level on, staging on, production off; routes 404 with it off; `/api/config` carries `housing` only when on). First visit makes the hut with the starter layout, once. Build: partial payments over three calls, idempotent repeat, `key_conflict`, refusal on prerequisites, `insufficient_*` rolls back everything, built at the last unit, exterior skin unlocked. Craft: known only, materials and Acorns taken once, skin once. Place: fit checks, a moved copy, `none_free`. Housemate: own creature only, cap, `home` false while on a trip. Gift: once a day per giver, receiver cap, not own house, collect credits the ledger once with a repeat answering the same. Stamp: once per house per day, only owned stamps, guestbook trimmed to the keep. Visit and list read-only and never show `own`. Displays: each provider with seeded rows. Feats: a finished journal set awards its stamp once. Drops: `HousingDrops.drop` twice with one key writes once; a raid moment upserts the trophy. Read budget: `GET /api/house`, a visit and the list under the prices of 3.4 on the seeded world (`read-world.ts`); `/api/state` and the alarm tick unchanged (existing budgets green). Query plan audit: every housing statement uses an index.
- **Acceptance.** `pnpm check:changed` green; budgets green without raising any; every answer `v.parse`s.
- **Depends on.** A merged (types and schemas). Content from D for real data (B's tests can load D's content once D merges; until then they use A's fixture content through an injectable `content` dep).

### C1. Client: mount, scene, focus, visit, API, host page

- **Goal.** The House place in both shells, the cutaway with pan and focus, decorate's spots, the visited house, the request functions, and wiring C2's panels.
- **Owns.** `apps/activity/src/housing/{housing-api.ts, use-house.ts, HousePlace.tsx, HouseScene.tsx, house-scene.ts, house-art.ts, house-placeholder.ts, RoomFocus.tsx, VisitHouse.tsx, HouseRows.tsx}` and their tests, `styles/views/housing.css` (C2 appends its section after C1 merges, or sends its CSS in its own file `styles/views/housing-panels.css` with its own `@import` line that C1 adds: pick the second, so the two never share a file), `workbench/entries/housing.tsx`, and the edits of 4.1 except `glyphs.ts` (E5): `api.ts`, `App.tsx`, `tabs.ts`, `nav-places.ts`, `Game.tsx`, `valley/valley-nav.ts`, `valley/ValleyFrame.tsx`, `icon-ref.ts`, `ui/GameIcon.tsx`, `styles/index.css` (both housing imports), `workbench/registry.ts`, and the new row in `docs/design/ux-patterns.md`.
- **Contract.** Renders C2's components with the props of 4.5; reads art only through `house-art.ts` (`pieceArt(id): PieceArt` falling back to the placeholder, `skinArt`, `stampArt`, `displayArt`, `shellArt`) and exports `ART_PENDING: ReadonlySet<string>` (ids with no art yet, empty at integration). Exports `HouseScene(props: { house: HouseView; mode: 'own' | 'visit'; onRoom: (roomId: string) => void; scaleFor?: (width: number) => number })` and `housePreview(house, partId): placements` for C2's build preview.
- **Tests.** `house-scene.ts` pure: layers in order, every placement inside the house box, front layers after creatures, a housemate at its bed's anchor, an away housemate not drawn; `navPlaces` leaves House out with the flag off and in with it on; `viewOf('house')`; the valley row opens the house; `HouseScene` pans and focuses (component test); spots are buttons with spoken names; visit mode has no spot buttons; a completeness test that every content piece, skin and stamp has art or is in `ART_PENDING`; the bar breakpoint and dock tests still pass with a ninth place (adjust `BAR_QUERY` per `ux-patterns.md` if the bar test says so). Screenshots at 360, 390 and 1100 px of: a hut, a full house (dev tool `housing-build all`), a focused room, the spot drawer, a visit.
- **Acceptance.** Every way in: dock (page game) and the House place (valley) both open the page; Back and Escape return; no horizontal page scroll; the font audit passes.
- **Depends on.** A merged. B for live data (until then `house-sample.ts` from C2, or its own sample). Wires C2's panels after C2 merges (fetch and merge the session branch).

### C2. Client: panels

- **Goal.** The leaf components of 4.2 marked C2 and their pure views, with tests and samples.
- **Owns.** `apps/activity/src/housing/{BuildPanel.tsx, build-view.ts, WorkbenchPanel.tsx, workbench-view.ts, CataloguePanel.tsx, catalogue-view.ts, SpotPicker.tsx, SkinPicker.tsx, MailboxPanel.tsx, VisitList.tsx, Guestbook.tsx, StampPicker.tsx, GiftButton.tsx, house-sample.ts}` and their tests, `styles/views/housing-panels.css`.
- **Contract.** The props of 4.5, exactly. No requests: every action is a callback. Reads content from `@creatures/game` (names, prices via `piecePrice`, hints) and art through C1's `house-art.ts` (import only; until C1 merges, a local stub in the test setup is fine, never a copy in the source).
- **Tests.** Views: a part's remaining lines with have / need; a piece's recipe with "short of" lines; the catalogue's counts and silhouettes for unknown items; the spot picker lists only fitting pieces, free copies first, Empty first; the housemate drill-in lists creatures with "Away" reasons; the stamp picker shows only owned stamps and is disabled with "Stamped today"; the gift button's three states. Component tests for keyboard and spoken names. `house-sample.ts` passes the A schemas.
- **Acceptance.** Workbench entries render each panel at 390 and 1100 px (C1 registers them). Reuse list delivered.
- **Depends on.** A merged. Can start the views at once against the 2.x shapes.

### D. Content data, compendium, glossary

- **Goal.** The first content of 2.5 as data, plus the words.
- **Owns.** `packages/game/src/content/data/housing/{forms,rooms,parts,materials,sets,pieces,skins,stamps,starter}.json`, `packages/game/src/content/housing.ts` (imports them, calls `loadHousingContent` with the resource library and the journal sets, bosses and destinations, exports `housing: HousingContent`), the export line in `packages/game/src/content/index.ts`, the 16 `luxury` entries in `packages/game/src/content/data/resources.json` (icon `{ kind: 'glyph', id: 'lux-<id>' }`), glossary entries in `glossary.json` (`house`, `house-part`, `luxury-material`, `furniture-blueprint`, `furniture-set`, `housemate`, `stamp`, `guestbook`, `mailbox`; one short line each, the game's voice, no numbers), `docs/compendium/housing.md` (new: the house, every part, room, set with its theme and keepsake, wild and garden piece, material, skin and stamp with one line of flavour each, tagged `(content)`), a pointer in `docs/compendium/README.md`'s file list, and `packages/game/test/housing-content.test.ts` (the shipped content loads; counts as 2.5; every name in the compendium, like `compendium.test.ts` does for other kinds).
- **Contract.** Ids exactly as 2.5 (set pieces `<set>-<form>`, skins `<set>-wall` and `<set>-floor`, materials kebab-case of their names, stamps kebab-case), so the art packs can be drawn from this spec without waiting for D. Spot x positions per room kind: D lays them out within each room's cells by these rules: floor-large centred in the right two thirds, floor-small at the left and at the right edge, the window left on the wall, wall-large over the floor-large, wall-small right of it, the ceiling spot over the middle, the rug centred; displays in the hall in one row of eight 26 px slots. Prices as the parts table; piece and skin prices from `HOUSING_RULES` (no overrides tonight).
- **Tests.** As above; under 1 s.
- **Acceptance.** `pnpm --filter @creatures/game test` green; the compendium test green; prose in the compendium's tone (short, warm, plain; no numbers).
- **Depends on.** Can write the JSON at once from this spec; validates once A merges (rebase on the session branch, then run the tests).

### E1 to E5. Art batches

- **Goal.** The packs of section 5.
- **Owns.** E1 `sprites/data/house/shell.ts` + `sprites/concepts/house-shell.ts`; E2 the four pack files of its sets + `sprites/concepts/house-sets-a.ts`; E3 the same for its four + `sprites/concepts/house-sets-b.ts`; E4 `sprites/data/house/{cosy,wild,garden}.ts` + `sprites/concepts/house-furnish.ts`; E5 `sprites/data/house/displays.ts`, `housing/housing-glyphs.ts` (`HOUSING_GLYPHS`), the spread line in `glyphs.ts`, + `sprites/concepts/house-marks.ts`. Each batch also runs `pnpm art library` (it regenerates `docs/art/README.md` and the sheets; after merging two art branches the lead runs it again instead of resolving the catalogue by hand).
- **Contract.** The `HouseArtPack` shape of section 5 (C1 defines the type in `house-art.ts`; until it exists, declare the same interface locally in the pack and remove it once C1 merges), ids from 2.5, sizes within the form boxes, one palette object per set.
- **Tests.** The studio's lint clean (`pnpm art <set>`), the sprite tests that apply to `sprites/data/` (shape, palette keys used), and C1's size check once both are merged.
- **Acceptance.** The set sheet for each set reviewed by the lead (studio, "Reviewing a set"): reads as its set at 1x and 3x, pieces of one set closer to each other than to another set's, night row where asked. A report line per sprite.
- **Depends on.** Nothing. Start at once. E5 merges early (C1's nav glyph and the material icons).

### F. Reward-path hooks

- **Goal.** The call lines of 3.6 and the five passes in `guild-core.ts`.
- **Owns.** After B merges: the deps-field and call-line edits in `expeditions.ts`, `expedition-claim.ts`, `collection.ts`, `dungeon-rows.ts`, `dungeon-finish.ts`, `raid-resolve.ts`, `raid.ts`, `games-lock.ts`, `games-award.ts`, `valley-finds.ts`, the five hook passes in `guild-core.ts` (handed over by B, sequential), and `apps/worker/test/housing-drops.test.ts`.
- **Contract.** `HousingHook.drop(userId, moment)` with the moment shapes of 2.2 and the keys of 3.6 (stable per reward moment, so a retried claim or a replayed award never pays twice).
- **Tests.** One case per path with a seeded `housingRng` (a trip claim, a scout pack coming home, a dungeon run's end, a raid finale won and lost, a Festival finale, a Games award) that the drop lands once; with the flag off (no hook) the existing fixtures and results are byte-identical (`pnpm fixtures:capture --check` exits 0); `read-day.test.ts` and `read-budget.test.ts` still pass (the hooks add writes, not reads on hot paths; if a write budget moves, say by how much and why in the PR).
- **Acceptance.** Every touch is one optional field and one call (or the documented two in `raid-resolve.ts`); no change of behaviour for any other system.
- **Depends on.** A and B merged.

### Order

| When               | Packages                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| At once            | A, D (JSON), E1, E2, E3, E4, E5                                                                                                                             |
| After A            | B, C1, C2, D (validate, finish)                                                                                                                             |
| After B            | F                                                                                                                                                           |
| After C2           | C1 wires the panels                                                                                                                                         |
| Integration (lead) | merge order A, E5, D, B, C2, C1, E1 to E4, F; empty `ART_PENDING`; `pnpm art library`; `pnpm decisions check`; full `pnpm check`; staging only if Misa asks |

## 7. Risks and touch points on other sessions' files

- **Migration numbers.** 64 to 66 are reserved (`null`) for the valley session's open branch; housing takes 67 (see 3.2). The valley branch replaces the `null`s with its real migrations when it merges, in either order. If that branch renumbers or is abandoned, the reserved gaps stay harmless (they are never recorded).
- **Combat v2 and valley rework sessions** edit `raid-resolve.ts`, `raid.ts`, `raid-v2-*`, `valley-*` and `ValleyFrame.tsx`. Housing's edits there are one optional deps field and one call each (3.6) and one `PlaceRow` plus one prop (4.1). Conflicts, if any, are line-level; F lands last to keep the window small. The weekly visitor (`valley-visitor.ts`, not on `main`) gets no hook tonight.
- **Shared client files.** `tabs.ts`, `nav-places.ts`, `Game.tsx`, `App.tsx`, `api.ts`, `icon-ref.ts`, `ui/GameIcon.tsx`, `glyphs.ts`, `styles/index.css`, `workbench/registry.ts`, `valley/valley-nav.ts`, `valley/ValleyFrame.tsx`: each gets a few lines. A ninth place moves the phone bar's breakpoint (`ux-patterns.md`: "each added place pushes the breakpoint up by about 5 rem").
- **Shared game files.** `resources.json` and `resources-schema.ts` (a new kind; screens that list resources by kind must not start showing luxury materials in the currency popover: check `CurrencyPile`'s filter), `glossary.json`, `content/index.ts`, `game/src/index.ts`.
- **Flag on in local tests.** Top-level `HOUSING` is on, so every worker test that goes through the real `fetch` has the routes. Tests that build `GuildCore` directly get no hook unless they pass `housing: true`, so existing fixtures and budgets do not move.
- **Bundle size.** About 250 sprites of data. `HousePlace` loads with `import()`; the main bundle only gets the glyphs. The housing content (about 89 KB of JSON, validated when it loads) is its own package entry, `@creatures/game/housing-content`, not part of the `@creatures/game` barrel, so only the housing chunk and the worker pull it in; the valley's "Your house" row is `valley/YourHouseRow`, free of it. `apps/activity/src/first-load-housing.test.ts` fails if a static import from `main.tsx` reaches the content or `HousePlace`. Measured (`vite build`): the main chunk went from 1,905 kB to 1,840 kB (gzip 576 to 563 kB).
- **Reads.** The own house view is the most expensive read in the game per call (about 450 rows worst case), but only on open; at 15 players opening it five times a day that is about 34,000 rows a day (0.7% of the free 5M). If the ops report shows more, split the items read out of `GET /api/house` into the catalogue.
- **The reset** (`docs/design/reset.md`, open PR #132): the wipe list must include the eight `house*` tables; the settlers' record can later grant a stamp or a piece (a `grant` unlock kind is the seam). Tell that session.
- **Seams left clean.** Porch visitors (part kind `porch`, spot type `porch`, a display kind and a moment kind later; the porch's visitors are worked out on open from timestamps as research item 6 says); the carpenter post (any place may call `Housing.craft`; the workbench fixture is just its button); the weekly visitor's blueprint (a `visitor` moment kind and a blueprint pool flag on pieces); the Games stall (`house-blueprint` offer kind); homes on the valley map (the same `HousePlace`, opened from a house on the map); a Home notice for gifts (needs one cheap read on `/api/state`, priced first); the Gazette telling "Aino built a pool" (a small moment the valley session can read from `house_parts.built_at`).

## 8. Open questions for Misa (game feel only)

1. **Does the giver get anything for a gift?** The gift is a small pile of Acorns the server makes for your friend; giving costs nothing and gives nothing back. Pick: nothing back; the mailbox says who sent it, which is the reward.
2. **Can a housemate also be seen at the bonfire?** It is resting either way and earns the bonfire's rate; the bonfire keeps choosing its rotating few from every resting creature, so it is never emptied. Pick: yes, it can appear in both places.
3. **A creature placed in the raid: home or away?** A raid placement lasts the week; counting it as away would empty the beds of everyone's best creatures all week. Pick: home (as raiders lounge in the living room today).
4. **One gift a day in all, or one per house?** Pick: one in all, so a gift means "I picked you today"; a stamp is one per house a day.
5. **The trophy hall is in the west wing,** so the full hall waits until a player has built the house and the wing; the Hearth's mantel shows the best plaque from day one. Pick: keep it there (a reason to build the wing).

## 9. Numbers (all in `HOUSING_RULES` unless the content file is named; all picks)

| What                                      | Value                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Room cell                                 | 112×64 scene px; walls 4 px                                                           |
| Housemates per house / beds per room      | 3 / 1                                                                                 |
| Gift                                      | 5 Acorns; 1 a day per giver (in all); 6 a day per receiver; never expires             |
| Stamps                                    | 1 per visitor per house per day; guestbook keeps 30                                   |
| Visit list                                | the 15 most recently changed houses, shown by name                                    |
| Recent finds shown / drops kept           | 10 / 14 days                                                                          |
| Piece price, small form                   | 15 Acorns, 40 scrap, 1 primary, 1 accent                                              |
| Piece price, large form                   | 30 Acorns, 120 scrap, 3 primary, 1 accent                                             |
| Tier 2 set                                | Acorns and scrap ×1.5, accent +1                                                      |
| Skin price, wall or floor / roof or walls | 20 Acorns, 60 scrap, 2 primary / 60 Acorns, 300 scrap, 6 of the part's first material |
| Part prices                               | `parts.json` (the table in 2.5)                                                       |
| Drops                                     | the table in 2.3; rare materials at ¼ weight                                          |
| Overview scale / focus scale              | 2 on a phone, 3 from 700 px / the largest integer up to 4 that fits                   |
