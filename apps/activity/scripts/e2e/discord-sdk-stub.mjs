/**
 * A stand-in for `@discord/embedded-app-sdk` in the end-to-end run (`scripts/e2e-valley.mjs` aliases the package to
 * this file): no Discord around the page, so `ready`, `authorize` and `authenticate` answer at once and nobody
 * else is in the Activity. Dev only; nothing here ships.
 */
export class DiscordSDK {
  constructor(clientId) {
    this.clientId = clientId;
    this.instanceId = 'e2e-instance';
    this.commands = {
      authorize: async () => ({ code: 'e2e-code' }),
      authenticate: async () => ({}),
      openExternalLink: async () => undefined,
      getInstanceConnectedParticipants: async () => ({ participants: [] }),
    };
  }
  async ready() {}
  async subscribe() {}
  async unsubscribe() {}
}
