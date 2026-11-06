/**
 * The welcome-back Gazette on real output (phase 5 step 4, `docs/design/valley/systems/return.md` V-RET-0 to 7, 4a): the stories of the
 * server's paper (`valley.paper` of `/api/state`, `@creatures/game` `valley/gazette.ts`), as the same `Story` shape the Gazette draws.
 * The server picked and ranked the headlines (the shared ranking, at most three, a longer absence groups more and never grows longer);
 * this module only words them, with the creatures' own names and the valley's places, and draws each one's picture from the creatures that
 * really did it. Pure: no DOM, no clock, no randomness.
 *
 * - **No loss wording** (V-RET-7): nothing says what the away steps cost or what was missed; a full pack "came home full".
 * - **The finds are the real things**: a piece carries its own id, base, rarity and level (its card opens from it), a blueprint its base,
 *   a newcomer its creature (found on the roster; a creature that has since left it is simply not shown).
 * - **The decision** (V-RET-3) is not a story: it is the paper's one choice at the end (`decisionOf`).
 */
import type { Paper, PaperDecision, PaperHeadline } from '@creatures/game';
import type { Creature } from '../../api';
import { creatureName, speciesName } from '../../game';
import { baitCount } from '../../count-items';
import type { CountItem } from '../../ui/CountBadge';
import type { PlaceId } from '../valley-art';
import { masteryName, placeName } from '../signpost-view';
import {
  sceneOf,
  type CastMember,
  type Find,
  type GazettePlan,
  type Story,
  type StoryKind,
} from './stories';

/** The small moments of a resting creature (V-BON-9), told by the day's turn (the server picked who and which turn). */
const MOMENTS: readonly ((n: string) => string)[] = [
  (n) => `${n} fell asleep on the log bench`,
  (n) => `${n} is warming its paws by the fire`,
  (n) => `${n} chased a spark round the fire`,
  (n) => `${n} yawned and stretched`,
];

/** The small moments of two resting creatures together (V-BON-9). */
const PAIR_MOMENTS: readonly ((a: string, b: string) => string)[] = [
  (a, b) => `${a} and ${b} shared the log bench`,
  (a, b) => `${a} and ${b} watched the sparks together`,
  (a, b) => `${a} chased ${b} round the fire`,
];

const honourName = (tier: number): string => ['Bronze', 'Silver', 'Gold'][tier - 1] ?? 'Bronze';
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const num = (n: number): string => String(n);
const upper = (text: string): string => text.toUpperCase();
const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a');

const memberOf = (c: Creature): CastMember => ({
  name: creatureName(c),
  species: c.species,
  shiny: c.shiny,
  level: c.level,
});

/** The welcome line a long absence opens with (V-RET-7), and the paper's note under the date. */
export const LONG_AWAY_HOURS = 72;
export function paperNote(paper: Pick<Paper, 'awayHours'>): string {
  const home = 'Everything your creatures found is already home.';
  return paper.awayHours >= LONG_AWAY_HOURS ? `The valley kept the fire going. ${home}` : home;
}

/** Where each kind of headline happens. */
const PLACE_OF: Record<PaperHeadline['kind'], PlaceId> = {
  'new-species': 'paddock',
  'mastery-scout': 'signpost',
  'mastery-anvil': 'forge',
  'found-gear': 'signpost',
  'found-blueprint': 'signpost',
  'found-pages': 'signpost',
  'forge-pieces': 'forge',
  duplicates: 'paddock',
  'resting-xp': 'bonfire',
  'pack-full': 'signpost',
  allowance: 'bonfire',
  moment: 'bonfire',
  'market-open': 'market',
  visitor: 'visitor',
  graduation: 'school',
};

/** The stories of the server's paper, the biggest first (as the server ranked them), and what it left untold. */
export function gazetteOfPaper(paper: Paper, creatures: readonly Creature[]): GazettePlan {
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const stories = paper.headlines.map((h) => storyOf(h, paper, byId));
  return { stories, more: paper.more };
}

function storyOf(h: PaperHeadline, paper: Paper, byId: ReadonlyMap<string, Creature>): Story {
  const who = h.creatureIds.flatMap((id) => byId.get(id) ?? []);
  const members = who.map(memberOf);
  const first = members[0]?.name ?? null;
  const newcomers: Find[] = h.newcomers.flatMap((id): Find[] => {
    const c = byId.get(id);
    return c === undefined
      ? []
      : [{ kind: 'newcomer', id: c.id, species: c.species, shiny: c.shiny }];
  });
  const items: Find[] = h.items.map((i) => ({
    kind: 'item',
    id: i.id,
    baseId: i.baseId,
    rarity: i.rarity,
    level: i.level,
  }));
  const blueprints: Find[] = h.blueprints.map((baseId) => ({ kind: 'blueprint', baseId }));
  const place = PLACE_OF[h.kind];
  const base = {
    id: h.kind as StoryKind,
    weight: h.weight,
    blurb: '',
    badges: [] as CountItem[],
    count: h.count,
  };
  const scene = (cast: readonly CastMember[]) => sceneOf(place, cast);
  switch (h.kind) {
    case 'new-species': {
      const name = h.species === null ? null : speciesName(h.species);
      const faces = newcomers.flatMap((f) => {
        const c = f.kind === 'newcomer' ? byId.get(f.id) : undefined;
        return c === undefined ? [] : [memberOf(c)];
      });
      return {
        ...base,
        headline:
          h.count === 1
            ? upper(`${name ?? 'A newcomer'} moves in`)
            : `${num(h.count)} NEWCOMERS MOVE IN`,
        finds: newcomers,
        scene: scene(faces.length > 0 ? faces : members),
      };
    }
    case 'mastery-scout':
    case 'mastery-anvil': {
      const step = masteryName(h.step ?? 1);
      const job = h.kind === 'mastery-scout' ? 'scout' : 'smith';
      const names = members.map((m) => m.name);
      return {
        ...base,
        headline:
          names.length === 1
            ? upper(`${names[0] ?? ''} becomes ${article(step)} ${step} ${job}`)
            : upper(`${num(Math.max(2, h.count))} become ${step} ${job}s`),
        finds: [],
        scene: scene(members),
      };
    }
    case 'found-gear': {
      const kind =
        h.rarity === 'epic' ? 'an epic piece' : h.rarity === 'rare' ? 'a rare piece' : 'gear';
      return {
        ...base,
        headline: upper(
          `${first ?? 'A scout'} finds ${h.count > 1 && h.rarity === 'common' ? `${num(h.count)} pieces` : kind}`,
        ),
        blurb: h.count > items.length ? `${num(h.count)} pieces in all.` : '',
        finds: items,
        scene: scene(members),
      };
    }
    case 'found-blueprint':
      return {
        ...base,
        headline: upper(
          `${first ?? 'A scout'} brings home ${h.count === 1 ? 'a blueprint' : `${num(h.count)} blueprints`}`,
        ),
        finds: blueprints,
        scene: scene(members),
      };
    case 'found-pages':
      return {
        ...base,
        headline: upper(
          `${num(h.count)} journal ${plural(h.count, 'page turns', 'pages turn')} up`,
        ),
        blurb: 'They are in the Journal.',
        finds: [],
        scene: scene(members),
      };
    case 'forge-pieces':
      return {
        ...base,
        headline:
          h.rarity === 'common' || h.rarity === null
            ? upper(`${first ?? 'The smith'} at the forge`)
            : upper(
                `${first ?? 'The smith'} makes ${h.rarity === 'epic' ? 'an epic' : 'a rare'} piece`,
              ),
        blurb: h.count > items.length ? `${num(h.count)} pieces in all.` : '',
        finds: items,
        scene: scene(members),
      };
    case 'duplicates':
      return {
        ...base,
        headline: upper(`${num(h.count)} at the Paddock gate`),
        blurb: `${h.count === 1 ? 'It waits' : 'They wait'} for your word.`,
        finds: [],
        scene: scene([]),
      };
    case 'resting-xp':
      return {
        ...base,
        headline: upper(
          members.length > 1
            ? `${first ?? ''} and friends grew by the fire`
            : `${first ?? 'A creature'} grew by the fire`,
        ),
        finds: [],
        scene: scene(members),
      };
    case 'pack-full':
      return {
        ...base,
        headline: upper(
          members.length > 1
            ? 'Full packs came home'
            : `${first ?? 'A scout'}'s pack came home full`,
        ),
        blurb: 'The scouts keep exploring.',
        finds: [],
        scene: scene(members),
      };
    case 'allowance':
      return {
        ...base,
        headline: 'THE ACORNS CAME IN',
        badges: paper.brought.acorns > 0 ? [baitCount(paper.brought.acorns)] : [],
        finds: [],
        scene: scene([]),
      };
    case 'market-open':
      // Q64: the whole server's moment of relief, in the paper's warm voice (no creatures: the stall is the picture).
      return {
        ...base,
        headline: 'THE MARKET OPENS: SHARDS CHANGE HANDS AT LAST',
        blurb: 'Your anvils can trade for what they wait on.',
        finds: [],
        scene: scene([]),
      };
    case 'visitor':
      // V-VIS-1: the weekly visitor is at the crossroads (step 8b draws his stall; the paper only says he is here).
      return {
        ...base,
        headline: 'A VISITOR IS AT THE CROSSROADS',
        blurb: 'They will look over a piece of your gear. They never stay for long.',
        finds: [],
        scene: scene([]),
      };
    case 'graduation':
      // V-TRIAL-4: the School's ceremony is told in the paper, several in one line ("Three of yours graduated at the School").
      return {
        ...base,
        headline: upper(
          h.count === 1
            ? `${first ?? 'One of yours'} graduated at the School`
            : `${num(h.count)} of yours graduated at the School`,
        ),
        blurb: h.step === null ? '' : `${honourName(h.step)} honours.`,
        finds: [],
        scene: scene(members),
      };
    case 'moment': {
      const turn = h.turn ?? 0;
      const second = members[1]?.name;
      const line = MOMENTS[turn % MOMENTS.length];
      const pair = PAIR_MOMENTS[turn % PAIR_MOMENTS.length];
      return {
        ...base,
        headline: upper(
          second !== undefined && pair !== undefined
            ? pair(first ?? 'A creature', second)
            : line === undefined
              ? ''
              : line(first ?? 'A creature'),
        ),
        finds: [],
        scene: scene(members),
      };
    }
  }
}

/** The paper's one choice (V-RET-3), as the Gazette shows it: who, where, the trade-off, and the label of the button. */
export interface Choice {
  seatId: string;
  /** "Mossback found a way deeper into the Ember Caves." */
  text: string;
  /** What deep means (V-SCOUT-6), in the paper's voice. */
  trade: string;
  label: string;
  /** Said when it was taken. */
  taken: string;
}

export function decisionOf(
  decision: PaperDecision | null,
  creatures: readonly Creature[],
): Choice | null {
  if (decision === null) return null;
  const creature = creatures.find((c) => c.id === decision.creatureId);
  if (creature === undefined) return null;
  const name = creatureName(creature);
  const place = placeName(decision.destination);
  return {
    seatId: decision.seatId,
    text: `${name} found a way deeper into ${place}.`,
    trade: 'Deeper it finds rarer things, a little less scrap, and its kit stays behind.',
    label: 'Push on',
    taken: `${name} is deep in ${place}.`,
  };
}
