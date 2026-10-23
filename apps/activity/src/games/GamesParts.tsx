/**
 * The small pieces of the Games tab, shared by its screens, the creature page and the living room: a
 * medal or a pin as the art kit draws it, a row of medal counts, an event's favours as icons, the fit
 * pips, an event's scene as a thumbnail strip, one entry slot and the event card that holds them.
 * Pictures first, words only where a name is needed; every icon has a spoken name and taps open their
 * glossary entry.
 */
import type { ComponentChildren } from 'preact';
import type { Creature } from '../api';
import { shinyPalette } from '../art';
import { creatureName, getSpecies } from '../game';
import { GlossaryTag } from '../Glossary';
import { favourView, slotsOf, type FavourView } from '../games-view';
import type { GamesMedal, GamesNext, LineupEvent, MedalCounts } from '../games-types';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { GameIcon } from '../ui/GameIcon';
import { PipRow } from '../ui/PipRow';
import { GamesActor, GamesScene } from './art/GamesScene';
import { SCENE_SIZE, type GamesSceneId } from './art/scenes';
import { cssVars } from '../css-vars';
import { propSprite, propTinted, PROP_TINTS } from './art/props';
import { sceneOf } from './ShowStage';

const MEDAL_TINT: Readonly<Record<GamesMedal, number>> = { gold: 0, silver: 1, bronze: 2 };

export const MEDAL_NAME: Readonly<Record<GamesMedal | 'pins', string>> = {
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
  pins: 'Pins',
};

/** A medal of the art kit in its metal (decoration: the caller says what it is). */
export function MedalSprite({ medal, scale = 2 }: { medal: GamesMedal; scale?: number }) {
  const tint = PROP_TINTS.medal?.[MEDAL_TINT[medal]];
  return <Sprite sprite={propTinted('medal', tint)} scale={scale} class="gm-medal" />;
}

/** A personal-best pin (decoration). */
export function PinSprite({ scale = 2 }: { scale?: number }) {
  return <Sprite sprite={propSprite('pin', 0, 'purple')} scale={scale} class="gm-pin" />;
}

/**
 * Lifetime medals as pictures with counts: gold, silver, bronze and (unless `pins` is false) pins. Each
 * count is a glossary tag, so a tap says what medals and pins are. `hideZero` leaves out empty kinds.
 */
export function MedalCountsRow({
  medals,
  scale = 2,
  pins = true,
  hideZero = false,
  tags = true,
}: {
  medals: Pick<MedalCounts, 'gold' | 'silver' | 'bronze'> & { pins?: number };
  scale?: number;
  pins?: boolean;
  hideZero?: boolean;
  /** False: plain pictures and numbers (inside a button, a table cell that is not tappable). */
  tags?: boolean;
}) {
  const kinds: { key: GamesMedal | 'pins'; n: number }[] = [
    { key: 'gold', n: medals.gold },
    { key: 'silver', n: medals.silver },
    { key: 'bronze', n: medals.bronze },
    ...(pins ? [{ key: 'pins' as const, n: medals.pins ?? 0 }] : []),
  ];
  const shown = hideZero ? kinds.filter((k) => k.n > 0) : kinds;
  return (
    <ul class="gm-counts">
      {shown.map(({ key, n }) => {
        const body = (
          <>
            {key === 'pins' ? (
              <PinSprite scale={scale} />
            ) : (
              <MedalSprite medal={key} scale={scale} />
            )}
            <span class="gm-count pix">{n}</span>
          </>
        );
        const label = `${MEDAL_NAME[key]}: ${String(n)}`;
        return (
          <li key={key} class={`gm-kind is-${key}`}>
            {tags ? (
              <GlossaryTag
                entry={key === 'pins' ? 'games-pins' : 'games-medals'}
                look="chip"
                class="gm-tag"
                label={label}
              >
                {body}
              </GlossaryTag>
            ) : (
              <span class="gm-tag" role="img" aria-label={label}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One favour as an icon that opens its glossary entry. */
function FavourIcon({ view }: { view: FavourView }) {
  return (
    <GlossaryTag
      entry={view.entry}
      look="chip"
      class={`ge-favour is-${view.favour}`}
      label={view.label}
    >
      <GameIcon icon={view.icon} scale={2} />
    </GlossaryTag>
  );
}

/** What an event favours, as a row of icons. */
export function FavourIcons({ event }: { event: Pick<LineupEvent, 'favours' | 'name'> }) {
  return (
    <ul class="ge-favours" aria-label={`${event.name} favours`}>
      {event.favours.map((f) => (
        <li key={f}>
          <FavourIcon view={favourView(f)} />
        </li>
      ))}
    </ul>
  );
}

/** 1 to 5 pips: how well a creature fits an event. */
export function FitPips({ fit }: { fit: number }) {
  return <PipRow count={5} lit={fit} label={`Fit ${String(fit)} / 5`} />;
}

/** Where entrants stand in each scene (feet y, scene pixels): the bench, the table, the hill, the lake, the floe. */
const THUMB_FEET_Y: Readonly<Record<GamesSceneId, number>> = {
  sauna: 60,
  'frost-bath': 60,
  'pepper-table': 88,
  'melon-hill': 70,
  'shark-lake': 96,
  'ice-floe': 62,
};

/** The strip's height in scene pixels (the card shows it at 2x). */
const THUMB_ROWS = 52;

/**
 * An event's scene as a still strip at 2x, cropped round where its entrants stand, with your entered
 * creatures in it: who you sent is shown where they will play.
 */
export function EventThumb({
  scene,
  creatures = [],
}: {
  scene: string;
  creatures?: readonly Creature[];
}) {
  const id = sceneOf(scene);
  const feet = THUMB_FEET_Y[id];
  // The strip's top in scene pixels: the feet a little under the middle, kept inside the scene.
  const top = Math.max(0, Math.min(SCENE_SIZE.height - THUMB_ROWS, feet - 34));
  const n = creatures.length;
  return (
    <div
      class="ge-thumb"
      data-scene={id}
      aria-hidden="true"
      ref={cssVars({ '--dy': `${String(-top * 2)}px` })}
    >
      <GamesScene scene={id} scale={2} animate={false} frame={0}>
        {creatures.map((c, i) => {
          const palette = c.shiny ? shinyPalette(c.species) : undefined;
          return (
            <GamesActor
              key={c.id}
              x={SCENE_SIZE.width / 2 + Math.round((i - (n - 1) / 2) * 20)}
              y={feet}
              sprite={creatureSpriteOrFallback(c.species)}
              palette={palette}
              flip={i % 2 === 1}
            />
          );
        })}
      </GamesScene>
    </div>
  );
}

function CreatureSprite({ creature, scale }: { creature: Creature; scale: number }) {
  const palette = creature.shiny ? shinyPalette(creature.species) : undefined;
  return (
    <Sprite
      sprite={creatureSpriteOrFallback(creature.species)}
      scale={scale}
      {...(palette === undefined ? {} : { palette })}
    />
  );
}

export interface EntrySlotProps {
  creature: Creature | null;
  fit: number | null;
  /** A team event's slot: smaller, three to a row. */
  compact?: boolean;
  /** Tapping opens the picker; absent while entries are closed. */
  onOpen?: ((button: HTMLButtonElement) => void) | undefined;
  /** Names the slot for assistive technology ("Melon Run", "Sauna Stack, seat 2"). */
  label: string;
  disabled?: boolean;
}

/**
 * One entry slot: the creature (sprite, name in its rarity colour, fit pips) or an empty "+". A button
 * while entries are open, a plain box after the lock.
 */
export function EntrySlot({
  creature,
  fit,
  compact = false,
  onOpen,
  label,
  disabled,
}: EntrySlotProps) {
  const rarity = creature === null ? undefined : getSpecies(creature.species)?.rarity;
  const body =
    creature === null ? (
      <span class="ge-plus pix" aria-hidden="true">
        +
      </span>
    ) : (
      <>
        <CreatureSprite creature={creature} scale={compact ? 2 : 3} />
        <span class="ge-slot-text">
          <span
            class={
              rarity === undefined ? 'ge-slot-name' : `ge-slot-name rarity-name rarity-${rarity}`
            }
          >
            {creatureName(creature)}
          </span>
          {fit !== null && <FitPips fit={fit} />}
        </span>
      </>
    );
  const spoken =
    creature === null
      ? `${label}: empty`
      : `${label}: ${creatureName(creature)}${fit === null ? '' : `, fit ${String(fit)} / 5`}`;
  const classes = [
    'ge-slot',
    compact ? 'is-compact' : '',
    creature === null ? 'is-empty' : 'is-filled',
    onOpen === undefined ? 'is-locked' : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (onOpen === undefined) {
    return (
      <span class={classes} role="img" aria-label={spoken}>
        {creature === null ? null : body}
      </span>
    );
  }
  return (
    <button
      type="button"
      class={classes}
      aria-label={spoken}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={(event) => {
        onOpen(event.currentTarget);
      }}
    >
      {body}
    </button>
  );
}

/**
 * One event of the lineup: its scene as a strip with the name on a plate, what it favours as icons,
 * then its slot (one, or three for a team event). `onSlot` opens the picker for a slot (entries open).
 */
export function EventCard({
  event,
  next,
  creatures,
  onSlot,
  busy = false,
  children,
}: {
  event: LineupEvent;
  next: GamesNext;
  creatures: readonly Creature[];
  onSlot?: ((slot: number, button: HTMLButtonElement) => void) | undefined;
  busy?: boolean;
  /** More under the slots (a result). */
  children?: ComponentChildren;
}) {
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const fit = next.fit[event.id] ?? {};
  const slots = slotsOf(next, event);
  const team = slots.length > 1;
  return (
    <li class={team ? 'ge-card is-team' : 'ge-card'}>
      <EventThumb
        scene={event.scene}
        creatures={slots.flatMap((id) => {
          const c = id === null ? undefined : byId.get(id);
          return c === undefined ? [] : [c];
        })}
      />
      <div class="ge-head">
        <h3 class="ge-name">{event.name}</h3>
        <FavourIcons event={event} />
      </div>
      <div class="ge-slots">
        {slots.map((id, i) => {
          const creature = id === null ? null : (byId.get(id) ?? null);
          return (
            <EntrySlot
              key={i}
              creature={creature}
              fit={creature === null ? null : (fit[creature.id] ?? null)}
              compact={team}
              label={team ? `${event.name}, seat ${String(i + 1)}` : event.name}
              disabled={busy}
              onOpen={
                onSlot === undefined
                  ? undefined
                  : (button) => {
                      onSlot(i, button);
                    }
              }
            />
          );
        })}
      </div>
      {children}
    </li>
  );
}
