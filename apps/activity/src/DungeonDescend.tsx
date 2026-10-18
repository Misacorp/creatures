import { useMemo } from 'preact/hooks';
import { groupSupplies } from './claim-view';
import { partCountItems } from './GearArt';
import { LootList } from './GearLoot';
import {
  DESCEND_BUTTON,
  DESCEND_HOME_BUTTON,
  DESCEND_HOME_LINE,
  DESCEND_RISK_LINE,
  descendIntro,
  descendLines,
  descendTitle,
  descendUnderHeading,
  isPackEmpty,
  packLine,
} from './dungeon-text';
import { packItems } from './dungeon-run';
import type { DungeonAct, DungeonPack, DungeonPending } from './dungeon-types';
import { supplyKindOf } from './trip-view';
import { CountBadge, type CountItem } from './ui/CountBadge';
import { RevealShell } from './ui/RevealShell';
import { Tag } from './ui/Tag';

type Descent = Extract<NonNullable<DungeonPending>, { kind: 'descend' }>;

/** What the boss chest banked, as count badges: its supplies and its parts (shards, glimmer). The gear shows as item rows. */
export function bankedCounts(banked: Descent['banked']): CountItem[] {
  return [
    ...groupSupplies(banked.supplies).map((s) => ({
      key: `supply-${s.id}`,
      icon: { kind: 'supply', id: supplyKindOf(s.id) ?? 'unknown' } as const,
      amount: s.amount,
      name: s.name,
    })),
    ...partCountItems(banked.parts),
  ];
}

/** True when the chest banked nothing at all. */
export function nothingBanked(banked: Descent['banked']): boolean {
  return banked.gear.length === 0 && bankedCounts(banked).length === 0;
}

/**
 * The descent card, after the room boss (or an Undercroft keeper with a cracked floor) has fallen: what
 * is banked now (safe), what stays at risk (the pack), what the Undercroft below is like, and two choices:
 * Descend, or head home with everything. It looks like the camp's card. Names and numbers are the
 * server's; picking is an act the screen above sends.
 */
export function DungeonDescend({
  descent,
  pack,
  busy,
  onAct,
}: {
  descent: Descent;
  pack: DungeonPack;
  busy: boolean;
  onAct: (act: DungeonAct) => void;
}) {
  const counts = useMemo(() => bankedCounts(descent.banked), [descent.banked]);
  const items = packItems(pack);
  const lines = descendLines(descent);
  return (
    <RevealShell
      id="dungeon-descend-heading"
      title={descendTitle(descent)}
      class="dungeon-descend"
      arrive
      footer={<></>}
    >
      <p class="muted">{descendIntro(descent)}</p>

      <section class="descend-part" aria-label="Banked now">
        <h4>Banked now</h4>
        {nothingBanked(descent.banked) ? (
          <p class="muted">Nothing new this time.</p>
        ) : (
          <>
            <p class="muted">Already yours, whatever happens below.</p>
            <LootList
              label="Banked by the chest"
              loot={{
                gear: descent.banked.gear.map((g, i) => ({ id: `banked-${String(i)}`, ...g })),
                converted: [],
                parts: {},
                blueprints: [],
              }}
            />
            {counts.length > 0 && (
              <ul class="descend-counts plain-list" aria-label="Supplies and parts banked">
                {counts.map(({ key, ...badge }) => (
                  <li key={key}>
                    <CountBadge {...badge} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section class="descend-part" aria-label="Still at risk">
        <h4>Still at risk</h4>
        {items.length === 0 ? (
          <p class="muted">{packLine(pack)}</p>
        ) : (
          <div class="run-pack">
            <span class="run-pack-label">In your pack:</span>
            <ul class="run-pack-items" aria-label={packLine(pack)}>
              {items.map(({ key, ...badge }) => (
                <li key={key}>
                  <CountBadge {...badge} />
                </li>
              ))}
            </ul>
            <Tag kind="badge" tone="bad" entry="dungeon-pack">
              At risk
            </Tag>
          </div>
        )}
      </section>

      <section class="descend-part descend-under" aria-label="The Undercroft below">
        <h4 class="descend-under-heading">{descendUnderHeading(descent)}</h4>
        <ul class="descend-lines">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p class="descend-help">
          <Tag kind="chip" entry="undercroft">
            What is the Undercroft?
          </Tag>
        </p>
      </section>

      <div class="descend-choices">
        <button
          type="button"
          class="primary descend-go"
          disabled={busy}
          onClick={() => {
            onAct({ type: 'descend' });
          }}
        >
          {DESCEND_BUTTON}
        </button>
        <p class="muted">
          {isPackEmpty(pack) ? 'Your pack is empty, so little is at stake.' : DESCEND_RISK_LINE}
        </p>
        <button
          type="button"
          class="descend-home"
          disabled={busy}
          onClick={() => {
            onAct({ type: 'home' });
          }}
        >
          {DESCEND_HOME_BUTTON}
        </button>
        <p class="muted">{DESCEND_HOME_LINE}</p>
      </div>
    </RevealShell>
  );
}
