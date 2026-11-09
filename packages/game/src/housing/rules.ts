/**
 * Every housing scalar in one place (`docs/design/housing.md` section 9). All picks; a change is one edit here.
 * Probabilities are whole percents (rolled as `chance(rng, n, 100)`), amounts are integers.
 */
export const HOUSING_RULES = {
  /** One room cell in scene px; walls are 4 px (interior wall 112x52, floor strip 8, slab 4). */
  cell: { w: 112, h: 64, wall: 4, interiorH: 52, floorStrip: 8, slab: 4 },
  /** Housemates per house and beds per room. */
  housemates: { max: 3, bedsPerRoom: 1 },
  /** A visitor's gift: Acorns the server makes; one a day in all per giver, a few a day per receiver; never expires. */
  gift: { acorns: 5, perGiverPerDay: 1, perReceiverPerDay: 6 },
  /** One stamp per visitor per house per day; the guestbook keeps the latest rows. */
  stamps: { perVisitorPerHousePerDay: 1 },
  guestbookKeep: 30,
  /** The visit list: the most recently changed houses. */
  visitListMax: 15,
  /** Recent finds shown, and how many days of `house_drops` rows are kept. */
  recentShown: 10,
  dropsKeepDays: 14,
  price: {
    small: { bait: 15, scrap: 40, primary: 1, accent: 1 },
    large: { bait: 30, scrap: 120, primary: 3, accent: 1 },
    /** Acorn and scrap multiplier per set tier, in basis points; tier 2 also takes `tier2AccentExtra` more accent. */
    tierBp: { 0: 10_000, 1: 10_000, 2: 15_000 },
    tier2AccentExtra: 1,
    /** Wallpaper and floor skins; roof and wall skins take `first` of the unlocking part's first material. */
    skinSurface: { bait: 20, scrap: 60, primary: 2 },
    skinExterior: { bait: 60, scrap: 300, first: 6 },
  },
  drops: {
    /** A rare material is drawn at `rareWeight / commonWeight` of a common one (a quarter). */
    commonWeight: 4,
    rareWeight: 1,
    trip: { ticksPerExtraRoll: 3, materialPct: 40, blueprintPct: 3, stampPct: 1 },
    scout: { materialPct: 30, blueprintPct: 2, stampPct: 1 },
    dungeon: {
      depthPerExtraRoll: 5,
      clearedExtraRolls: 1,
      materialPct: 50,
      blueprintPct: 6,
      stampPct: 2,
    },
    raid: {
      clearedRolls: 3,
      lostRolls: 1,
      materialPct: 100,
      /** A cleared finale also rolls this chance for one of `bonusMaterial`. */
      bonusMaterial: 'old-gold',
      bonusPct: 25,
      blueprintPct: 25,
      stampPct: 5,
      /** A cleared Festival finale adds this material and opens this set's blueprints to the blueprint roll. */
      festivalMaterial: 'lantern-silk',
      festivalAmount: 2,
      festivalSet: 'lantern-night',
    },
    games: {
      materialPct: { gold: 100, silver: 60, bronze: 30 },
      blueprintPct: 5,
      stampPct: 2,
    },
  },
  /** Scene scale: 2 on a phone, 3 from `wideFrom` px; a focused room takes the largest integer up to `focusMax` that fits. */
  scale: { phone: 2, wide: 3, wideFrom: 700, focusMax: 4 },
} as const;
