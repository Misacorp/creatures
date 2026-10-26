/**
 * What a live socket listens to. A socket has exactly one topic, chosen by the server when it made the
 * ticket: the living room of the guild, or the finale of one party of one raid week, or the raid board of one party. Pushes go to the
 * sockets of one topic only, so a lounge socket never gets a finale message and the other way round.
 */

export type Topic =
  | { kind: 'lounge' }
  | { kind: 'finale'; week: string; party: number }
  | { kind: 'raid'; week: string; party: number };

export type TopicKind = Topic['kind'];

export const LOUNGE_TOPIC: Topic = { kind: 'lounge' };

/** The socket tag of a topic (`t:lounge`, `t:finale:<week>:<party>`). */
export function topicTag(topic: Topic): string {
  return topic.kind === 'lounge'
    ? 't:lounge'
    : `t:${topic.kind}:${topic.week}:${String(topic.party)}`;
}

/** The socket tag that holds every socket of one player. */
export const userTag = (userId: string): string => `u:${userId}`;

const PARTY_TAG_RE = /^t:(finale|raid):(\d{4}-W\d{2}):([1-9]\d{0,2})$/;

/** Reads a tag back into a topic; null for anything that is not one (a user tag too). */
export function parseTopicTag(tag: string): Topic | null {
  if (tag === 't:lounge') return LOUNGE_TOPIC;
  const match = PARTY_TAG_RE.exec(tag);
  if (match === null) return null;
  const [, kind, week, party] = match;
  if ((kind !== 'finale' && kind !== 'raid') || week === undefined || party === undefined) {
    return null;
  }
  return { kind, week, party: Number(party) };
}
