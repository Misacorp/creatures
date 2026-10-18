import * as v from 'valibot';
import { SPEND_KEY_RE } from './ledger';

export const SNOWFLAKE_RE = /^\d{17,20}$/;

/** The client-generated key every spend and keyed action carries. */
export const IdempotencyKeySchema = v.pipe(v.string(), v.regex(SPEND_KEY_RE));

const snowflake = v.pipe(v.string(), v.regex(SNOWFLAKE_RE));

/** Request body of POST /api/auth/session: strict, unknown keys rejected. */
export const AuthSessionBodySchema = v.strictObject({
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(512)),
  instanceId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});

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

/** A permission bit field as Discord sends it: a decimal string of an unsigned 64-bit integer. */
const permissionString = v.pipe(v.string(), v.regex(/^\d{1,20}$/));

/** Discord allows 250 roles per guild; the limit here is generous but bounded. */
const MAX_ROLES = 1000;

/** `GET /guilds/{guild.id}`: only the owner matters. */
export const DiscordGuildSchema = v.object({ owner_id: snowflake });

/** `GET /guilds/{guild.id}/roles`: id and permission bits of every role (the @everyone role included). */
export const DiscordRolesSchema = v.pipe(
  v.array(v.object({ id: snowflake, permissions: permissionString })),
  v.maxLength(MAX_ROLES),
);
export type DiscordRole = v.InferOutput<typeof DiscordRolesSchema>[number];

/** `GET /guilds/{guild.id}/members/{user.id}`: the ids of the member's roles. */
export const DiscordMemberSchema = v.object({
  roles: v.pipe(v.array(snowflake), v.maxLength(MAX_ROLES)),
});
export type DiscordMember = v.InferOutput<typeof DiscordMemberSchema>;
