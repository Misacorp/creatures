/**
 * The Market's project and broker (prototype, SAMPLE data; V-COM-1..7, V-COM-15, V-FORGE-11): what the server
 * has given so far, your own share, and whether it is built. There is no server here, so one small store holds
 * it for the session: the Market and the Forge both read it. `&market=built` opens it built with a broker,
 * `&market=seat` built with the seat empty, `&market=almost` nearly done. Pure rules first, the store at the end.
 */
export interface Gifts {
  acorns: number;
  scrap: number;
}

/** What the project takes, fixed when it opens (sample: a small first level). */
export const MARKET_NEED: Gifts = { acorns: 600, scrap: 200 };

/** The scaffolding's stages: 0 is the bare plot, 4 the last one before the stalls stand. */
export const STAGES = 5;

/** The broker's seat holds this id when the sample opens with a broker already seated (a stand-in is picked). */
export const SAMPLE_BROKER = 'sample';

export interface MarketState {
  /** Everything the server has given, yours included. */
  given: Gifts;
  /** Your own part of it (only you see it). */
  mine: Gifts;
  /** How many Acorns you hold (the sample world has none). */
  pocket: number;
  /** The creature on the broker's seat, if one is. */
  broker: string | null;
  /** The trades the broker and the exchange have made (the lucky pattern counts them). */
  trades: number;
}

const total = (g: Gifts): number => g.acorns + g.scrap;

/** How much of the project is paid, 0 to 1. */
export function fractionPaid(given: Gifts): number {
  const paid =
    Math.min(given.acorns, MARKET_NEED.acorns) + Math.min(given.scrap, MARKET_NEED.scrap);
  return Math.min(1, paid / total(MARKET_NEED));
}

export function isBuilt(given: Gifts): boolean {
  return given.acorns >= MARKET_NEED.acorns && given.scrap >= MARKET_NEED.scrap;
}

/** The scaffolding stage for what is paid: 0 to 4 (a built Market has no scaffolding). */
export function stageOf(given: Gifts): number {
  return Math.min(STAGES - 1, Math.floor(fractionPaid(given) * STAGES));
}

/** What is still needed, never below 0. */
export function stillNeeds(given: Gifts): Gifts {
  return {
    acorns: Math.max(0, MARKET_NEED.acorns - given.acorns),
    scrap: Math.max(0, MARKET_NEED.scrap - given.scrap),
  };
}

/** Your share of the whole project in whole percent (private). */
export function shareOf(mine: Gifts): number {
  return Math.round((total(mine) / total(MARKET_NEED)) * 100);
}

/** The invitation on a tap: what would help, worded as a welcome, not a debt. */
export function invitation(given: Gifts): string {
  const need = stillNeeds(given);
  const bits = [
    need.acorns > 0 ? `${String(need.acorns)} Acorns` : null,
    need.scrap > 0 ? `${String(need.scrap)} scrap` : null,
  ].filter((b): b is string => b !== null);
  return bits.length === 0
    ? 'The stalls are up.'
    : `The stalls would love ${bits.join(' and ')}, whenever you like.`;
}

/** The one gift a tap makes (sample): up to 40 Acorns and 10 scrap. */
export const GIFT: Gifts = { acorns: 40, scrap: 10 };

/** The gift a tap makes now: only what you hold and the project still takes. */
export function giftFor(state: MarketState, scrapHeld: number): Gifts {
  const need = stillNeeds(state.given);
  return {
    acorns: Math.min(GIFT.acorns, state.pocket, need.acorns),
    scrap: Math.min(GIFT.scrap, scrapHeld, need.scrap),
  };
}

/** The state after the gift (gifts count in full; the project never fails or expires). */
export function give(state: MarketState, gift: Gifts): MarketState {
  return {
    ...state,
    given: { acorns: state.given.acorns + gift.acorns, scrap: state.given.scrap + gift.scrap },
    mine: { acorns: state.mine.acorns + gift.acorns, scrap: state.mine.scrap + gift.scrap },
    pocket: state.pocket - gift.acorns,
  };
}

/** The plaque of a finished level: how many hands built it (no amounts, no order; V-COM-2). */
export const PLAQUE_HANDS = 9;

/** A broker is on duty: the Market is built and a creature sits on its seat. */
export function brokerOnDuty(state: MarketState): boolean {
  return isBuilt(state.given) && state.broker !== null;
}

// --- The session's store ---

const START: MarketState = {
  given: { acorns: 340, scrap: 70 },
  mine: { acorns: 60, scrap: 10 },
  pocket: 120,
  broker: null,
  trades: 0,
};

/** The state a hash asks for (`&market=built`, `&market=almost`), else the sample start. */
export function marketFromHash(hash: string): MarketState {
  const ask = /[?&]market=([a-z]+)(?:&|$)/.exec(hash)?.[1];
  if (ask === 'built') {
    return {
      ...START,
      given: { ...MARKET_NEED },
      mine: { acorns: 120, scrap: 30 },
      broker: SAMPLE_BROKER,
    };
  }
  if (ask === 'seat') {
    return { ...START, given: { ...MARKET_NEED }, mine: { acorns: 120, scrap: 30 } };
  }
  if (ask === 'almost') return { ...START, given: { acorns: 560, scrap: 180 } };
  return START;
}

let store: MarketState | null = null;

export function getMarket(): MarketState {
  store ??= marketFromHash(typeof window === 'undefined' ? '' : window.location.hash);
  return store;
}

export function setMarket(next: MarketState): void {
  store = next;
}

/** Back to the start (tests). */
export function resetMarket(): void {
  store = null;
}
