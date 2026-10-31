import { note } from './journey';
import type { Rules } from './rules';
import type { Player, Server } from './types';
import { R } from './types';
import { debit } from './world';

/**
 * The idol (`rules.idol`; a PLACEHOLDER, voluntary scrap sink, Misa 2026-11-01): a shrine in the valley where players can offer scrap, in
 * batches of 100, without limit; nothing is taken unless a player chooses to offer, and nothing comes back in the lab. A player who
 * looks at their pile at a visit offers some batches from the scrap above a generous reserve, so the offering never uses scrap that pieces,
 * gifts or the visitor would have used. It is where the late-season pile can go until real scrap uses are designed.
 */

/** Whether the idol is in the valley (the server's switch, else the rules' default). */
export const idolOn = (server: Server, rules: Rules): boolean =>
  server.config.idol ?? rules.idol.on;

/**
 * The scrap a player keeps: `reserveWeeks` weeks of their own spending (the mean of the last `lookbackWeeks` finished weeks, without
 * what they offered the idol), and never under `minReserve`.
 */
export function idolReserve(p: Player): number {
  const rules = p.rules.idol;
  const recent = p.weeks.slice(-rules.lookbackWeeks);
  const spent = recent.length
    ? recent.reduce((a, w) => a + (w.out[R.scrap] ?? 0) - w.idolScrap, 0) / recent.length
    : 0;
  return Math.max(rules.minReserve, rules.reserveWeeks * spent);
}

/**
 * A visit's offering (a player's choice, made last, after everything that has a use): whole batches of `rules.idol.batch` from the scrap
 * above the reserve, as many as the player is willing to tap at a visit (`maxBatches`, by policy). Returns the scrap offered.
 */
export function offerToIdol(p: Player, server: Server): number {
  const rules = p.rules.idol;
  if (!idolOn(server, p.rules)) return 0;
  const reserve = idolReserve(p);
  const spare = (p.stock[R.scrap] ?? 0) - reserve;
  const most =
    p.policy === 'optimiser' ? rules.maxBatches.optimiser : rules.maxBatches.setAndForget;
  const batches = Math.min(most, Math.floor(spare / rules.batch));
  if (batches < 1) return 0;
  const scrap = batches * rules.batch;
  debit(p, R.scrap, scrap, 'idol');
  p.wk.idolScrap += scrap;
  p.wk.idolBatches += batches;
  note(
    p,
    `idol: offered ${batches} batches of ${rules.batch} scrap (${scrap}; ${Math.round(reserve)} kept back)`,
  );
  return scrap;
}
