/**
 * Parity for the visitor's two shared rules (phase 5 step 8): the lab's window by hour of the week and its reroll price against the
 * server's rules in `@creatures/game` (the lab imports them, so a change is one edit; this pins that it stays so and that the lab's
 * hour counts from Monday 00:00 as the server's wall clock does).
 */
import { VALLEY_RULES, rerollPrice as gameRerollPrice, visitorHereAt } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { rerollPrice, visitorHere } from '../src/visitor';

const HOUR = 3_600_000;
// Monday 2027-01-04 00:00 UTC.
const MONDAY = Date.UTC(2027, 0, 4);

describe('visitor parity with the server rules', () => {
  it('the lab and the server agree on every hour of two weeks', () => {
    for (let hour = 0; hour < 336; hour++) {
      expect(visitorHere(VALLEY_RULES, hour)).toBe(
        visitorHereAt(VALLEY_RULES, MONDAY + hour * HOUR, 'UTC'),
      );
    }
  });

  it('the lab and the server agree on the reroll price', () => {
    for (const level of [1, 5, 10, 20, 50, 100]) {
      for (let made = 0; made < 6; made++) {
        expect(rerollPrice(VALLEY_RULES, level, made)).toEqual(
          gameRerollPrice(VALLEY_RULES, level, made),
        );
      }
    }
  });
});
