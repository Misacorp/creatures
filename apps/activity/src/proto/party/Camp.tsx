import type { JSX } from 'preact';
import type { Creature } from '../../api';
import { silhouettePalette } from '../../art';
import { cssVars } from '../../css-vars';
import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { PACK_ART } from '../../sprites/pack-art';
import { PipRow } from '../../ui/PipRow';
import { creatureBadge, inOrder, TIMER_PIPS, type CreatureBadge } from './camp-state';
import type { PartyState } from './party-state';
import { stationVerdict } from './stations';

/** The bubble over a creature's head: one shape per state (never colour alone). */
function BubbleArt({ badge }: { badge: CreatureBadge }): JSX.Element | null {
  switch (badge.bubble) {
    case 'loot':
      return (
        <span class="pp-bub pp-bub-loot">
          <Sprite sprite={glyphOrUnknown('satchel')} scale={3} />
        </span>
      );
    case 'needs':
      return (
        <span class="pp-bub pp-bub-say">
          <span class="pp-bang">!</span>
        </span>
      );
    case 'evolve':
      return (
        <span class="pp-bub pp-bub-evolve">
          <Sprite sprite={glyphOrUnknown('sparkle')} scale={2} class="pp-spk pp-spk-1" />
          <Sprite sprite={glyphOrUnknown('sparkle')} scale={2} class="pp-spk pp-spk-2" />
          <Sprite sprite={glyphOrUnknown('sparkle')} scale={2} class="pp-spk pp-spk-3" />
        </span>
      );
    case 'job':
      return (
        <span class="pp-bub pp-bub-say pp-bub-job">
          <Sprite sprite={glyphOrUnknown('anvil')} scale={2} />
          <i class="pp-sweat" />
        </span>
      );
    case 'trip':
      return (
        <span class="pp-bub">
          <Sprite sprite={glyphOrUnknown('compass')} scale={2} />
        </span>
      );
    case 'free':
      return (
        <span class="pp-bub pp-bub-z">
          <span class="pp-z pp-z-1">z</span>
          <span class="pp-z pp-z-2">z</span>
        </span>
      );
    case 'rested':
      return (
        <span class="pp-bub pp-bub-z">
          <Sprite sprite={glyphOrUnknown('moon')} scale={2} class="pp-moon" />
          <span class="pp-z pp-z-1">z</span>
        </span>
      );
  }
}

/** One creature in the camp: a button the size of its cell, its state drawn on it. */
export function CampCreature({
  creature,
  badge,
  held,
  lit,
  dimWord,
  index,
  onPick,
  onPointerDown,
}: {
  creature: Creature;
  badge: CreatureBadge;
  held: boolean;
  /** A station view asked for a creature and this one can go. */
  lit: boolean;
  /** It cannot go where asked: the one word. */
  dimWord: string | null;
  index: number;
  onPick: () => void;
  onPointerDown?: ((e: PointerEvent) => void) | undefined;
}) {
  const sprite = creatureSpriteOrFallback(creature.species);
  const away = badge.bubble === 'trip';
  const classes = [
    'pp-mon',
    `pp-mon-${badge.bubble}`,
    held ? 'is-held' : '',
    lit ? 'is-lit' : '',
    dimWord !== null ? 'is-dim' : '',
  ]
    .filter((c) => c !== '')
    .join(' ');
  const label = dimWord === null ? badge.label : `${badge.label} Cannot go: ${dimWord}.`;
  return (
    <button
      type="button"
      class={classes}
      data-creature={creature.id}
      aria-pressed={held}
      aria-label={label}
      onClick={onPick}
      onPointerDown={onPointerDown}
      ref={cssVars({ '--pp-i': index })}
    >
      <span class="pp-mon-head">
        <BubbleArt badge={badge} />
      </span>
      <span class="pp-mon-body">
        <Sprite
          sprite={sprite}
          scale={3}
          {...(away ? { palette: silhouettePalette(sprite) } : {})}
          class="pp-mon-sprite"
        />
        {away && <Sprite sprite={PACK_ART} scale={2} class="pp-pack" />}
      </span>
      <span class="pp-mon-feet">
        {badge.marks.map((m) => (
          <Sprite key={m} sprite={glyphOrUnknown(m)} scale={2} class="pp-mark" />
        ))}
        <span class="pp-lv">{String(creature.level)}</span>
      </span>
      {badge.pips !== null && (
        <span class="pp-mon-pips">
          <PipRow count={TIMER_PIPS} lit={badge.pips} />
        </span>
      )}
      {dimWord !== null && <span class="pp-word pp-mon-word">{dimWord}</span>}
    </button>
  );
}

/**
 * The camp: every creature in two rows (one when collapsed), in the fixed order; scrolls sideways
 * when there are more than fit. A small campfire at its left end.
 */
export function Camp({
  state,
  collapsed,
  onPick,
  onPointerDown,
}: {
  state: PartyState;
  collapsed: boolean;
  onPick: (id: string) => void;
  onPointerDown?: (id: string, e: PointerEvent) => void;
}) {
  const creatures = inOrder(state.world, state.order);
  const asking = state.ask !== null && state.open !== null ? state.open : null;
  return (
    <section class={collapsed ? 'pp-camp is-collapsed' : 'pp-camp'} aria-label="Your creatures">
      <span class="pp-fire" aria-hidden="true">
        <i />
      </span>
      <div class="pp-camp-grid" role="group" aria-label="Camp">
        {creatures.map((c, i) => {
          const badge = creatureBadge(state.world, c, state.lounger, state.caveTeam);
          const verdict = asking === null ? null : stationVerdict(asking, c.id, state);
          return (
            <CampCreature
              key={c.id}
              creature={c}
              badge={badge}
              held={state.held === c.id}
              lit={verdict?.ok === true}
              dimWord={verdict !== null && !verdict.ok ? (verdict.word ?? '') : null}
              index={i}
              onPick={() => {
                onPick(c.id);
              }}
              {...(onPointerDown === undefined
                ? {}
                : {
                    onPointerDown: (e: PointerEvent) => {
                      onPointerDown(c.id, e);
                    },
                  })}
            />
          );
        })}
      </div>
    </section>
  );
}
