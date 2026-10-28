/** What the wiki page is built from: plain data, no imports from the game, so a test can pass a fake. */

export interface WikiCreature {
  id: string;
  name: string;
  /** The creature line (its forms share it). */
  line: string;
  stage: number;
  element: string;
  rarity: string;
  role: string;
  levelCap: number;
  baseStats: { hp: number; atk: number; spd: number };
  /** The stats at its level cap (the game's own stat rule, no fusion). */
  capStats: { hp: number; atk: number; spd: number };
  growth: { hp: number; atk: number; spd: number };
  /** Armour, a species stat of the combat v2 draft (flat: no growth per level). */
  armour: number;
  /** The forms this one evolves into (one or two). */
  evolvesTo: string[];
  festival: boolean;
  flavor: string;
  /** Its finale ability in the game today. */
  ability: { name: string; description: string } | null;
  /** Ids of the talents in the game today that it can have (its line's pool and signature). */
  talents: string[];
  /** Ids of the combat v2 draft Knacks it can equip (the ones it brings and the ones it keeps from the form it evolved from). */
  knacks: string[];
  /** The Knacks it brings itself (a subset of `knacks`); the others it keeps from the form it evolved from. */
  ownKnacks: string[];
  /** Ids of the combat v2 draft talents it can roll. */
  draftTalents: string[];
}

export interface WikiCurrentTalent {
  id: string;
  name: string;
  /** The effect in one phrase: "First pounce +14%". */
  text: string;
  about: string;
  /** A fixed signature talent (one line's epic) rather than a pool talent. */
  signature: boolean;
  /** The id of the modifier it is the effect of (its gear line), when it has one. */
  modifier?: string;
}

export interface WikiKnack {
  id: string;
  name: string;
  family: string;
  /** What a player reads: keywords are in braces, `{Seal}`. */
  text: string;
  intent: string;
}

export interface WikiDraftTalent {
  id: string;
  name: string;
  text: string;
  intent: string;
  /** The roles it does something for (idle on the others). */
  roles: string[];
}

/** One modifier of the library (an effect that changes a creature, one entry per effect). */
export interface WikiModifier {
  id: string;
  name: string;
  text: string;
  /** What it is about: damage, marks, protection, support or outside. */
  category: string;
  /** The roles it works for (all four for "any"). */
  roles: string[];
  /** Where it exists: `game` (a shipped gear line), `lab` (a draft talent) or `idea` (only designed). */
  status: string;
  /** What it is made of: stat, condition, trigger, shape, aura, transfer, rhythm, chance or rule. */
  kind: string;
  /** Ids of the draft talents that are this effect. */
  draftTalents: string[];
  /** Other names the design gives the same effect. */
  also: string[];
}

/** One creature form's picture: where the page links it and the SVG file the build writes there. */
export interface WikiArt {
  /** The creature form's id. */
  id: string;
  /** The site path of the file, such as `/wiki-art/creature-splashet.svg`. */
  src: string;
  svg: string;
}

/** A role or a rarity as the game's glossary explains it. */
export interface WikiTerm {
  id: string;
  name: string;
  /** The glossary's one line. */
  short: string;
  /** The glossary's lines under it. */
  lines: string[];
  /** A creature form the glossary draws beside it, if any. */
  species: string | null;
}

export interface WikiData {
  creatures: WikiCreature[];
  /** A picture for each form that has art; a form without art has none and the page shows no image. */
  art: WikiArt[];
  /** The icon of each element that has one (drawn in the element's chip). */
  elementArt: WikiArt[];
  /** The roles of the game, in its order, as its glossary says them. */
  roles: WikiTerm[];
  /** The creature rarities of the game, in its order; they share one glossary entry. */
  rarities: WikiTerm[];
  currentTalents: WikiCurrentTalent[];
  knacks: WikiKnack[];
  draftTalents: WikiDraftTalent[];
  /** The modifier library, in the order the page shows it. */
  modifiers: WikiModifier[];
  /** The draft talent pool of each creature line. */
  draftPools: { line: string; talents: string[] }[];
  keywords: { name: string; means: string; not: string; step: string }[];
  families: { name: string; text: string }[];
  elements: { id: string; name: string }[];
  elementChart: { attacker: string; defender: string; bp: number }[];
}
