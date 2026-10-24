/**
 * What a live socket listens to. A socket has exactly one topic, chosen by the server when it made the
 * ticket: the living room of the guild, or the finale of one party of one raid week. Pushes go to the
 * sockets of one topic only, so a lounge socket never gets a finale message and the other way round.
 */

export type Topic = { kind: 'lounge' } | { kind: 'finale'; week: string; party: number };

export type TopicKind = Topic['kind'];

export const LOUNGE_TOPIC: Topic = { kind: 'lounge' };

/** The socket tag of a topic (`t:lounge`, `t:finale:<week>:<party>`). */
export function topicTag(topic: Topic): string {
  return topic.kind === 'lounge' ? 't:lounge' : `t:finale:${topic.week}:${String(topic.party)}`;
}

/** The socket tag that holds every socket of one player. */
export const userTag = (userId: string): string => `u:${userId}`;

const FINALE_TAG_RE = /^t:finale:(\d{4}-W\d{2}):([1-9]\d{0,2})$/;

/** Reads a tag back into a topic; null for anything that is not one (a user tag too). */
export function parseTopicTag(tag: string): Topic | null {
  if (tag === 't:lounge') return LOUNGE_TOPIC;
  const match = FINALE_TAG_RE.exec(tag);
  if (match === null) return null;
  const [, week, party] = match;
  if (week === undefined || party === undefined) return null;
  return { kind: 'finale', week, party: Number(party) };
}
