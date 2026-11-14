/**
 * Dev tools that give a player what the game gives: Bait and Essence, creature experience, a combat v2 talent in the Talent
 * Book and a saved Knack (staging only; see `dev-tools.ts`). Each runs inside the tool's one transaction and acts on
 * `ctx.userId`, which is the target player when the body named one. They go through the game's own functions (`credit`,
 * `awardExperience`, the Talent Book's store, the Knack column the Knack route writes), so the ledger stays append-only,
 * levels stop at ribbons and the Knack rule (the form must know it) holds.
 */
import { slotOpensAt } from '@creatures/game';
import { knownKnacks, v2Pool } from '@creatures/game/combat-v2';
import type * as v from 'valibot';
import { DevError, ownCreature, type ToolCtx } from './dev-context';
import { awardExperience } from './creature-exp';
import type {
  GrantCurrencyBodySchema,
  GrantTalentBodySchema,
  GrantXpBodySchema,
  SetKnackBodySchema,
} from './dev-schemas';
import { credit, getBalances } from './ledger';
import { speciesOf } from './species';
import { learnTalent, recordFound, setTalentSlot } from './talent-v2-store';

type Body<S extends v.GenericSchema> = v.InferOutput<S>;

/** Adds Bait and/or Essence to the balance (never negative: only credits), through the ledger as source `dev`. */
export function grantCurrency(ctx: ToolCtx, body: Body<typeof GrantCurrencyBodySchema>) {
  for (const currency of ['bait', 'essence'] as const) {
    const amount = body[currency];
    if (amount === undefined) continue;
    credit(
      ctx.storage,
      {
        userId: ctx.userId,
        currency,
        amount,
        source: 'dev',
        idempotencyKey: `dev:${crypto.randomUUID()}`,
      },
      ctx.now,
    );
  }
  return { balances: getBalances(ctx.sql, ctx.userId) };
}

/**
 * Pays experience to one creature or to all the player's creatures through `awardExperience` (levels while the way is open,
 * banks the rest at a ribbon or an evolution). No analytics event: a dev grant is not play.
 */
export function grantXp(ctx: ToolCtx, body: Body<typeof GrantXpBodySchema>) {
  const ids =
    'all' in body
      ? ctx.sql
          .exec<{ id: string }>(
            'SELECT id FROM creatures WHERE user_id = ? ORDER BY id',
            ctx.userId,
          )
          .toArray()
          .map((r) => r.id)
      : [ownCreature(ctx, body.creatureId).id];
  let levelsGained = 0;
  for (const id of ids) {
    const view = awardExperience(ctx.sql, undefined, ctx.userId, id, body.amount, 'trip', false);
    if (view !== null) levelsGained += view.level - view.levelBefore;
  }
  ctx.raid.invalidateReadiness();
  return { creatures: ids.length, amount: body.amount, levelsGained };
}

/**
 * Puts a talent of the creature's line pool in the line's Talent Book and has the creature learn it (the Book's own steps, no
 * Bait), and slots it when a slot is asked for and open at the creature's level. A talent of another line is refused.
 */
export function grantTalent(ctx: ToolCtx, body: Body<typeof GrantTalentBodySchema>) {
  if (!ctx.combatV2) throw new DevError(404, 'not_found');
  const row = ownCreature(ctx, body.creatureId);
  if (!v2Pool(row.line).includes(body.talentId)) throw new DevError(400, 'wrong_line');
  if (body.slot !== undefined) {
    const opens = slotOpensAt(speciesOf(row.species).rarity, body.slot);
    if (opens === null || row.level < opens) throw new DevError(409, 'slot_closed');
  }
  recordFound(ctx.sql, ctx.userId, row.line, { talentId: body.talentId, golden: false }, ctx.now);
  const learned = learnTalent(ctx.sql, row.id, body.talentId, ctx.now);
  if (body.slot !== undefined) setTalentSlot(ctx.sql, row.id, body.talentId, body.slot);
  ctx.raid.invalidateReadiness();
  return { creatureId: row.id, talentId: body.talentId, learned, slot: body.slot ?? null };
}

/** Saves a creature's Knack (one its form knows) or none. Staging with `COMBAT_V2` on only, as the Knack route is. */
export function setKnack(ctx: ToolCtx, body: Body<typeof SetKnackBodySchema>) {
  if (!ctx.combatV2) throw new DevError(404, 'not_found');
  const row = ownCreature(ctx, body.creatureId);
  if (body.knack !== null && !knownKnacks(row.species).includes(body.knack)) {
    throw new DevError(409, 'knack_not_known');
  }
  ctx.sql.exec('UPDATE creatures SET knack = ? WHERE id = ?', body.knack, row.id);
  ctx.raid.invalidateReadiness();
  return { creatureId: row.id, knack: body.knack };
}
