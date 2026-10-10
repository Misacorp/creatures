import * as v from 'valibot';

export const SNOWFLAKE_RE = /^\d{17,20}$/;

const snowflake = v.pipe(v.string(), v.regex(SNOWFLAKE_RE));

/** Request body of POST /api/auth/session: strict, unknown keys rejected. */
export const AuthSessionBodySchema = v.strictObject({
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(512)),
  instanceId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});
export type AuthSessionBody = v.InferOutput<typeof AuthSessionBodySchema>;

// Discord responses below are lenient about extra keys (Discord adds fields over time) but strict
// about the fields we rely on.

export const DiscordTokenResponseSchema = v.object({
  access_token: v.pipe(v.string(), v.minLength(1)),
});

export const DiscordUserSchema = v.object({
  id: snowflake,
  username: v.string(),
  global_name: v.nullish(v.string()),
});
export type DiscordUser = v.InferOutput<typeof DiscordUserSchema>;

export const ActivityInstanceSchema = v.object({
  location: v.object({
    guild_id: v.nullish(v.string()),
    channel_id: v.nullish(v.string()),
  }),
  users: v.array(v.string()),
});
export type ActivityInstance = v.InferOutput<typeof ActivityInstanceSchema>;
