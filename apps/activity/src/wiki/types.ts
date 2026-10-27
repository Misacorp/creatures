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
  /** The forms this one evolves into (one or two). */
  evolvesTo: string[];
  festival: boolean;
  flavor: string;
  /** Its finale ability in the game today. */
  ability: { name: string; description: string } | null;
  /** Ids of the talents in the game today that it can have (its line's pool and signature). */
  talents: string[];
  /** Ids of the combat v2 draft Knacks it can equip. */
  knacks: string[];
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
  /** The draft talent pool of each creature line. */
  draftPools: { line: string; talents: string[] }[];
  keywords: { name: string; means: string; not: string; step: string }[];
  families: { name: string; text: string }[];
  elements: { id: string; name: string }[];
  elementChart: { attacker: string; defender: string; bp: number }[];
}
