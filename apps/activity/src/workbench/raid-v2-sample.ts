/**
 * A combat v2 raid week for the workbench pages: the week view the server sends (`rules: 2` and the v2 part) for a track slot, a party of
 * players on its grid and the stage the weekend is at, built from the shipped content and the engine's own targeting (`previewMoves`), so
 * a preset shows what a real week can show. Fixture data only; nothing here calls the API. The card is worked out the way the worker's
 * `raid-v2-card.ts` does it (a small copy, because the Activity never loads the worker).
 */
import { content, dungeonContent } from '@creatures/game';
import { combatV2, knownKnacks, moveLabel } from '@creatures/game/combat-v2';
import {
  createResolver,
  previewMoves,
  startCarry,
  trackBoss,
  type BossDef,
  type FighterSpec,
  type Shipped,
  type StageCarry,
} from '@creatures/engine/v2';
import type { RaidView, RowSlotView } from '../raid-api';
import { placeOfV2 } from '../raid-board-v2';
import type {
  BossCardV2,
  BoardCreatureV2,
  MovePreviewV2,
  OutCreatureV2,
  RaidV2View,
  SwapsV2,
  TrackV2,
} from '../raid-v2-api';
import { SAMPLE_RAID, SPECIES_IDS, speciesLabel } from './data';

const SHIPPED: Shipped = {
  creatures: content.creatures,
  bosses: content.bosses,
  foes: dungeonContent.foes,
};
const resolver = createResolver(combatV2, SHIPPED);

/** The names of the party's players; the first is you. */
export const V2_NAMES: readonly string[] = [
  'You',
  'Mira',
  'Jun',
  'Ann',
  'Bo',
  'Cy',
  'Dee',
  'Eli',
  'Fay',
  'Gus',
  'Hal',
  'Ivy',
  'Joy',
  'Kai',
  'Lou',
];

/** What a preset sets: the track's slot, how wide the party is, how far the weekend has gone and what is waiting. */
export interface V2SampleOptions {
  /** The track's slot (the Boss Rank). */
  slot: number;
  /** The party's players: the board has one column per player. */
  players: number;
  /** Stages played: 0 is before stage 1; after one, the creatures carry HP. */
  stagesPlayed: 0 | 1 | 2;
  /** How many of your creatures stand on the board (0 to 3). */
  mine: number;
  /** Last week's best share of the boss's HP, in basis points (0: the boss has not been here before). */
  bestShareBp: number;
  /** One of your creatures was knocked out in the stage already played: it is out for the weekend. */
  knockedOut: boolean;
  /** The swap requests: none, one you asked, one you were asked, or both. */
  swaps: 'none' | 'asked' | 'incoming' | 'both' | 'settled';
  /** Failed weekends on this boss from the second lap: the bonus they give, in basis points (default 0: none). */
  determinationBp?: number;
}

const BOARD_SPECIES = [
  'splashet',
  'cindle',
  'sproutle',
  'ashmole',
  'tidewing',
  'pyrelynx',
  'thornbuck',
  'voltaro',
  'fogwyrm',
  'magmole',
  'tempestray',
  'ancientshell',
];

const speciesAt = (n: number): string =>
  BOARD_SPECIES[n % BOARD_SPECIES.length] ?? SPECIES_IDS[0] ?? 'splashet';

/** The card of a boss as the worker works it out (`bossCardView` in `raid-v2-card.ts`). */
function cardOf(boss: BossDef, carry: StageCarry | null): BossCardV2 {
  const last = boss.rows - 1;
  const own = new Set(boss.moves.map((m) => m.id));
  const view = (m: BossDef['moves'][number], later: boolean): BossCardV2['moves'][number] => {
    const def = Object.hasOwn(combatV2.moves, m.id) ? combatV2.moves[m.id] : undefined;
    const shape = def?.shape ?? m.pattern.shape;
    const silences = def?.silences ?? m.silenceTurns !== undefined;
    const oneShot = def?.oneShot === true || m.oneShotBp !== undefined;
    const fizzles = def?.fizzles === true || m.fizzles === true;
    return {
      id: m.id,
      name: m.name,
      label: moveLabel({
        shape,
        anchor: def?.anchor ?? m.pattern.anchor,
        silences,
        oneShot,
        fizzles,
      }),
      shape,
      silences,
      oneShot,
      fizzles,
      every: m.every,
      turn: Math.min(m.turn ?? last, last),
      windUp: m.charged === true,
      later,
    };
  };
  const plain = boss.plain.pattern;
  return {
    armour: boss.armour,
    cards: boss.cards.flatMap((id) => {
      const card = Object.hasOwn(combatV2.cards, id) ? combatV2.cards[id] : undefined;
      return card === undefined || card.id === 'plain'
        ? []
        : [{ id: card.id, name: card.name, asks: card.asks }];
    }),
    strengthBp: boss.strengthBp ?? 10_000,
    escalation:
      boss.escalation === undefined
        ? null
        : {
            name: boss.escalation.name,
            cap: boss.escalation.cap,
            step: Math.min(carry?.escalation?.step ?? 0, boss.escalation.cap),
          },
    plain: {
      label: moveLabel({ shape: plain.shape, anchor: plain.anchor, silences: false }),
      shape: plain.shape,
      hits: boss.plain.hits ?? 1,
    },
    moves: [
      ...boss.moves.map((m) => view(m, false)),
      ...(boss.escalation?.phase?.moves ?? [])
        .filter((m) => !own.has(m.id))
        .map((m) => view(m, true)),
    ],
  };
}

/** The lap's five bosses and the one a slot fights. */
export function trackOf(slot: number): TrackV2 {
  const order = combatV2.raidTrack.order;
  return {
    order: order.map((id) => ({ id, name: SHIPPED.bosses.find((b) => b.id === id)?.name ?? id })),
    index: (Math.max(1, slot) - 1) % order.length,
  };
}

interface Standing {
  id: string;
  owner: number;
  species: string;
  level: number;
  slot: number;
  row: number;
  col: number;
}

/** The sample week: the view the screens read, with the board's creatures in their slots. */
export function raidV2Sample(o: V2SampleOptions): { view: RaidView; ownedIds: string[] } {
  const players = Math.max(1, o.players);
  // Before stage 1 the board keeps a spare piece (one more column) free for a newcomer; stage 1 drops it.
  const spare = o.stagesPlayed === 0;
  const cols = Math.max(1, players + (spare ? 1 : 0));
  const boss = trackBoss(combatV2, SHIPPED, o.slot, { players, followSmallParty: true });
  const rows = boss.rows;
  const standing: Standing[] = [];
  const place = (
    id: string,
    owner: number,
    species: string,
    level: number,
    row: number,
    col: number,
  ): void => {
    standing.push({ id, owner, species, level, slot: col * rows + row, row, col });
  };
  // You stand in the first lane; every other player takes the next lane, one creature to a row.
  const out: OutCreatureV2[] = [];
  for (let r = 0; r < Math.min(3, o.mine, rows); r++) {
    const id = `mine-${String(r)}`;
    const species = speciesAt(r * 4 + 1);
    if (o.knockedOut && r === 1) {
      out.push({ creatureId: id, species, name: speciesLabel(species), owner: 'You', mine: true });
    } else place(id, 0, species, 14 + r * 3, r, 0);
  }
  for (let p = 1; p < players; p++) {
    for (let r = 0; r < Math.min(3, rows); r++) {
      const species = speciesAt(p * 3 + r * 5 + 2);
      place(`other-${String(p)}-${String(r)}`, p, species, 9 + ((p * 5 + r * 3) % 14), r, p);
    }
  }
  const fighters: FighterSpec[] = standing.map((c, i) => {
    const knack = knownKnacks(c.species)[0];
    return {
      ...resolver.resolve({
        owner: `p${String(c.owner)}`,
        formId: c.species,
        level: c.level,
        ...(knack === undefined ? {} : { knack }),
        talents: [],
        row: c.row,
        col: c.col,
      }),
      uid: c.id,
      key: c.id,
      name: `${c.species}-${String(i)}`,
    };
  });
  // After a stage, every creature that stands carries HP: the further the weekend, the lower, a little different for each.
  const carried = o.stagesPlayed > 0;
  const hp: Record<string, number> = {};
  if (carried) {
    fighters.forEach((f, i) => {
      hp[f.key ?? f.uid] = Math.max(
        1,
        Math.round((f.maxHp * (100 - 12 * o.stagesPlayed - ((i * 17) % 45))) / 100),
      );
    });
  }
  const carry: StageCarry | null = carried
    ? {
        ...startCarry(boss),
        stage: o.stagesPlayed,
        bossHp: Math.round(boss.hp * (o.stagesPlayed === 1 ? 0.62 : 0.28)),
        shadowHp: Math.round(boss.hp * (o.stagesPlayed === 1 ? 0.62 : 0.28)),
        hp,
        out: out.map((c) => c.creatureId),
        ...(boss.escalation === undefined
          ? {}
          : { escalation: { step: o.stagesPlayed, phase: false, count: o.stagesPlayed } }),
      }
    : null;
  const raw =
    fighters.length === 0
      ? null
      : previewMoves(
          {
            version: 2,
            rules: combatV2.rules,
            elements: content.elements.map((e) => e.id),
            chart: content.elementChart,
            boss,
            fighters,
            options: {},
          },
          carry ?? startCarry(boss),
        );
  const slotOf = new Map(standing.map((c) => [c.id, c.slot]));
  const preview: MovePreviewV2 | null =
    raw === null
      ? null
      : {
          plain: raw.plain === null ? null : (slotOf.get(raw.plain) ?? null),
          moves: Object.fromEntries(
            Object.entries(raw.moves).map(([id, keys]) => [
              id,
              keys === null ? null : keys.flatMap((k) => slotOf.get(k) ?? []),
            ]),
          ),
        };
  const length = rows * cols;
  const cells: RowSlotView[] = Array.from({ length }, (_, slot) => {
    const { row } = placeOfV2(slot, { rows, cols });
    return {
      slot,
      zone: row === 0 ? 'front' : row === rows - 1 ? 'back' : 'middle',
      creature: null,
    };
  });
  const board: BoardCreatureV2[] = [];
  for (const c of standing) {
    const cell = cells[c.slot];
    if (cell === undefined) continue;
    const mine = c.owner === 0;
    cell.creature = {
      ownerName: V2_NAMES[c.owner] ?? 'Someone',
      species: c.species,
      name: speciesLabel(c.species),
      level: c.level,
      mine,
      ...(mine ? { creatureId: c.id } : {}),
    };
    const knack = knownKnacks(c.species)[0] ?? null;
    board.push({
      creatureId: c.id,
      slot: c.slot,
      row: c.row,
      col: c.col,
      hp: carried ? (hp[c.id] ?? null) : null,
      hpMax: fighters.find((f) => f.key === c.id)?.maxHp ?? null,
      knack,
      knackName: knack === null ? null : (combatV2.knacks[knack]?.name ?? null),
    });
  }
  const swaps = swapsOf(o.swaps, standing);
  const mineOnBoard = standing.filter((c) => c.owner === 0);
  const hpMax = boss.hp;
  const hpNow = carry?.bossHp ?? hpMax;
  const v2: RaidV2View = {
    slot: o.slot,
    bestShareBp: o.bestShareBp,
    failedWeekends: 0,
    determinationBp: o.determinationBp ?? 0,
    stagesPlayed: o.stagesPlayed,
    nextStage: o.stagesPlayed + 1,
    joiningOpen: o.stagesPlayed === 0,
    rows,
    cols,
    // One player's piece is one column of the boss's rows.
    seats: rows,
    spare,
    players,
    card: cardOf(boss, carry),
    track: trackOf(o.slot),
    preview,
    out,
    creatures: board,
    swaps,
  };
  const view: RaidView = {
    ...SAMPLE_RAID,
    rules: 2,
    v2,
    status: o.stagesPlayed === 0 ? 'open' : 'phase1',
    boss: {
      ...SAMPLE_RAID.boss,
      id: boss.id,
      name: boss.name,
      element: boss.element,
      turnOrder: '',
      gimmicks: [],
    },
    rank: o.slot,
    effectiveRank: o.slot,
    festival: false,
    festivalCreature: null,
    you: {
      ...SAMPLE_RAID.you,
      inRoster: o.mine > 0,
      canEdit: true,
      team: {
        creatures: mineOnBoard.map((c) => ({
          creatureId: c.id,
          species: c.species,
          name: speciesLabel(c.species),
          level: c.level,
          slot: c.slot,
        })),
      },
    },
    party: {
      party: 1,
      rowLength: length,
      row: cells,
      guests: false,
      bossHp: { max: hpMax, current: hpNow },
      adaptation: null,
      results: [],
      readiness: null,
    },
  };
  return {
    view,
    ownedIds: [
      ...mineOnBoard.map((c) => c.id),
      ...out.map((c) => c.creatureId),
      'mine-spare-0',
      'mine-spare-1',
    ],
  };
}

/** The swap requests a preset has: one you asked of the player beside you, one they asked of you. */
function swapsOf(kind: V2SampleOptions['swaps'], standing: readonly Standing[]): SwapsV2 {
  const mine = standing.find((c) => c.owner === 0);
  const theirs = standing.find((c) => c.owner === 1);
  if (mine === undefined || theirs === undefined || kind === 'none') {
    return { incoming: [], outgoing: [], settled: [] };
  }
  const line = (c: Standing) => ({
    species: c.species,
    name: speciesLabel(c.species),
    level: c.level,
  });
  const ask = {
    id: '00000000-0000-4000-8000-000000000001',
    from: 'You',
    to: V2_NAMES[1] ?? 'Mira',
    slotA: mine.slot,
    slotB: theirs.slot,
    creatureA: line(mine),
    creatureB: line(theirs),
    createdAt: 1,
  };
  const asked = {
    id: '00000000-0000-4000-8000-000000000002',
    from: V2_NAMES[1] ?? 'Mira',
    to: 'You',
    slotA: theirs.slot,
    slotB: mine.slot,
    creatureA: line(theirs),
    creatureB: line(mine),
    createdAt: 2,
  };
  return {
    outgoing: kind === 'asked' || kind === 'both' ? [ask] : [],
    incoming: kind === 'incoming' || kind === 'both' ? [asked] : [],
    settled: kind === 'settled' ? [{ ...ask, status: 'accepted' as const }] : [],
  };
}
