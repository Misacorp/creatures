/**
 * The guild object's live sockets as one piece: the transport (`live-socket.ts`) and the two pushes that
 * use it, the lounge's (`lounge-live.ts`) and the finale's (`finale-live.ts`). `GuildWorld` owns one;
 * `GuildCore` sees it only as `LiveHooks`.
 */
import { FinalePush, type FinalePushDeps } from './finale-live';
import { LoungePush, type LoungePushDeps } from './lounge-live';
import { LiveSockets, type LiveHooks, type LiveSocketsDeps } from './live-socket';
import type { Topic, TopicKind } from './live-topic';

export interface LiveHubDeps {
  sockets: Omit<LiveSocketsDeps, 'onAccept'>;
  residentOf: LoungePushDeps['residentOf'];
  snapshotFor: FinalePushDeps['snapshotFor'];
  nextChangeAt: FinalePushDeps['nextChangeAt'];
}

export class LiveHub implements LiveHooks {
  readonly sockets: LiveSockets;
  readonly lounge: LoungePush;
  readonly finale: FinalePush;

  constructor(deps: LiveHubDeps) {
    this.sockets = new LiveSockets({
      ...deps.sockets,
      // A finale socket announces itself: its party gets a snapshot (the new socket its first one).
      onAccept: (topic) => {
        if (topic.kind === 'finale') this.finale.afterOpen(topic);
      },
    });
    this.lounge = new LoungePush({ sockets: this.sockets, residentOf: deps.residentOf });
    this.finale = new FinalePush({
      sockets: this.sockets,
      snapshotFor: deps.snapshotFor,
      nextChangeAt: deps.nextChangeAt,
    });
  }

  enabled(kind: TopicKind): boolean {
    return this.sockets.enabled(kind);
  }

  mintTicket(guildId: string, userId: string, topic: Topic): Promise<string> {
    return this.sockets.mintTicket(guildId, userId, topic);
  }

  notify(userId: string): void {
    this.lounge.notify(userId);
  }

  notifyFinale(userId: string): void {
    this.finale.afterAction(userId);
  }

  tickFinale(): void {
    this.finale.tick();
  }

  finaleWatchers(week: string, party: number): ReadonlySet<string> {
    return this.finale.watchersOf(week, party);
  }

  nextFinaleAt(): number | null {
    return this.finale.nextAt();
  }

  upgrade(request: Request): Promise<Response> {
    return this.sockets.upgrade(request);
  }

  webSocketMessage(ws: WebSocket): void {
    this.sockets.webSocketMessage(ws);
  }

  webSocketClose(ws: WebSocket, code: number): void {
    this.sockets.webSocketClose(ws, code);
    this.finale.afterClose(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.sockets.webSocketError(ws);
    this.finale.afterClose(ws);
  }
}
