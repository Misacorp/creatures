import { supplyDef } from '@creatures/game';
import { baitCount, partCountItems, supplyCounts } from '../count-items';
import { GlossaryTag } from '../Glossary';
import type { StallOffer, StallPurchase, StallView } from '../games-types';
import type { IconRef } from '../icon-ref';
import { LootList } from '../LootList';
import { tierRarityClass } from '../supply-tiers';
import { formatCountdown, formatZoned } from '../time-format';
import { Sprite } from '../sprites/Sprite';
import { ActionButton } from '../ui/ActionButton';
import { CountBadge, type CountItem } from '../ui/CountBadge';
import { GameIcon } from '../ui/GameIcon';
import { RewardSummary } from '../ui/RewardSummary';
import { propSprite } from './art/props';
import { TEAM_RAMPS } from './art/tint';
import { MEDAL_POINT_ICON } from './MedalCabinet';

/** The picture of an offer's kind. */
export function offerIcon(offer: Pick<StallOffer, 'kind'>): IconRef {
  switch (offer.kind) {
    case 'gear':
      return { kind: 'glyph', id: 'gift' };
    case 'supply':
      return { kind: 'glyph', id: 'satchel' };
    case 'bait':
      return { kind: 'glyph', id: 'bait' };
    case 'shards':
      return { kind: 'glyph', id: 'shard-any' };
    case 'glimmer':
      return { kind: 'part', part: 'glimmer' };
  }
}

/** The rarity edge of an offer's tile: a gear piece's rarity, a supply's tier, else plain. */
export function offerEdge(offer: Pick<StallOffer, 'kind' | 'params'>): string {
  if (offer.kind === 'gear') return `rarity-${String(offer.params['rarity'] ?? 'common')}`;
  if (offer.kind === 'supply') return tierRarityClass(String(offer.params['tier'] ?? 'basic'));
  return 'rarity-common';
}

/** How much an offer gives, as a small number on its tile ("30"), or null for one thing. */
export function offerAmount(offer: Pick<StallOffer, 'params'>): number | null {
  const amount = offer.params['amount'];
  return typeof amount === 'number' && amount > 1 ? amount : null;
}

/** Why an offer cannot be bought now, or null. */
export function offerBlocked(offer: StallOffer, pocket: number, open: boolean): string | null {
  if (!open) return 'Closed';
  if (offer.left <= 0) return 'Sold out';
  if (pocket < offer.price) return 'Not enough';
  return null;
}

/** A row of bunting across the stall's top: the art kit's pennants in the team colours. */
function Bunting({ faded = false }: { faded?: boolean }) {
  return (
    <div class={faded ? 'gs-bunting is-faded' : 'gs-bunting'} aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <Sprite
          key={i}
          sprite={propSprite('pennant', 0, TEAM_RAMPS[i % TEAM_RAMPS.length])}
          scale={2}
        />
      ))}
    </div>
  );
}

/** One offer of the stall: its picture, name, what it gives, the price in medal points, how many are left and Buy. */
export function StallOfferTile({
  offer,
  pocket,
  open,
  busy,
  onBuy,
}: {
  offer: StallOffer;
  pocket: number;
  open: boolean;
  busy: boolean;
  onBuy: (offer: StallOffer) => void;
}) {
  const blocked = offerBlocked(offer, pocket, open);
  const amount = offerAmount(offer);
  return (
    <li class={offer.left <= 0 ? 'gs-offer is-sold' : 'gs-offer'}>
      <span class={`gs-offer-art ${offerEdge(offer)}`} aria-hidden="true">
        <GameIcon icon={offerIcon(offer)} scale={4} />
        {amount !== null && <span class="gs-offer-amount pix">{amount}</span>}
      </span>
      <span class="gs-offer-name">{offer.name}</span>
      <span class="gs-offer-meta">
        <CountBadge icon={MEDAL_POINT_ICON} amount={offer.price} label="Price, medal points" />
        <span
          class="gs-offer-left"
          aria-label={`Left this week: ${String(offer.left)} / ${String(offer.weeklyLimit)}`}
        >
          {`${String(offer.left)} / ${String(offer.weeklyLimit)}`}
        </span>
      </span>
      {open && (
        <ActionButton
          label="Buy"
          wide
          detail={blocked ?? undefined}
          disabled={busy || blocked !== null}
          onClick={() => {
            onBuy(offer);
          }}
        />
      )}
    </li>
  );
}

/** What a purchase gave, as count badges (Bait, parts, supplies). */
export function purchaseCounts(purchase: StallPurchase['purchase']): CountItem[] {
  const supplies = new Map<string, number>();
  for (const id of purchase.grant.supplies ?? []) supplies.set(id, (supplies.get(id) ?? 0) + 1);
  return [
    ...(purchase.bait === undefined ? [] : [baitCount(purchase.bait, { entry: true })]),
    ...partCountItems(purchase.grant.parts),
    ...supplyCounts(
      [...supplies].map(([id, amount]) => ({ id, name: supplyDef(id)?.name ?? id, amount })),
    ),
  ];
}

/** The prize just bought: the same reward look as every other grant (badges, the gear as a find). */
export function StallReveal({
  purchase,
  onDismiss,
}: {
  purchase: StallPurchase['purchase'];
  onDismiss: () => void;
}) {
  const counts = purchaseCounts(purchase);
  return (
    <div class="gs-reveal" role="status">
      <RewardSummary
        source={{
          gear: purchase.grant.gear,
          parts: purchase.grant.parts,
          ...(purchase.grant.supplies === undefined ? {} : { supplies: purchase.grant.supplies }),
          ...(purchase.bait === undefined ? {} : { bait: purchase.bait }),
        }}
        prefix="Rewards"
        countsLabel="Prize"
        counts={counts}
      >
        <LootList loot={purchase.grant} counted label="Prize" />
      </RewardSummary>
      <button type="button" class="ghost gs-reveal-ok" onClick={onDismiss}>
        OK
      </button>
    </div>
  );
}

/**
 * The Prize Stall: open on Wednesdays (bunting, the offers, your pocket); closed, a shuttered stall
 * with when it opens and a countdown. Prices are medal points (gold 3, silver 2, bronze and pins 1).
 */
export function PrizeStall({
  stall,
  pocket,
  serverNow,
  timezone,
  busy,
  purchase,
  onBuy,
  onDismissPurchase,
}: {
  stall: StallView;
  pocket: number;
  serverNow: number;
  timezone: string;
  busy: boolean;
  purchase: StallPurchase['purchase'] | null;
  onBuy: (offer: StallOffer) => void;
  onDismissPurchase: () => void;
}) {
  const title = (
    <h3 id="gs-stall-title" class="gs-stall-title">
      <GlossaryTag entry="games-prize-stall">Prize Stall</GlossaryTag>
    </h3>
  );
  if (!stall.open) {
    return (
      <section class="gs-stall is-closed pix-panel" aria-labelledby="gs-stall-title">
        <Bunting faded />
        {title}
        <div class="gs-shutter">
          <span class="gs-opens pix">{`Opens ${formatZoned(stall.opensAt, timezone, 'short')}`}</span>
          <span class="gs-opens-in">
            <GameIcon icon={{ kind: 'glyph', id: 'clock' }} scale={2} />
            {formatCountdown(stall.opensAt - serverNow, 'short')}
          </span>
        </div>
      </section>
    );
  }
  return (
    <section class="gs-stall pix-panel" aria-labelledby="gs-stall-title">
      <Bunting />
      <div class="gs-stall-head">
        {title}
        <CountBadge
          icon={MEDAL_POINT_ICON}
          amount={pocket}
          label="Medal points"
          entry="games-medal-points"
        />
      </div>
      {purchase !== null && <StallReveal purchase={purchase} onDismiss={onDismissPurchase} />}
      <ul class="gs-offers">
        {stall.offers.map((offer) => (
          <StallOfferTile
            key={offer.id}
            offer={offer}
            pocket={pocket}
            open={stall.open}
            busy={busy}
            onBuy={onBuy}
          />
        ))}
      </ul>
      <p class="gs-closes muted">
        {`Closes in ${formatCountdown(stall.closesAt - serverNow, 'short')}`}
      </p>
    </section>
  );
}
