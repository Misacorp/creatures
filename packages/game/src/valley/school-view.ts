import * as v from 'valibot';

/**
 * What the School's routes answer (phase 5 step 9b; the server's types are `SchoolView` and `SeatResult` in
 * `apps/worker/src/valley-school.ts`, and a worker test checks its answers against these). Strict where the server's shape is fixed, so the
 * client refuses an answer of another shape. Nothing here draws a number.
 */

const int = v.pipe(v.number(), v.integer(), v.minValue(0));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

/** One of the caller's student seats: who sits there (null: empty) and the morning it learns (null: empty). */
export const SchoolSeatSchema = v.strictObject({
  index: int,
  creatureId: v.nullable(id),
  learnsAt: v.nullable(int),
});
export type SchoolSeatView = v.InferOutput<typeof SchoolSeatSchema>;

/** `GET /api/valley/school`: the teacher (hidden while away), the stay, the caller's seats and the creatures of theirs that would learn. */
export const SchoolViewSchema = v.strictObject({
  phase: v.picklist(['here', 'announced', 'away']),
  talent: v.nullable(
    v.strictObject({
      id,
      name: v.pipe(v.string(), v.maxLength(80)),
      text: v.pipe(v.string(), v.maxLength(400)),
    }),
  ),
  arrivesAt: v.nullable(int),
  leavesAt: v.nullable(int),
  seats: v.pipe(v.array(SchoolSeatSchema), v.maxLength(8)),
  wouldLearn: v.pipe(v.array(id), v.maxLength(512)),
});
export type SchoolViewState = v.InferOutput<typeof SchoolViewSchema>;

/** What `POST /api/valley/school/seat` answers besides the valley and the state. */
export const SchoolSeatAnswerSchema = v.object({
  index: int,
  creatureId: v.nullable(id),
});
export type SchoolSeatAnswerView = v.InferOutput<typeof SchoolSeatAnswerSchema>;

/** The School's read as the client takes it: the view, or `undefined` for any other shape. */
export function parseSchoolView(value: unknown): SchoolViewState | undefined {
  const result = v.safeParse(SchoolViewSchema, value);
  return result.success ? result.output : undefined;
}

/** A seating's answer, or `undefined` for any other shape (the other keys, `valley` and `state`, are the caller's). */
export function parseSchoolSeatAnswer(value: unknown): SchoolSeatAnswerView | undefined {
  const result = v.safeParse(SchoolSeatAnswerSchema, value);
  return result.success ? result.output : undefined;
}
