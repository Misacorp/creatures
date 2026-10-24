/**
 * The small pieces of the Games tab, shared by its screens, the creature page and the living room: a
 * medal or a pin as the art kit draws it, a row of medal counts, an event's favours as icons, the
 * "Good fit" badge, a creature's event badge (an event it has won, with the count) and the shelf of
 * them, an event's scene as a thumbnail strip, one entry slot and the event card that holds them.
 * Pictures first, words only where a name is needed; every icon has a spoken name and taps open their
 * glossary entry.
 */
import type { ComponentChildren } from 'preact';
import type { Creature } from '../api';
import { shinyPalette } from '../art';
import { gamesEventInfo, gamesFavourHelp, type GlossarySection } from '@creatures/game';
import { creatureName, getSpecies } from '../game';
import { GlossaryTag } from '../Glossary';
import { MORE_LABEL, TAG_ATTRIBUTE } from '../glossary-ui';
import { usePopoverTrigger } from '../PopoverHost';
import { PopoverCard, popupProps } from '../ui/Popover';
import { favourView, slotsOf, type FavourView } from '../games-view';
import type { GamesBadge, GamesMedal, GamesNext, LineupEvent, MedalCounts } from '../games-types';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { GameIcon } from '../ui/GameIcon';
import { Tag } from '../ui/Tag';
import { GamesActor, GamesScene, GamesSprite } from './art/GamesScene';
import { badgeSprite } from './art/badge';
import { MELON_FRAMES } from './art/drawn';
import type { SpriteDef } from '../sprites/sprite-data';
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

/**
 * One favour as an icon. In an event it opens what that favour means in the Games (`favourHelp`, one line,
 * the same in every event): the icon, the favour's name and that line, with the link to the Valley Games
 * section of How to play. A tag with no help line opens its general glossary entry.
 */
function FavourIcon({ view, eventId }: { view: FavourView; eventId: string }) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  const note = gamesFavourHelp(view.favour);
  if (note === undefined || host === null) {
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
  return (
    <button
      ref={ref}
      type="button"
      class={`gtag gtag-chip ge-favour is-${view.favour}`}
      {...popupProps(open)}
      aria-label={view.label}
      {...{ [TAG_ATTRIBUTE]: '' }}
      onClick={() => {
        if (ref.current === null) return;
        host.openCustom(`favour:${eventId}:${view.favour}`, ref.current, {
          label: view.label,
          body: <FavourNoteCard view={view} note={note} onMore={host.openHowTo} />,
        });
      }}
    >
      <GameIcon icon={view.icon} scale={2} />
    </button>
  );
}

/** The popover of a favour in an event: its icon, its name, what it means in the Games, and the link. */
export function FavourNoteCard({
  view,
  note,
  onMore,
}: {
  view: FavourView;
  note: string;
  onMore: (section: GlossarySection) => void;
}) {
  return (
    <PopoverCard
      visual={<GameIcon icon={view.icon} scale={4} />}
      title={view.label}
      short={note}
      more={{
        label: MORE_LABEL,
        onMore: () => {
          onMore('games');
        },
      }}
    />
  );
}

/** What an event favours, as a row of icons; each says what it means in the Games. */
export function FavourIcons({ event }: { event: Pick<LineupEvent, 'id' | 'favours' | 'name'> }) {
  return (
    <ul class="ge-favours" aria-label={`${event.name} favours`}>
      {event.favours.map((f) => (
        <li key={f}>
          <FavourIcon view={favourView(f)} eventId={event.id} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The "Good fit" badge: a green tick and the words. `tag` makes it a glossary tag (`games-good-fit`);
 * inside a button or a list option it is plain (the screen's help button explains it).
 */
export function GoodFitMark({ tag = false }: { tag?: boolean }) {
  const body = (
    <>
      <GameIcon icon={{ kind: 'glyph', id: 'good-fit' }} scale={2} />
      <span class="ge-goodfit-text">Good fit</span>
    </>
  );
  if (tag) {
    return (
      <GlossaryTag entry="games-good-fit" look="chip" class="ge-goodfit">
        {body}
      </GlossaryTag>
    );
  }
  return <span class="ge-goodfit">{body}</span>;
}

/** The spoken name of an event badge: "Pepper Panic badge, won 3 times". */
export function badgeLabel(badge: GamesBadge): string {
  const name = gamesEventInfo(badge.eventId)?.name ?? badge.eventId;
  return `${name} badge, won ${badge.wins === 1 ? 'once' : `${String(badge.wins)} times`}`;
}

/**
 * A creature's badge for an event it has won: the event's medallion (its scene's colour and glyph) and
 * the count ("×3"). `tag` makes it a glossary tag (`games-badges`); `named` writes the event's name
 * beside it (the creature page's shelf); inside a button or a list option it is plain.
 */
export function EventBadge({
  badge,
  scale = 2,
  tag = false,
  named = false,
}: {
  badge: GamesBadge;
  scale?: number;
  tag?: boolean;
  named?: boolean;
}) {
  const info = gamesEventInfo(badge.eventId);
  const body = (
    <>
      <Sprite sprite={badgeSprite(info?.scene, info?.kind)} scale={scale} />
      {named && <span class="ge-badge-name">{info?.name ?? badge.eventId}</span>}
      <span class="ge-badge-count pix">×{badge.wins}</span>
    </>
  );
  const label = badgeLabel(badge);
  if (tag) {
    return (
      <GlossaryTag entry="games-badges" look="chip" class="ge-badge" label={label}>
        {body}
      </GlossaryTag>
    );
  }
  return (
    <span class="ge-badge" role="img" aria-label={label}>
      {body}
    </span>
  );
}

/** A creature's event badges, one per event it has won, most wins first (nothing when it has none). */
export function BadgeShelf({ badges }: { badges: readonly GamesBadge[] }) {
  if (badges.length === 0) return null;
  const sorted = [...badges].sort((a, b) => b.wins - a.wins || a.eventId.localeCompare(b.eventId));
  return (
    <ul class="ge-shelf" aria-label="Event badges">
      {sorted.map((b) => (
        <li key={b.eventId}>
          <EventBadge badge={b} tag named />
        </li>
      ))}
    </ul>
  );
}

/**
 * How each scene's thumbnail is cropped: where entrants stand (feet y, scene pixels), the strip's top,
 * and the scene's signature prop (the melon, a fin, the peppers), so the strip shows what the event is.
 */
const THUMBS: Readonly<
  Record<GamesSceneId, { feet: number; top: number; props: readonly ThumbProp[] }>
> = {
  sauna: { feet: 60, top: 22, props: [] },
  'frost-bath': { feet: 60, top: 22, props: [] },
  'pepper-table': {
    feet: 56,
    top: 24,
    props: [
      { sprite: () => propSprite('pepper', 0, 'red'), x: 60, y: 57 },
      { sprite: () => propSprite('pepper', 0, 'green'), x: 132, y: 57 },
      { sprite: () => propSprite('pepper', 0, 'ghost'), x: 150, y: 57 },
    ],
  },
  'melon-hill': {
    feet: 74,
    top: 34,
    props: [{ sprite: () => MELON_FRAMES[0] ?? propSprite('dust'), x: 34, y: 82 }],
  },
  'shark-lake': {
    feet: 74,
    top: 38,
    props: [
      { sprite: () => propSprite('sharkFin'), x: 40, y: 66 },
      { sprite: () => propSprite('sharkFin'), x: 150, y: 80 },
    ],
  },
  'ice-floe': { feet: 62, top: 26, props: [] },
  'log-trail': {
    feet: 74,
    top: 34,
    props: [{ sprite: () => propSprite('log'), x: 96, y: 61 }],
  },
  'pumpkin-hill': {
    feet: 74,
    top: 34,
    props: [{ sprite: () => propSprite('pumpkin'), x: 130, y: 75 }],
  },
  'barrel-pond': {
    feet: 94,
    top: 48,
    props: [
      { sprite: () => propSprite('barrel', 6, undefined, 'blue'), x: 40, y: 64 },
      { sprite: () => propSprite('barrel', 3, undefined, 'red'), x: 152, y: 64 },
    ],
  },
  'crate-yard': {
    feet: 94,
    top: 48,
    props: [
      { sprite: () => propSprite('teamCrate', 0, undefined, 'yellow'), x: 150, y: 94 },
      { sprite: () => propSprite('teamCrate', 0, undefined, 'yellow'), x: 150, y: 89 },
      { sprite: () => propSprite('teamCrate', 0, undefined, 'yellow'), x: 150, y: 84 },
    ],
  },
  'kite-hill': {
    feet: 98,
    top: 52,
    props: [
      { sprite: () => propSprite('kite', 0, undefined, 'red'), x: 40, y: 64 },
      { sprite: () => propSprite('kite', 1, undefined, 'blue'), x: 150, y: 60 },
    ],
  },
};

interface ThumbProp {
  sprite: () => SpriteDef;
  x: number;
  /** Feet (bottom centre) in scene pixels. */
  y: number;
}

/** The strip's height in scene pixels (the card shows it at 2x). */
const THUMB_ROWS = 52;

/**
 * An event's scene as a still strip at 2x, cropped round where its entrants stand, with its signature
 * prop and your entered creatures in it: who you sent is shown where they will play.
 */
export function EventThumb({
  scene,
  creatures = [],
}: {
  scene: string;
  creatures?: readonly Creature[];
}) {
  const id = sceneOf(scene);
  const thumb = THUMBS[id];
  const top = Math.max(0, Math.min(SCENE_SIZE.height - THUMB_ROWS, thumb.top));
  const n = creatures.length;
  return (
    <div
      class="ge-thumb"
      data-audit-clip
      data-scene={id}
      aria-hidden="true"
      ref={cssVars({ '--dy': `${String(-top * 2)}px` })}
    >
      <GamesScene
        scene={id}
        scale={2}
        animate={false}
        frame={0}
        overlay={thumb.props.map((p, i) => (
          <GamesSprite key={i} x={p.x} y={p.y} sprite={p.sprite()} />
        ))}
      >
        {creatures.map((c, i) => {
          const palette = c.shiny ? shinyPalette(c.species) : undefined;
          return (
            <GamesActor
              key={c.id}
              x={SCENE_SIZE.width / 2 + Math.round((i - (n - 1) / 2) * 20)}
              y={thumb.feet}
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
  /** The entered creature has the event's "Good fit" badge. */
  goodFit: boolean;
  /** A team event's slot: smaller, three to a row. */
  compact?: boolean;
  /** Tapping opens the picker; absent while entries are closed. */
  onOpen?: ((button: HTMLButtonElement) => void) | undefined;
  /** Names the slot for assistive technology ("Melon Run", "Sauna Stack, seat 2"). */
  label: string;
  disabled?: boolean;
}

/**
 * One entry slot: the creature (sprite, name in its rarity colour, the "Good fit" badge when it has it)
 * or an empty "+". A button while entries are open, a plain box after the lock.
 */
export function EntrySlot({
  creature,
  goodFit,
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
          {goodFit && <GoodFitMark />}
        </span>
      </>
    );
  const spoken =
    creature === null
      ? `${label}: empty`
      : `${label}: ${creatureName(creature)}${goodFit ? ', good fit' : ''}`;
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
 * One event of the lineup: its scene as a strip with the name on a plate (the bonus event with a gold
 * "Bonus" ribbon on it), what it favours as icons, then its slot (one, or three for a team event). `onSlot` opens the picker for a slot (entries open).
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
  const good = new Set(next.goodFit[event.id] ?? []);
  const slots = slotsOf(next, event);
  const team = slots.length > 1;
  return (
    <li class={team ? 'ge-card is-team' : 'ge-card'}>
      {event.bonus === true && (
        <Tag kind="badge" entry="games-bonus" class="ge-bonus" label="Bonus event">
          Bonus
        </Tag>
      )}
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
        {team && (
          <Tag entry="games-team" label="Team event">
            Team
          </Tag>
        )}
      </div>
      <div class="ge-slots">
        {slots.map((id, i) => {
          const creature = id === null ? null : (byId.get(id) ?? null);
          return (
            <EntrySlot
              key={i}
              creature={creature}
              goodFit={creature !== null && good.has(creature.id)}
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
