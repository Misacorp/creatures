/**
 * The lab's player and patchwork pieces (V-FORGE-12): an anvil that would tinker (the team needs nothing, or its shard is short) is given
 * a patchwork order instead, from the pile held most, from spare scrap and shards only; the piece is Common or Rare, rolls fewer lines,
 * and was never counted among the team's pieces on their way.
 */
import { patchworkBlueprints, patchworkRolledLines } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { collectFloor, equipOrBag, stepAnvils } from '../src/forge';
import { profileById } from '../src/profiles';
import { RULES } from '../src/rules';
import { ALL_SERVERS } from '../src/servers';
import { R } from '../src/types';
import { addCreature, createPlayer, createServer } from '../src/world';

const found = ALL_SERVERS.find((s) => s.id === 'mixed8');
if (!found) throw new Error('no mixed8 server');
const BLUEPRINTS = patchworkBlueprints();

/** One anvil with a smith, and a team with nothing to be dressed (so the anvil would tinker). */
function lab(options: {
  patchwork?: boolean;
  scrap: number;
  shards: number[];
  creatures?: number;
}) {
  const p = createPlayer(RULES, 'patchwork', 1, 0, profileById('daily'), 4);
  const server = createServer(
    'patchwork',
    1,
    {
      bossKills: found!.bossKills,
      communalSeats: found!.communalSeats,
      shardExchange: true,
      patchwork: options.patchwork ?? true,
    },
    RULES,
  );
  addCreature(p, 0);
  p.anvils.push({ working: false, progress: 0, need: 0, element: 0, rarity: 0, mastery: 0 });
  p.anvilOcc.push(0);
  p.stock[R.scrap] = options.scrap;
  options.shards.forEach((n, e) => {
    p.shards[e] = n;
  });
  p.stock[R.shards] = options.shards.reduce((a, b) => a + b, 0);
  p.weakByElement.fill(0);
  return { p, server };
}

const keep = (creatures: number): number =>
  Math.max(
    RULES.forge.giveReserveScrap,
    creatures * RULES.forge.slotsPerCreature * RULES.forge.scrap,
  );

describe('the lab orders patchwork pieces when an anvil would tinker', () => {
  it('makes a piece from the pile held most, in turn Hat, Scarf, Charm, paying the content’s price', () => {
    const first = BLUEPRINTS[0]!;
    const { p, server } = lab({ scrap: 10_000, shards: [10, 40, 20, 0, 0] });
    const scrap0 = p.stock[R.scrap] ?? 0;
    stepAnvils(p, 1, 1, server);
    expect(p.anvils[0]?.working).toBe(true);
    expect(p.anvils[0]?.patch).toBe(true);
    expect(p.anvils[0]?.element).toBe(1);
    expect(p.shards[1]).toBe(40 - first.shards);
    expect(p.stock[R.scrap]).toBe(scrap0 - first.scrap);
    expect(p.patchCursor).toBe(1);
    // It runs for a plain piece's hours, then a floor piece comes out marked patchwork, and the next blueprint is ordered.
    for (let h = 0; h < 40; h++) stepAnvils(p, 1, 1, server);
    expect(p.wk.patchMade).toBeGreaterThanOrEqual(1);
    expect(p.floor[0]?.patch).toBe(true);
    expect(p.wk.forge[4]).toBe(0);
  });

  it('keeps what is not spare: scrap for dressing the whole team, and the exchange’s shards', () => {
    const first = BLUEPRINTS[0]!;
    const need = keep(1) + first.scrap;
    const short = lab({ scrap: need - 1, shards: [0, 100, 0, 0, 0] });
    stepAnvils(short.p, 1, 1, short.server);
    expect(short.p.anvils[0]?.working).toBe(false);
    expect(short.p.wk.forge[4]).toBe(1);
    const enough = lab({ scrap: need, shards: [0, 100, 0, 0, 0] });
    stepAnvils(enough.p, 1, 1, enough.server);
    expect(enough.p.anvils[0]?.working).toBe(true);
    // The shards: the pile must hold the price and the reserve.
    const reserve = RULES.forge.giveReserveShards;
    const thin = lab({ scrap: 10_000, shards: [0, first.shards + reserve - 1, 0, 0, 0] });
    stepAnvils(thin.p, 1, 1, thin.server);
    expect(thin.p.anvils[0]?.working).toBe(false);
    const stocked = lab({ scrap: 10_000, shards: [0, first.shards + reserve, 0, 0, 0] });
    stepAnvils(stocked.p, 1, 1, stocked.server);
    expect(stocked.p.anvils[0]?.working).toBe(true);
  });

  it('does nothing when the server has no patchwork pieces (the "before")', () => {
    const { p, server } = lab({ patchwork: false, scrap: 10_000, shards: [0, 100, 0, 0, 0] });
    for (let h = 0; h < 48; h++) stepAnvils(p, 1, 1, server);
    expect(p.wk.patchMade).toBe(0);
    expect(p.wk.piecesMade).toBe(0);
    expect(p.anvils[0]?.working).toBe(false);
  });

  it('leaves a team piece alone: a team that needs dressing comes before patchwork', () => {
    const { p, server } = lab({ scrap: 10_000, shards: [0, 100, 0, 0, 0] });
    p.weakByElement[1] = 3;
    stepAnvils(p, 1, 1, server);
    expect(p.anvils[0]?.working).toBe(true);
    expect(p.anvils[0]?.patch).toBe(false);
    expect(p.pendingByElement[1]).toBe(1);
  });

  it('never makes better than Rare, and a patchwork piece worn rolls fewer lines than the rarity gives', () => {
    const { p, server } = lab({ scrap: 1_000_000, shards: [1_000_000, 0, 0, 0, 0] });
    // A loupe-less anvil still has a 2% Epic draw: over many pieces none is Epic.
    let epics = 0;
    for (let h = 0; h < 24 * 400; h++) {
      stepAnvils(p, 1, 1, server);
      p.floor = p.floor.filter((piece) => {
        if (piece.rarity === 2) epics += 1;
        return false;
      });
    }
    expect(p.wk.patchMade).toBeGreaterThan(300);
    expect(epics).toBe(0);
    // A Rare patchwork piece on a weak slot of its element keeps patchworkRolledLines('rare') lines, a Common one none.
    const c = p.creatures[0]!;
    c.gear.fill(0);
    expect(equipOrBag(p, { ilvl: 5, rarity: 1, element: c.element, patch: true }, 10)).toBe(true);
    expect(c.gearLines.some((l) => l.length === patchworkRolledLines('rare'))).toBe(true);
    c.gear.fill(0);
    equipOrBag(p, { ilvl: 5, rarity: 0, element: c.element, patch: true }, 10);
    expect(c.gearLines.some((l) => l.length === 0)).toBe(true);
  });

  it('does not unbalance the team’s pieces on their way when one comes home', () => {
    const { p, server } = lab({ scrap: 10_000, shards: [0, 100, 0, 0, 0] });
    p.pendingByElement[1] = 2;
    p.floor = [{ ilvl: 3, rarity: 0, element: 1, patch: true }];
    collectFloor(p, server);
    expect(p.floor).toHaveLength(0);
    expect(p.pendingByElement[1]).toBe(2);
    p.floor = [{ ilvl: 3, rarity: 0, element: 1 }];
    collectFloor(p, server);
    expect(p.pendingByElement[1]).toBe(1);
  });
});
