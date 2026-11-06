/**
 * Player profiles (model.md "Players"): data, not code. They live in `@creatures/game` (`packages/game/src/valley/profiles.ts`), where the
 * staging bots read the same list; the lab re-exports them.
 */
export { PROFILES, profileById } from '@creatures/game';
