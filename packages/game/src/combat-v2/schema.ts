/**
 * Schemas of the combat v2 content files (`data/*.json`), in the style of the game's other content
 * (`content/talent-schema.ts`): valibot, strict objects, then the cross-reference checks in `load.ts`.
 *
 * Why the files exist: the combat v2 content was the lab's TypeScript (`packages/lab`); phase 3 of
 * docs/design/combat/content-as-data.md makes it data the game owns and the lab reads. Names, ids, texts
 * and numbers are exactly the lab's. The `intent` of a Knack or talent is for contributors and agents (the
 * situation it is for) and is never shown to players.
 *
 * ## Knacks (`knacks.json`)
 *
 * Naming rule (principle 8): the same effect keeps the same name wherever it appears (another species, a
 * gear piece). A different effect gets a different name. Knack families are one rule with different
 * numbers or elements (grammar.md); a new family needs a reason (P-09).
 *
 * ## Forms (`forms.json`): armour, own Knacks and stat changes
 *
 * The Knacks each form brings of its own (R11, Misa 2026-10-27). A creature knows them from the moment it is
 * caught; evolving adds the new form's own Knacks to the ones it knew, if the role stays (a role change keeps
 * only the new form's, since the old role's Knacks would do nothing).
 *
 * Armour is a species stat (R13, Misa 2026-10-28): flat, taken off every hit, a hit at or below it is Blocked.
 * One base value per form, no growth per level for now. The role no longer decides it: lines that start as
 * Guards lean higher, quick and soft creatures lower, shells and hides higher. An evolution never lowers it,
 * whatever the new role (a lab test holds this).
 *
 * The stat changes (`atkBp`, `critChanceBp`, `critDamageBp`) are the combat v2 draft's, from the fourth design
 * panel (Misa 2026-10-28). They change the v2 numbers only, not the shipped species data (`creatures.json`):
 * the migration (roadmap phase 6) decides what ships. Keep them few: one line per creature, each with the
 * reason.
 *
 * - **Stage 2 Payoffs within about 10% of each other in Attack.** Bloomback and Tempestray had 190, Gaiadrake
 *   152, Pyrelynx and Geyserpup 128, so a raid roster always took the top two and the rest were filler.
 *   `atkBp` scales the shipped Attack (at every level) to about 165 for the top two, 155 and 150 for the
 *   others. Pyrelynx stays at 128: its crits make up the rest.
 * - **Crit machines** (Misa, 2026-10-30: luck is a build): Cindle, Pyrelynx and Coralynx hit about 14% softer and
 *   crit 10 points more often for 50 points more crit damage (a crit then deals x2.5, not x2). That is about
 *   the same average damage as their siblings (`1 + 15% x 1.5` against `1 + 5% x 1`, so 1.17 times), with far
 *   more swing, and the more crit chance and crit damage a talent, Knack or item adds, the more they gain: the
 *   crit build starts from a species. The shipped species data has a small crit bonus on Cindle, Pyrelynx,
 *   Stormray and Tempestray; v2 does not read it, only these fields. `critChanceBp` is over the rules'
 *   `critChanceBp`, `critDamageBp` over the base crit (`critBp`).
 * - **Ancientshell: the armour or the HP, not both.** It had the most armour (48) and the top Setter HP and
 *   Attack. Its armour is now below the best Guard's (30; Hearthshell has 40), so a Setter behind a living
 *   forest is a choice with a price. `armour` holds the final number; the `note` says why.
 *
 * ## Talents (`talents.json`)
 *
 * One shared library; each creature line links to its own pool from it (Misa, 2026-10-27), so two lines of the
 * same role can roll different tools. A creature rolls from its line's pool when it is found and through the
 * Talent Book over time. Talents use the Knacks' effect grammar; their numbers add to the Knack's. (The shipped
 * game's talents, `content/data/talents.json`, are combat v1's and are a different file.)
 *
 * Rules (panel 2, Misa 2026-10-26), checked at load in `load.ts` where code can check them:
 * - One name per effect, one number per name (P-06), across Knacks, talents and gear.
 * - A talent never repeats a Knack's effect, and Seal is never a talent: the roll must not decide the Knack
 *   choice.
 * - Talents use only fields that add up (`ADDITIVE_FIELDS`), never a Knack's multipliers.
 * - A talent that does nothing for a form's role is idle on it (`roles` lists the roles it works for).
 * - A talent takes the name of the shipped gear line when it is the same effect (Misa, 2026-10-28).
 * - Every pool holds seven talents; a pool is a line's.
 *
 * Each pool was chosen for the line's forms and flavour (branch forms share the line's pool). Every role in a
 * line has at least three that fit it, and two lines of one role roll different tools. Only Tide and Grove
 * Supports have a heal to aim (Triage, Overheal Spill); only Mire lines put Mired on the boss (Wicked,
 * Clinging). Culling Strike is in no pool until a killing-blow talent exists. The themes: splashet, splashes first and
 * thinks later; cindle, a pounce, a lucky crit, a steady flame; sproutle, shy, soaks up hits for its friends;
 * zipmouse, static that never sits still (the Ohmouse plants its feet); mistnewt, a calm newt in a cloud of
 * mist; ashmole, warms the burrow and cheers the team on (the Kilnmole digs in); stormray, rides the edge of
 * the thundercloud; mossback, a patient turtle with a garden on its shell; coralynx, elegant and proud,
 * strikes from the shadows; solmane, a mane of sunlight that leads from the front; gaiadrake, a
 * mountain-sized drake, very hard to stop once it roars; aurorix, drifts above the noise and watches over the
 * team; lanternfin, a lantern that lights the way; hearthshell, a bonfire on its shell, shared with the whole
 * team; mudlump, a sticky wall (Mire); squelch, a croaking song (Mire).
 */
import * as v from 'valibot';
import { IdSchema, RoleSchema } from '../content/schema';
import { FxSchema } from './fx-schema';

const Name = v.pipe(v.string(), v.minLength(1), v.maxLength(40));
const Text = v.pipe(v.string(), v.minLength(1), v.maxLength(400));
const Intent = v.pipe(v.string(), v.minLength(1), v.maxLength(600));
const Int = v.pipe(v.number(), v.integer());

export const FamilySchema = v.strictObject({ name: Name, text: Text });
export type FamilyDef = v.InferOutput<typeof FamilySchema>;

export const KnackSchema = v.pipe(
  v.strictObject({
    id: IdSchema,
    name: Name,
    /** A family by name. */
    family: Name,
    /** What the player reads (keywords in braces). */
    text: Text,
    /** Design intent for contributors and agents: the situation it is for. Never shown to players. */
    intent: Intent,
    fx: FxSchema,
  }),
  v.readonly(),
);
export type KnackDef = v.InferOutput<typeof KnackSchema>;

export const KnackFileSchema = v.strictObject({
  families: v.array(FamilySchema),
  knacks: v.array(KnackSchema),
});

export const FormSchema = v.pipe(
  v.strictObject({
    /** A shipped form (a species of `content.creatures`). */
    id: IdSchema,
    /** The form's armour, final (see the header for Ancientshell). */
    armour: v.pipe(Int, v.minValue(1)),
    /** The Knacks it brings of its own, in order. */
    ownKnacks: v.pipe(v.array(IdSchema), v.minLength(1), v.readonly()),
    /** The shipped Attack, scaled (basis points: 10000 is unchanged). */
    atkBp: v.exactOptional(Int),
    /** Crit chance the species has of its own, in basis points over the rules' `critChanceBp`. */
    critChanceBp: v.exactOptional(Int),
    /** Crit damage the species has of its own, in basis points over the base crit (the rules' `critBp`). */
    critDamageBp: v.exactOptional(Int),
    /** Why the numbers are what they are, when that is not obvious. */
    note: v.exactOptional(v.pipe(v.string(), v.minLength(1), v.maxLength(400))),
  }),
  v.readonly(),
);
export type FormDef = v.InferOutput<typeof FormSchema>;

export const FormFileSchema = v.array(FormSchema);

export const TalentSchema = v.pipe(
  v.strictObject({
    id: IdSchema,
    name: Name,
    text: Text,
    /** The roles it does something for; on any other role it is idle. */
    roles: v.pipe(v.array(RoleSchema), v.minLength(1), v.readonly()),
    /** Design intent for contributors (never shown to players). */
    intent: Intent,
    fx: FxSchema,
  }),
  v.readonly(),
);
export type TalentDef = v.InferOutput<typeof TalentSchema>;

export const TalentFileSchema = v.strictObject({
  talents: v.array(TalentSchema),
  /** Each line's pool: talent ids. */
  pools: v.record(IdSchema, v.pipe(v.array(IdSchema), v.readonly())),
});

/** The pool size every line has. */
export const POOL_SIZE = 7;
