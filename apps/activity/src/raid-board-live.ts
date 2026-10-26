/**
 * The live raid board's message (`docs/design/raid-live-board.md`): what one teammate's placement changed
 * on the shown board. `parseBoardPush` checks it strictly (exact keys, sizes, types); `applyBoardPush`
 * puts it into the raid view in place, or says it cannot (an unknown slot, another party, another row
 * length, a cell of yours that the push disagrees with): the caller then reloads the view once.
 */
import { isGuardReach, isInt, isRecord } from './parse-core';
import type { RaidView, RowSlotView } from './raid-api';

/** A cell a teammate's creature fills (never one of yours: no creature id, `mine` is false). */
export type PushedCreature = Omit<NonNullable<RowSlotView['creature']>, 'creatureId' | 'mine'> & {
  mine: false;
};

export interface BoardPush {
  week: string;
  party: number;
  cells: { slot: number; creature: PushedCreature | null }[];
  rowLength?: number;
  member?: { displayName: string; joined: boolean };
}

const KEYS = new Set(['v', 'type', 'week', 'party', 'cells', 'rowLength', 'member']);
const CELL_KEYS = new Set(['slot', 'creature']);
const CREATURE_KEYS = new Set(['ownerName', 'species', 'name', 'level', 'mine', 'reach']);
const MAX_CELLS = 8;
const MAX_TEXT = 100;

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT;
const onlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean =>
  Object.keys(value).every((key) => allowed.has(key));

function parseCreature(value: unknown): PushedCreature | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !onlyKeys(value, CREATURE_KEYS)) return undefined;
  const { ownerName, species, name, level, mine, reach } = value;
  if (!isText(ownerName) || !isText(species) || !isText(name)) return undefined;
  if (!isInt(level) || level < 1 || level > 999 || mine !== false) return undefined;
  if (reach !== undefined && !isGuardReach(reach)) return undefined;
  return {
    ownerName,
    species,
    name,
    level,
    mine: false,
    ...(reach === undefined ? {} : { reach }),
  };
}

/** The pushed `raid` message of a live socket, or null when it is not exactly what the server sends. */
export function parseBoardPush(data: unknown): BoardPush | null {
  if (!isRecord(data) || !onlyKeys(data, KEYS)) return null;
  const { week, party, cells, rowLength, member } = data;
  if (typeof week !== 'string' || !/^\d{4}-W\d{2}$/.test(week)) return null;
  if (!isInt(party) || party < 1 || party > 999) return null;
  if (!Array.isArray(cells) || cells.length === 0 || cells.length > MAX_CELLS) return null;
  const parsed: BoardPush['cells'] = [];
  for (const cell of cells as unknown[]) {
    if (!isRecord(cell) || !onlyKeys(cell, CELL_KEYS) || !('creature' in cell)) return null;
    const slot = cell['slot'];
    const creature = parseCreature(cell['creature']);
    if (!isInt(slot) || slot < 0 || slot > 999 || creature === undefined) return null;
    parsed.push({ slot, creature });
  }
  if (new Set(parsed.map((c) => c.slot)).size !== parsed.length) return null;
  if (rowLength !== undefined && (!isInt(rowLength) || rowLength < 1 || rowLength > 999)) {
    return null;
  }
  let parsedMember: BoardPush['member'];
  if (member !== undefined) {
    if (
      !isRecord(member) ||
      !onlyKeys(member, new Set(['displayName', 'joined'])) ||
      !isText(member['displayName']) ||
      typeof member['joined'] !== 'boolean'
    ) {
      return null;
    }
    parsedMember = { displayName: member['displayName'], joined: member['joined'] };
  }
  return {
    week,
    party,
    cells: parsed,
    ...(rowLength === undefined ? {} : { rowLength }),
    ...(parsedMember === undefined ? {} : { member: parsedMember }),
  };
}

/** Roster and party sizes after somebody joined or left, or null when the view cannot take it. */
function withMember(
  view: RaidView,
  party: number,
  member: NonNullable<BoardPush['member']>,
): Pick<RaidView, 'roster' | 'parties'> | null {
  const { displayName, joined } = member;
  if (joined) {
    // The roster is ordered by party, then by when each joined: a newcomer goes after their party.
    let at = view.roster.length;
    while (at > 0 && (view.roster[at - 1]?.party ?? 0) > party) at--;
    const roster = [...view.roster];
    roster.splice(at, 0, { displayName, you: false, party });
    const known = view.parties.some((p) => p.party === party);
    const parties = known
      ? view.parties.map((p) => (p.party === party ? { ...p, size: p.size + 1 } : p))
      : [...view.parties, { party, size: 1 }].sort((a, b) => a.party - b.party);
    return { roster, parties };
  }
  const index = view.roster.findIndex(
    (r) => !r.you && r.party === party && r.displayName === displayName,
  );
  const entry = view.parties.find((p) => p.party === party);
  if (index < 0 || entry === undefined) return null;
  return {
    roster: view.roster.filter((_, i) => i !== index),
    parties: view.parties.flatMap((p) =>
      p.party !== party ? [p] : p.size > 1 ? [{ ...p, size: p.size - 1 }] : [],
    ),
  };
}

/**
 * The view with the push applied, or null when it cannot be applied to what is shown (it is for another
 * week or party, the row has another length, a slot does not exist, or it would overwrite one of your own
 * creatures: the screen is stale). The caller then loads the view again.
 */
export function applyBoardPush(view: RaidView, push: BoardPush): RaidView | null {
  const shown = view.party;
  if (shown === null || push.week !== view.weekId || push.party !== shown.party) return null;
  if (push.rowLength !== undefined && push.rowLength !== shown.rowLength) return null;
  const row = [...shown.row];
  for (const { slot, creature } of push.cells) {
    const current = row[slot];
    if (current === undefined || current.slot !== slot || current.creature?.mine === true) {
      return null;
    }
    row[slot] = { ...current, creature };
  }
  const members = push.member === undefined ? null : withMember(view, push.party, push.member);
  if (push.member !== undefined && members === null) return null;
  return { ...view, ...(members ?? {}), party: { ...shown, row } };
}
