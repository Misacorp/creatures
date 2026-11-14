/**
 * Parity between the lab's honours (`src/honours.ts`) and the game's trials (`@creatures/game`, `valley/trials.ts`) for the boxes the lab
 * models: the combat feat of each trial and the work or mastery box. The lab does not model the bonfire moment (Bronze), "go further"
 * (Silver) or the communal seat (Gold), nor the single-piece smithing routes, so those are ticked or switched off here.
 */
import {
  TRIALS,
  VALLEY_RULES,
  boxMetByHours,
  emptyTrial,
  tick,
  waitsForCeremony,
  type TrialBoxId,
  type TrialState,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { readyForHonour } from '../src/honours';
import { RULES } from '../src/rules';
import type { Creature } from '../src/types';

/** The lab's rules with the routes it does not model switched off. */
const gameRules = {
  ...VALLEY_RULES,
  honours: {
    ...VALLEY_RULES.honours,
    rareRouteSmithHours: Infinity,
    epicRouteSmithHours: Infinity,
  },
};

const labCreature = (c: Partial<Creature>): Creature => ({ level: 1, honour: 0, ...c }) as Creature;

/** The game's answer for a creature at `level` with the lab's counters, as the lab's counters would tick the trial's boxes. */
function gameReady(c: Creature): boolean {
  const events: TrialBoxId[] = [];
  if (c.dungeonClears > 0) events.push('dungeon');
  if (c.undercroftClears > 0) events.push('undercroft');
  if (c.raidClears > 0) events.push('raid');
  if (c.brought) events.push('home');
  // The boxes the lab does not model count as ticked.
  events.push('fire', 'further', 'teacher');
  const hours = { scout: c.scoutHours, smith: c.smithHours, trade: 0, seat: 0 };
  const boxes: TrialBoxId[] = [...events];
  for (const trial of TRIALS) {
    for (const b of trial.boxes) if (boxMetByHours(b.id, hours, gameRules)) boxes.push(b.id);
  }
  let s: TrialState = { ...emptyTrial(), honour: c.honour as 0 | 1 | 2 };
  s = tick(s, c.level, boxes, () => 1, gameRules);
  return waitsForCeremony(s);
}

describe('the lab and the game agree on who is ready for an honour', () => {
  const levels = [9, 10, 19, 20, 29, 30];
  const counts = [0, 1];
  const hours = [0, 23, 24, 100, 167, 168, 503, 504, 900];
  it('over a grid of levels, clears, hours and finds', () => {
    let checked = 0;
    for (const honour of [0, 1, 2] as const) {
      for (const level of levels) {
        for (const dungeonClears of counts) {
          for (const undercroftClears of counts) {
            for (const raidClears of counts) {
              for (const scoutHours of hours) {
                for (const smithHours of [0, 24, 200, 600]) {
                  for (const brought of [false, true]) {
                    const c = labCreature({
                      level,
                      honour,
                      dungeonClears,
                      undercroftClears,
                      raidClears,
                      scoutHours,
                      smithHours,
                      brought,
                    });
                    const lab = readyForHonour(RULES, c);
                    expect(gameReady(c), JSON.stringify(c)).toBe(lab);
                    checked += 1;
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
