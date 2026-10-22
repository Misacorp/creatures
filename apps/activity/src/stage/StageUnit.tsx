import type { EventNames } from '@creatures/engine';
import type { ComponentChildren, Ref } from 'preact';
import { creatureInfoOf } from '../creature-info';
import { foeButtonLabel, type FoeInfo } from '../foe-info';
import { glyphOrUnknown } from '../glyphs';
import { abilityName } from '../live';
import type { ReplayRowEntry } from '../raid-api';
import { usePopoverTrigger } from '../PopoverHost';
import { SmallCreature } from '../SmallCreature';
import { ordinal } from '../stage';
import type { Badge } from '../stage-abilities';
import type { FxItem } from '../stage-fx';
import { ElementChip } from '../sprites/ElementChip';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { elementIcon } from '../sprites/element-icons';
import { popupProps } from '../ui/Popover';
import { SegmentBar } from '../ui/SegmentBar';
import type { EffectView } from '../replay';
import { EffectIcons } from '../ui/EffectIcons';
import { Bursts, Floats, KoTags, Marks } from './StageFx';

/** The creatures and the foe of the fight stage: one unit with its marks, its badge and its popover button. */

/** The small badge on a creature's corner: what state its ability is in, by shape as well as colour. */
export function AbilityBadge({ badge }: { badge: Badge }) {
  return (
    <span
      class={`ab-badge ab-${badge.kind}${badge.pulse ? ' pulse' : ''}`}
      data-state={badge.kind}
      aria-hidden="true"
    >
      {badge.kind === 'auto' && (
        <>
          <Sprite sprite={glyphOrUnknown('ability')} scale={2} />
          {badge.round !== null && <span class="ab-round pix">{badge.round}</span>}
        </>
      )}
      {badge.kind === 'manual' && <Sprite sprite={glyphOrUnknown('hand')} scale={2} />}
      {badge.kind === 'pressed' && (
        <span class="ab-round pix">{badge.round === null ? '>' : badge.round}</span>
      )}
      {badge.kind === 'used' && (
        <>
          <Sprite sprite={glyphOrUnknown('check')} scale={2} />
          {badge.round !== null && <span class="ab-round pix">{badge.round}</span>}
        </>
      )}
    </span>
  );
}

/**
 * The foe's or boss's picture as a button that opens its popover (name, element, HP and what it does)
 * in the app's popover layer. The mark and the effects sit beside it, not inside it. Without the
 * popover host it is the plain picture, named for assistive technology.
 */
export function FoeFace({ info, children }: { info: FoeInfo; children: ComponentChildren }) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  if (host === null) {
    return (
      <span class="foe-face" role="img" aria-label={info.name}>
        {children}
      </span>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      class="small-creature foe-face"
      {...popupProps(open)}
      aria-label={foeButtonLabel(info.name)}
      onClick={() => {
        if (ref.current !== null) host.openFoe(`foe:${info.id}`, info, ref.current);
      }}
    >
      {children}
    </button>
  );
}

export interface UnitProps {
  creature: ReplayRowEntry;
  scale: number;
  mine: boolean;
  ko: boolean;
  classes: readonly string[];
  silenced: boolean;
  fx: readonly FxItem[];
  names: EventNames;
  badge: Badge | null;
  /** The ability's id, for the label of the badge. */
  abilityId: string | null;
  /** True for the player's own creatures: they can be tapped (an ability popover, or a note). */
  interactive: boolean;
  /** What the button says it opens, for assistive technology. */
  opens: string;
  open: boolean;
  /** Registers the creature's button as the anchor of its popover. */
  anchorRef: Ref<HTMLButtonElement>;
  /** Registers the creature's box, so a strike's beam can find its target. */
  boxRef: Ref<HTMLLIElement>;
  /** The boss will silence this creature next round (a warning glyph on it). */
  warned: boolean;
  /** The creature is marked for a charged attack that lands next round (a persistent amber mark). */
  charged: boolean;
  /** The creature's HP now and at most (the dungeon); null when the stage shows no creature HP. */
  hp: { current: number; max: number } | null;
  /** The status effects on the creature right now (small icons over its sprite). */
  effects?: readonly EffectView[];
  /**
   * The creature's place in this round's acting order from 1 ("1st", "2nd", ...), written under it;
   * null when it has no turn this round (knocked out, or the round has not been played yet).
   */
  slot: number | null;
  onToggle: () => void;
}

/**
 * One creature on the stage: its sprite with the corner marks (the "you" tag above it, the ability
 * badge top right, the skull of a knocked-out creature bottom left, its element bottom right) and
 * its name under it, two lines at most. The player's own creature with an ability is a button that
 * opens the ability popover (drawn by the stage, which is its anchor's parent). The full name is
 * the accessible label; no `title`, so no browser tooltip floats over the stage.
 */
export function StageUnit(props: UnitProps) {
  const { creature: c, mine, ko, badge, interactive, open } = props;
  const icon = elementIcon(c.element);

  const spoken =
    `${props.slot === null ? '' : `Acts ${ordinal(props.slot)}, `}${c.name}${mine ? ', yours' : ''}${ko ? ', knocked out' : ''}${props.charged ? ", marked for the boss's next attack" : ''}` +
    (props.hp === null || ko ? '' : `, HP ${String(props.hp.current)} / ${String(props.hp.max)}`) +
    (badge === null
      ? ''
      : `, ${props.abilityId === null ? 'ability' : abilityName(props.abilityId)} ${badge.label.toLowerCase()}`);

  const face = (
    <>
      <span class="unit-top">{mine && <span class="you-pip pix">you</span>}</span>
      <span class="unit-art">
        <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={props.scale} />
        {icon !== undefined && (
          <span class="unit-element">
            <Sprite sprite={icon} scale={2} />
          </span>
        )}
        {ko && (
          <span class="ko-mark">
            <Sprite sprite={glyphOrUnknown('skull')} scale={2} />
          </span>
        )}
        {props.silenced && (
          <span class="silence-tag">
            <Sprite sprite={glyphOrUnknown('silence_ends')} scale={2} />
          </span>
        )}
        {badge !== null && <AbilityBadge badge={badge} />}
        {props.warned && (
          <span class="warn-mark" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('warning')} scale={2} />
          </span>
        )}
        {props.charged && !ko && (
          <span class="charge-mark" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('charge')} scale={2} />
          </span>
        )}
        <Marks fx={props.fx} id={c.id} />
      </span>
      <span class="unit-name pix" aria-hidden="true">
        {c.name}
      </span>
      {props.hp !== null && (
        <SegmentBar size="unit" current={props.hp.current} max={props.hp.max} />
      )}
      <span class="unit-slot pix" aria-hidden="true">
        {props.slot === null ? '' : ordinal(props.slot)}
      </span>
    </>
  );

  return (
    <li class={props.classes.join(' ')} ref={props.boxRef}>
      {interactive ? (
        <button
          type="button"
          ref={props.anchorRef}
          class="unit-face"
          {...popupProps(open)}
          aria-label={`${spoken}. ${props.opens}`}
          onClick={props.onToggle}
        >
          {face}
        </button>
      ) : (
        // Display only: a tap shows the creature's role and element (`SmallCreature`).
        <SmallCreature
          id={c.id}
          info={creatureInfoOf(c)}
          class="unit-face"
          label={`${spoken}. Level ${String(c.level)}. Shows its role and element.`}
        >
          {face}
        </SmallCreature>
      )}
      {props.effects !== undefined && (
        <>
          <EffectIcons compact effects={props.effects} names={props.names} only="buff" />
          <EffectIcons compact effects={props.effects} names={props.names} only="debuff" />
        </>
      )}
      <Floats fx={props.fx} target={c.id} />
      <Bursts fx={props.fx} target={c.id} names={props.names} />
      <KoTags fx={props.fx} creature={c.id} />
    </li>
  );
}

/**
 * The role and element of a creature as tags, at the bottom of the ability popovers, so what a
 * small-creature popover would tell is one tap away on your own creatures too. Each tag opens its
 * glossary entry in the usual popover. Nothing for a creature that is not in the row (a basic
 * ability has none).
 */
export function CreatureTags({ creature }: { creature: ReplayRowEntry | undefined }) {
  if (creature === undefined) return null;
  return (
    <p class="tags pop-tags">
      <ElementChip element={creature.element} role={creature.role} />
    </p>
  );
}
