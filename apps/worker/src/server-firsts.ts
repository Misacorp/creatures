/** "First on server" records, shared by collection (catch, evolve) and raids (jackpot). */

export type ServerFirstKind = 'catch' | 'evolve' | 'jackpot';

/**
 * Records "first on server": the first drop to produce `species` owns the record, and every user
 * who got it in that same drop shares it. Returns true if this user holds it now. Call it inside
 * the transaction that grants the drop.
 */
export function recordServerFirst(
  sql: SqlStorage,
  kind: ServerFirstKind,
  species: string,
  userId: string,
  dropId: string,
  at: number,
): boolean {
  const existing = sql
    .exec<{
      drop_id: string;
    }>('SELECT drop_id FROM server_firsts WHERE kind = ? AND species = ? LIMIT 1', kind, species)
    .toArray()[0];
  if (existing !== undefined && existing.drop_id !== dropId) return false;
  return (
    sql
      .exec(
        `INSERT INTO server_firsts (kind, species, user_id, drop_id, at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kind, species, user_id) DO NOTHING RETURNING user_id`,
        kind,
        species,
        userId,
        dropId,
        at,
      )
      .toArray().length > 0
  );
}
