import { ValleyRulesSchema } from '@creatures/game';

/** The schema of the rules lives with them in `@creatures/game` (one source of numbers); the player profiles' schema lives there too. */
export const RulesSchema = ValleyRulesSchema;
export { ProfileSchema, type PlayerProfile } from '@creatures/game';
