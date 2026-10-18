import { useMemo } from 'preact/hooks';
import { groupSupplies } from './claim-view';
import { GlossaryTag } from './Glossary';
import { partCountItems } from './GearArt';
import { LootList } from './GearLoot';
import {
  DESCEND_BANKED_HELP,
  DESCEND_BUTTON,
  DESCEND_EMPTY_PACK_HELP,
  DESCEND_HOME_BUTTON,
  DESCEND_HOME_LINE,
  DESCEND_RISK_HELP,
  DESCEND_RISK_LINE,
  DESCEND_UNDER_HEADING,
  descendIntro,
  descendLines,
  descendTitle,
  packLine,
} from './dungeon-text';
import { packItems } from './dungeon-run';
import type { DungeonAct, DungeonPack, DungeonPending } from './dungeon-types';
import { supplyKindOf } from './trip-view';
import { CountBadge, type CountItem } from './ui/CountBadge';
import { GameIcon } from './ui/GameIcon';
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
 * The descent card, after the floor boss (or an Undercroft floor boss on a cracked floor) has fallen: what
 * is banked now (safe), what stays at risk (the pack), what the Undercroft below is like, and two choices:
 * Descend, or head home with everything. It looks like the camp's card. Names and numbers are the
 * server's; picking is an act the screen above sends.
 */
export function DungeonDescend({
  descent,
  pack,
  depth,
  busy,
  onAct,
}: {
  descent: Descent;
  pack: DungeonPack;
  /** The run's depth (`state.depth`): the Undercroft's foes fight this much deeper (`depthBonus` a level). */
  depth: number;
  busy: boolean;
  onAct: (act: DungeonAct) => void;
}) {
  const counts = useMemo(() => bankedCounts(descent.banked), [descent.banked]);
  const items = packItems(pack);
  const lines = descendLines(descent, depth);
  return (
    <RevealShell
      id="dungeon-descend-heading"
      title={descendTitle(descent)}
      class="dungeon-descend"
      arrive
      footer={<></>}
    >
      <p class="muted">{descendIntro(descent)}</p>

      <div class="descend-ledger">
        <section class="descend-part" aria-label="Banked now">
          <h4>Banked now</h4>
          <p class="muted">{DESCEND_BANKED_HELP}</p>
          {nothingBanked(descent.banked) ? (
            <p class="muted">Nothing new this time.</p>
          ) : (
            <>
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
          <h4>
            Still at risk <GlossaryTag entry="dungeon-pack" look="help" />
          </h4>
          {items.length === 0 ? (
            <p class="muted">{DESCEND_EMPTY_PACK_HELP}</p>
          ) : (
            <>
              <p class="muted">{DESCEND_RISK_HELP}</p>
              <ul class="run-pack-items" aria-label={packLine(pack)}>
                {items.map(({ key, ...badge }) => (
                  <li key={key}>
                    <CountBadge {...badge} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section class="descend-part descend-under" aria-label="The Undercroft below">
        <h4 class="descend-under-heading">
          <GameIcon icon={{ kind: 'glyph', id: 'map-descend' }} scale={2} />
          <span>{DESCEND_UNDER_HEADING}</span>
        </h4>
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
        <div class="descend-choice">
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
          <p class="muted">{DESCEND_RISK_LINE}</p>
        </div>
        <div class="descend-choice">
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
      </div>
    </RevealShell>
  );
}
