import type { Rules } from './rules';
import type { Server } from './types';

/**
 * V-COM-12: a find sets itself into its own socket. Each place's board has five sockets for particular finds (`rules.collections.boards`);
 * a find fills the first open socket of its kind on any board, and a find whose sockets are all filled is a spare (the caller melts
 * it into Essence). A board with every socket filled is a completed collection and warms the fire (V-COM-13).
 */
export function setCollectionFind(
  server: Server,
  source: string,
  rules: Rules,
  hour: number,
): boolean {
  for (let i = 0; i < server.sockets.length; i++) {
    const place = server.places[i];
    const board = place ? (rules.collections.boards[place.id] ?? []) : [];
    const filled = server.sockets[i];
    if (!filled) continue;
    const socket = board.findIndex((kind, k) => kind === source && !filled[k]);
    if (socket < 0) continue;
    filled[socket] = true;
    if (filled.every(Boolean)) {
      server.collectionsDone += 1;
      server.firstCollectionHour ??= hour;
      server.warmth.collections = (server.warmth.collections ?? 0) + rules.fire.warmth.collection;
    }
    return true;
  }
  return false;
}
