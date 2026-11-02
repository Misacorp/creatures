/**
 * What the Activity reads of combat v2 on a creature (docs/design/combat/integration.md, sections 2 and 9): the
 * saved Knack, the Knacks it knows, its v2 talents (slots and the line's Talent Book) and its v2 numbers. The server
 * sends them only with the `COMBAT_V2` flag on (staging); a creature without them is drawn exactly as before. Every
 * name and sentence is the server's, drawn as text. Parsing is strict like the rest of `api.ts`.
 */
import type { Creature } from './api';
import { isArrayOf, isBool, isCount, isInt, isNullableStr, isRecord, isStr } from './parse-core';
import type { TalentView } from './talent-types';

/** A Knack: its name, its family and its plain text (keywords in braces, `{Mark}`). */
export interface KnackView {
  id: string;
  name: string;
  family: string;
  text: string;
}

/** A v2 talent: golden is shown as golden; `idle` means it does nothing for this creature's role. */
export interface TalentV2 {
  id: string;
  name: string;
  text: string;
  golden: boolean;
  idle: boolean;
}

export interface TalentSlotV2 {
  slot: number;
  opensAt: number;
  open: boolean;
  talent: TalentV2 | null;
}

/** A talent of the line's book: learned by this creature or not, and the slot it sits in. */
export type BookTalentV2 = TalentV2 & { learned: boolean; slot: number | null };

export interface CreatureTalentsV2 {
  slots: TalentSlotV2[];
  /** The line's book in the order of its pool. */
  book: BookTalentV2[];
  /** What learning a talent costs, in Bait, once per creature. */
  learnBait: number;
}

/** The creature's fight numbers under v2 (`creature-v2.ts` of the worker): crit chance and multiplier in basis points. */
export interface StatsV2 {
  hp: number;
  atk: number;
  spd: number;
  armour: number;
  critChanceBp: number;
  critMultBp: number;
}

/** The v2 part of a creature, as the page reads it. */
export interface CreatureV2 {
  knack: string | null;
  knownKnacks: KnackView[];
  talentsV2: CreatureTalentsV2;
  statsV2: StatsV2;
}

const isKnack = (value: unknown): value is KnackView =>
  isRecord(value) &&
  isStr(value['id']) &&
  isStr(value['name']) &&
  isStr(value['family']) &&
  isStr(value['text']);

const isTalentV2 = (value: unknown): value is TalentV2 =>
  isRecord(value) &&
  isStr(value['id']) &&
  isStr(value['name']) &&
  isStr(value['text']) &&
  isBool(value['golden']) &&
  isBool(value['idle']);

const isSlotV2 = (value: unknown): value is TalentSlotV2 =>
  isRecord(value) &&
  isCount(value['slot']) &&
  isCount(value['opensAt']) &&
  isBool(value['open']) &&
  (value['talent'] === null || isTalentV2(value['talent']));

const isBookTalentV2 = (value: unknown): value is BookTalentV2 =>
  isRecord(value) &&
  isTalentV2(value) &&
  isBool(value['learned']) &&
  (value['slot'] === null || isCount(value['slot']));

const isTalentsV2 = (value: unknown): value is CreatureTalentsV2 =>
  isRecord(value) &&
  isArrayOf(value['slots'], isSlotV2) &&
  isArrayOf(value['book'], isBookTalentV2) &&
  isCount(value['learnBait']);

const isStatsV2 = (value: unknown): value is StatsV2 =>
  isRecord(value) &&
  ['hp', 'atk', 'spd', 'armour', 'critChanceBp', 'critMultBp'].every((k) => isInt(value[k]));

/**
 * Whether a creature object of the state carries the v2 fields right: all four (flag on) or none (flag off).
 * Anything between is a server we cannot read, so the whole state is refused like any odd shape.
 */
export function isCreatureV2Part(value: Record<string, unknown>): boolean {
  const keys = ['knack', 'knownKnacks', 'talentsV2', 'statsV2'];
  if (keys.every((k) => value[k] === undefined)) return true;
  return (
    isNullableStr(value['knack']) &&
    isArrayOf(value['knownKnacks'], isKnack) &&
    isTalentsV2(value['talentsV2']) &&
    isStatsV2(value['statsV2'])
  );
}

/** The v2 part of a creature, or null when the server sent none (the flag is off): the screens' one switch. */
export function creatureV2(creature: Creature): CreatureV2 | null {
  if (
    creature.knack === undefined ||
    creature.knownKnacks === undefined ||
    creature.talentsV2 === undefined ||
    creature.statsV2 === undefined
  ) {
    return null;
  }
  return {
    knack: creature.knack,
    knownKnacks: creature.knownKnacks,
    talentsV2: creature.talentsV2,
    statsV2: creature.statsV2,
  };
}

/** The Knack a creature has saved, if it still knows it. */
export function savedKnack(v2: CreatureV2): KnackView | null {
  return v2.knownKnacks.find((k) => k.id === v2.knack) ?? null;
}

/** A piece of a text with keywords: plain words, or a keyword (a word in braces in the source). */
export interface TextPart {
  keyword: boolean;
  text: string;
}

/**
 * Splits a Knack's or talent's text at its keywords (`{Mark}` becomes a keyword part "Mark"). The loader of the
 * content refuses a text whose braced word is not one of `combatV2.keywords`, so every braced word is a keyword and the
 * client needs no list. The parts joined, with braces back on the keywords, are the original text.
 */
export function textParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let rest = text;
  for (;;) {
    const open = rest.indexOf('{');
    const close = open === -1 ? -1 : rest.indexOf('}', open);
    if (open === -1 || close === -1) break;
    if (open > 0) parts.push({ keyword: false, text: rest.slice(0, open) });
    parts.push({ keyword: true, text: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  if (rest !== '') parts.push({ keyword: false, text: rest });
  return parts;
}

/**
 * The parts a chip text is drawn from: `textParts`, with the letters that run straight on after a keyword
 * ("{Spend}s", "{Crit}s") taken into its chip, so the chip reads "Spends" and no lone "s" follows it.
 */
export function chipParts(text: string): TextPart[] {
  const parts = textParts(text);
  const out: TextPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (!part.keyword && last?.keyword === true) {
      const tail = /^[a-z]+/.exec(part.text)?.[0] ?? '';
      if (tail !== '') {
        out[out.length - 1] = { keyword: true, text: last.text + tail };
        if (part.text.length > tail.length)
          out.push({ keyword: false, text: part.text.slice(tail.length) });
        continue;
      }
    }
    out.push(part);
  }
  return out;
}

/** The text without its braces, for a label read aloud. */
export function plainText(text: string): string {
  return textParts(text)
    .map((p) => p.text)
    .join('');
}

/** `value` with up to two decimals and no trailing zeros ("3", "2.1", "0.25"). */
function trimmed(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Crit chance in basis points: "17%", "8.5%". */
export function critChanceText(bp: number): string {
  return `${trimmed(bp / 100)}%`;
}

/** Crit multiplier in basis points, the game's way ("3x", "2.1x"). */
export function critMultText(bp: number): string {
  return `${trimmed(bp / 10_000)}x`;
}

/** The crit row's value: the chance and the multiplier (R7.1), "17% · 3x". */
export function critText(stats: Pick<StatsV2, 'critChanceBp' | 'critMultBp'>): string {
  return `${critChanceText(stats.critChanceBp)} · ${critMultText(stats.critMultBp)}`;
}

/** A v2 talent as the shared talent parts (`TalentChip`, a slot) read it: no extra sentence. */
export function talentViewOf(talent: TalentV2): TalentView {
  return {
    id: talent.id,
    name: talent.name,
    golden: talent.golden,
    text: talent.text,
    about: '',
    idle: talent.idle,
  };
}
