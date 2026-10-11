/**
 * Who may manage a Discord server, worked out from the bot's read-only guild lookups.
 *
 * Base permissions are the @everyone role (its id equals the guild id) OR-ed with the member's
 * roles. The owner always may; ADMINISTRATOR implies everything. Channel overwrites do not matter
 * for a server-wide permission like Manage Server.
 */
import type { GuildApi } from './discord';
import type { DiscordRole } from './schemas';

export const PERMISSION_ADMINISTRATOR = 1n << 3n;
export const PERMISSION_MANAGE_GUILD = 1n << 5n;

/** True if the permission bits include Administrator or Manage Server. */
export function hasManagePermission(permissions: bigint): boolean {
  return (permissions & (PERMISSION_ADMINISTRATOR | PERMISSION_MANAGE_GUILD)) !== 0n;
}

/** The member's base permissions: @everyone plus every role they hold. Unknown role ids add nothing. */
export function basePermissions(
  guildId: string,
  roles: readonly DiscordRole[],
  memberRoleIds: readonly string[],
): bigint {
  const held = new Set(memberRoleIds);
  let bits = 0n;
  for (const role of roles) {
    if (role.id === guildId || held.has(role.id)) bits |= BigInt(role.permissions);
  }
  return bits;
}

/**
 * True if the user is the guild's owner or holds Administrator or Manage Server. Throws
 * `DiscordError('unavailable')` when Discord cannot answer. A user who is not in the guild may not.
 */
export async function canManageGuild(
  api: GuildApi,
  guildId: string,
  userId: string,
): Promise<boolean> {
  if ((await api.getGuildOwnerId(guildId)) === userId) return true;
  const [roles, member] = await Promise.all([
    api.getGuildRoles(guildId),
    api.getGuildMember(guildId, userId),
  ]);
  if (member === null) return false;
  return hasManagePermission(basePermissions(guildId, roles, member.roles));
}
