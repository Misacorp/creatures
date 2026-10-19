import { describe, expect, it } from 'vitest';
import { actorHash } from '../src/analytics';
import { reporterHash } from '../src/feedback-reporter';
import { guildAliases } from '../src/ops-report';
import { formatSessionToken, getSessionKey } from '../src/session';

// Known-answer tests: a fixed secret and input must always give these exact values. They pin the
// salt, info label and usages of every HMAC key derived from the Discord client secret, so a typo
// in a refactor (which would silently change every session MAC and hash) fails here.
const SECRET = 'known-answer-test-secret';
const GUILD = '333333333333333333';
const SESSION_SECRET = 's'.repeat(43);

describe('derived HMAC keys (known answers)', () => {
  it('session token MAC', async () => {
    const token = await formatSessionToken(await getSessionKey(SECRET), GUILD, SESSION_SECRET);
    expect(token).toBe(
      's1.333333333333333333.sssssssssssssssssssssssssssssssssssssssssss.-iyd-whvfdWt0djq4lr6FBAahVqvgPM23FpKeM8OTG0',
    );
  });

  it('analytics actor hash', async () => {
    expect(await actorHash(SECRET, '111111111111111111')).toBe('7924e50b650341d1e82f2c27400acbc8');
  });

  it('ops-report guild alias', async () => {
    const aliases = await guildAliases(SECRET, [GUILD]);
    expect(aliases.get(GUILD)).toBe('g-bcda82');
  });

  it('feedback reporter hash', async () => {
    expect(await reporterHash(SECRET, '111111111111111111')).toBe(
      '37f56e9fcf10a8d89d8b599cd57fbc6e',
    );
  });
});
