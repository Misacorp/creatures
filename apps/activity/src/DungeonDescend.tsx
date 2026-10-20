import { useMemo } from 'preact/hooks';
import { groupSupplies } from './claim-view';
import { GlossaryTag } from './Glossary';
import { partCountItems, supplyCounts } from './count-items';
import { FindItems } from './ui/FindItem';
import {
  DESCEND_BUTTON,
  DESCEND_EMPTY_PACK_HELP,
  DESCEND_HOME_BUTTON,
  DESCEND_HOME_LINE,
  DESCEND_RISK_LINE,
  DESCEND_UNDER_HEADING,
  descendIntro,
  descendLines,
  descendTitle,
  packLine,
} from './dungeon-text';
import { packItems } from './dungeon-run';
import type { DungeonAct, DungeonPack, DungeonPending } from './dungeon-types';
import { CountBadgeList, type CountItem } from './ui/CountBadge';
import { GameIcon } from './ui/GameIcon';
import { RevealShell } from './ui/RevealShell';

type Descent = Extract<NonNullable<DungeonPending>, { kind: 'descend' }>;

/** What the boss chest banked, as count badges: its supplies and its parts (shards, glimmer). The gear shows as item rows. */
export function bankedCounts(banked: Descent['banked']): CountItem[] {
  return [...supplyCounts(groupSupplies(banked.supplies)), ...partCountItems(banked.parts)];
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
      pix
      arrive
      footer={<></>}
    >
      <p class="muted prose">{descendIntro(descent)}</p>

      <div class="descend-ledger">
        <section class="descend-part" aria-label="Banked now">
          <h4>Banked now</h4>
          {nothingBanked(descent.banked) ? (
            <p class="muted">Nothing new this time.</p>
          ) : (
            <>
              {descent.banked.gear.length > 0 && (
                <div class="loot" role="group" aria-label="Banked by the chest">
                  <FindItems pieces={descent.banked.gear} label="Items" />
                </div>
              )}
              {counts.length > 0 && (
                <CountBadgeList
                  items={counts}
                  label="Supplies and parts banked"
                  class="descend-counts"
                  bare
                />
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
            <CountBadgeList items={items} label={packLine(pack)} class="run-pack-items" />
          )}
        </section>
      </div>

      <section class="descend-part descend-under" aria-label="The Undercroft below">
        <h4 class="descend-under-heading">
          <GameIcon icon={{ kind: 'glyph', id: 'map-descend' }} scale={2} />
          <span>{DESCEND_UNDER_HEADING}</span>
        </h4>
        <ul class="descend-lines prose">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
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
          <p class="muted prose">{DESCEND_RISK_LINE}</p>
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
          <p class="muted prose">{DESCEND_HOME_LINE}</p>
        </div>
      </div>
    </RevealShell>
  );
}
