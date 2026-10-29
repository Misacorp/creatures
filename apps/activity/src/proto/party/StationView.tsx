import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { expeditionContent } from '@creatures/game';
import { bannerArt, bossArt } from '../../art';
import { cssVars } from '../../css-vars';
import { ItemCard } from '../../ItemCard';
import { ItemFrame, ItemSprite } from '../../GearArt';
import { creatureName, speciesName } from '../../game';
import { GearItemsContext } from '../../gear-items-context';
import { gearName } from '../../gear-view';
import { glyphOrUnknown } from '../../glyphs';
import { drawSprites } from '../../room-canvas';
import { roomScene } from '../../sprites/room-art';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { PACK_ART } from '../../sprites/pack-art';
import { worldSprite } from '../../sprites/world-map-art';
import { ElementChip } from '../../sprites/ElementChip';
import { destinationName, supplyName } from '../../trip-view';
import { ActionButton } from '../../ui/ActionButton';
import { CountBadge } from '../../ui/CountBadge';
import { FindItem } from '../../ui/FindItem';
import { FindList } from '../../ui/FindRow';
import { PipRow } from '../../ui/PipRow';
import { Popover, popupProps } from '../../ui/Popover';
import { TimerBar } from '../../ui/TimerBar';
import { XpGain, XpList } from '../../ui/XpGain';
import { craftingGain } from '../../xp-gain';
import type { ExpeditionLength } from '../../expedition-types';
import { RAID_TEAM_SIZE, creatureOf, tripsHome, tripsOut } from '../world';
import { greyed, roomProp } from './art';
import {
  closeView,
  collectCraft,
  enterGames,
  goOnTrip,
  startCraft,
  sendToStation,
} from './party-actions';
import { CAVE_TEAM_SIZE, type PartyState, type StationId } from './party-state';
import { Ground, PixelScene } from './Scene';
import { stationDef, stationVerdict } from './stations';
import { clock } from './Today';

type SetState = (change: (s: PartyState) => PartyState) => void;

interface ViewProps {
  state: PartyState;
  setState: SetState;
  scale: number;
  wide: boolean;
}

/** A creature's sprite (decorative unless `alt`). */
function Mon({
  species,
  scale,
  alt,
  away = false,
  class: extra,
}: {
  species: string;
  scale: number;
  alt?: string;
  away?: boolean;
  class?: string;
}) {
  return (
    <span class={extra === undefined ? 'pp-v-mon' : `pp-v-mon ${extra}`}>
      <Sprite
        sprite={creatureSpriteOrFallback(species)}
        scale={scale}
        {...(alt === undefined ? {} : { alt })}
      />
      {away && <Sprite sprite={PACK_ART} scale={Math.max(1, scale - 1)} class="pp-pack" />}
    </span>
  );
}

/** The held creature, standing at the edge of the scene (it came with you). */
function Visitor({ state, scale }: { state: PartyState; scale: number }) {
  if (state.held === null) return null;
  const c = creatureOf(state.world, state.held);
  return (
    <span class="pp-visitor">
      <Mon species={c.species} scale={scale} class="pp-hop" />
      <span class="pp-visitor-name">{creatureName(c)}</span>
    </span>
  );
}

/** The frame of every station view: the grass (or the room), a small back arrow, the scene. */
function ViewShell({
  id,
  setState,
  scale,
  ground = true,
  children,
}: {
  id: StationId;
  state: PartyState;
  setState: SetState;
  scale: number;
  ground?: boolean;
  children: ComponentChildren;
}) {
  return (
    <section class={`pp-view pp-view-${id}`} aria-label={stationDef(id).name}>
      {ground && <Ground scale={scale} version={`${id}-${String(scale)}`} />}
      <button
        type="button"
        class="pp-back"
        aria-label="Back to the clearing"
        onClick={() => {
          setState(closeView);
        }}
      >
        <svg viewBox="0 0 5 7" aria-hidden="true" shape-rendering="crispEdges">
          <path d="M3 0h2v1h-1v1h-1v1h-1v1h1v1h1v1h1v1h-2v-1h-1v-1h-1v-1h-1v-1h1v-1h1v-1h1z" />
        </svg>
      </button>
      {children}
    </section>
  );
}

// --- Road: the destination signs ---

const LENGTHS: { id: ExpeditionLength; hours: number }[] = [
  { id: 'short', hours: 2 },
  { id: 'medium', hours: 6 },
  { id: 'long', hours: 12 },
  { id: 'day', hours: 24 },
];

function closedWord(closed: readonly string[]): string | null {
  if (closed.includes('night')) return 'Night';
  if (closed.includes('festival')) return 'Closed';
  return null;
}

function RoadView({ state, setState, scale }: ViewProps) {
  const { world } = state;
  const held = state.held === null ? null : creatureOf(world, state.held);
  const out = tripsOut(world);
  const home = tripsHome(world);
  const signScale = scale;
  const chosen = state.road.destination;
  const supplies = Object.entries(world.supplies).filter(([, n]) => n > 0);
  return (
    <ViewShell id="road" state={state} setState={setState} scale={scale}>
      <Visitor state={state} scale={3} />
      <ul class="pp-signs" aria-label="Places">
        {world.destinations.destinations.map((d) => {
          const shut = closedWord(d.closed);
          const rank = held?.explorer?.rank ?? 1;
          const word =
            shut ?? (held !== null && rank < d.minRank ? `Rank ${String(d.minRank)}` : null);
          const here = [...out, ...home].filter((t) => t.destination === d.id);
          const lit = word === null && (held !== null || state.ask === 'road');
          return (
            <li key={d.id}>
              <button
                type="button"
                class={[
                  'pp-sign',
                  chosen === d.id ? 'is-chosen' : '',
                  word !== null ? 'is-dim' : '',
                  lit && chosen !== d.id ? 'is-lit' : '',
                ]
                  .filter((c) => c !== '')
                  .join(' ')}
                aria-pressed={chosen === d.id}
                aria-label={`${destinationName(d.id)}${word === null ? '' : `, closed: ${word.toLowerCase()}`}${here.length > 0 ? `, ${String(here.length)} of yours there` : ''}`}
                disabled={word !== null}
                onClick={() => {
                  setState((s) => ({
                    ...s,
                    road: { ...s.road, destination: d.id },
                    ask: s.held === null ? 'road' : null,
                    said: `${destinationName(d.id)} picked.${s.held === null ? ' Who goes?' : ''}`,
                  }));
                }}
              >
                <Sprite sprite={bannerArt(d.id)} scale={signScale} />
                <span class="pp-sign-name">{destinationName(d.id)}</span>
                <span class="pp-sign-who">
                  {here.map((t) => (
                    <Mon
                      key={t.id}
                      species={creatureOf(world, t.creatureId).species}
                      scale={2}
                      away={t.endsAt > world.now}
                    />
                  ))}
                </span>
                {word !== null && <span class="pp-word pp-sign-word">{word}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {held !== null && chosen !== null && (
        <div class="pp-pack-row pix-panel" role="group" aria-label="Pack for the trip">
          <div class="pp-lengths" role="radiogroup" aria-label="Length">
            {LENGTHS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={state.road.length === l.id}
                class={state.road.length === l.id ? 'pp-chip is-on' : 'pp-chip'}
                onClick={() => {
                  setState((s) => ({ ...s, road: { ...s.road, length: l.id } }));
                }}
              >
                <Sprite sprite={glyphOrUnknown('clock')} scale={2} />
                {`${String(l.hours)}h`}
              </button>
            ))}
          </div>
          <div class="pp-supplies" role="group" aria-label="Supplies">
            {supplies.map(([id, n]) => {
              const on = state.road.supply === id;
              const kind = id.replace(/-basic$/, '');
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${supplyName(id)}, ${String(n)} owned`}
                  class={on ? 'pp-chip is-on' : 'pp-chip'}
                  onClick={() => {
                    setState((s) => ({ ...s, road: { ...s.road, supply: on ? null : id } }));
                  }}
                >
                  <Sprite sprite={glyphOrUnknown(kind)} scale={2} />
                  {String(n)}
                </button>
              );
            })}
          </div>
          <ActionButton
            label="Go"
            detail={destinationName(chosen)}
            onClick={() => {
              setState(goOnTrip);
            }}
          />
        </div>
      )}
    </ViewShell>
  );
}

// --- Forge: two anvils by the fire ---

function ForgeView({ state, setState, scale }: ViewProps) {
  const { world } = state;
  const open = world.jobs.filter((j) => j.status !== 'claimed');
  const anvils = Array.from({ length: world.jobSlots.total }, (_, i) => open[i] ?? null);
  const firstFree = anvils.findIndex((a) => a === null);
  const held = state.held === null ? null : creatureOf(world, state.held);
  const heldOk = held !== null && stationVerdict('forge', held.id, state).ok;
  const moment = state.moment;
  const crafted =
    moment?.kind === 'crafted' ? world.jobs.find((j) => j.id === moment.jobId) : undefined;
  const made = crafted?.result?.kind === 'craft' ? crafted.result : null;
  const scrap = world.parts.scrap;
  return (
    <ViewShell id="forge" state={state} setState={setState} scale={scale}>
      <div class="pp-forge-back" aria-hidden="true">
        <PixelScene
          art={{
            width: 36,
            height: 35,
            placed: [{ sprite: roomProp('fireplace'), x: 0, y: 0 }],
          }}
          scale={scale + 1}
        />
      </div>
      {made !== null && crafted !== undefined && (
        <GearItemsContext.Provider value={world.items}>
          <div class="pp-made pix-panel">
            <FindList label="Made">
              <FindItem
                id={made.gearId}
                baseId={made.baseId}
                rarity={made.rarity}
                level={made.itemLevel}
                motion
                scale={3}
              />
            </FindList>
            <XpList label="Crafting">
              <XpGain
                change={craftingGain(made, creatureName(creatureOf(world, crafted.creatureId)))}
                what="Crafting XP"
                label="Crafting"
              />
            </XpList>
          </div>
        </GearItemsContext.Provider>
      )}
      <div class="pp-anvil-row">
        {anvils.map((job, i) => {
          if (job !== null) {
            const worker = creatureOf(world, job.creatureId);
            const ready = job.status === 'ready';
            const what = gearName(job.input.baseId ?? 'kelp-cap');
            return (
              <div key={job.id} class="pp-anvil-spot">
                <button
                  type="button"
                  class={ready ? 'pp-big-anvil is-ready' : 'pp-big-anvil'}
                  aria-label={
                    ready
                      ? `Collect ${what} from ${creatureName(worker)}`
                      : `${creatureName(worker)} crafts ${what}`
                  }
                  onClick={() => {
                    if (ready) setState((s) => collectCraft(s, job.id));
                  }}
                >
                  {job.input.baseId !== undefined && (
                    <ItemSprite
                      baseId={job.input.baseId}
                      scale={3}
                      class={ready ? 'pp-float' : 'pp-ghost'}
                    />
                  )}
                  <Sprite sprite={glyphOrUnknown('anvil')} scale={scale * 3} />
                  <Mon species={worker.species} scale={3} class="pp-smith" />
                </button>
                {!ready && (
                  <div class="pp-anvil-timer">
                    <TimerBar
                      startedAt={job.startedAt}
                      endsAt={job.endsAt}
                      now={world.now}
                      label={`${what}: in progress`}
                      state={`done ${clock(job.endsAt, world.timezone)}`}
                    />
                  </div>
                )}
              </div>
            );
          }
          const here = heldOk && i === firstFree;
          return (
            <div key={`free-${String(i)}`} class="pp-anvil-spot">
              <button
                type="button"
                class={[
                  'pp-big-anvil is-free',
                  here ? 'is-here' : '',
                  state.ask === 'forge' || (heldOk && !here) ? 'is-lit' : '',
                ]
                  .filter((c) => c !== '')
                  .join(' ')}
                aria-label={
                  here && held !== null
                    ? `${creatureName(held)} at the anvil`
                    : 'Who works? Pick a creature'
                }
                onClick={() => {
                  if (held !== null && heldOk) return;
                  setState((s) => ({ ...s, ask: 'forge', said: 'Who works? Pick a creature.' }));
                }}
              >
                <Sprite
                  sprite={here ? glyphOrUnknown('anvil') : greyed(glyphOrUnknown('anvil'))}
                  scale={scale * 3}
                />
                {here && held !== null && (
                  <Mon species={held.species} scale={3} class="pp-smith pp-hop" />
                )}
              </button>
            </div>
          );
        })}
      </div>
      {heldOk && held !== null && firstFree >= 0 && (
        <div class="pp-pack-row pix-panel" role="group" aria-label={`${creatureName(held)} crafts`}>
          <div class="pp-blueprints" role="radiogroup" aria-label="Blueprint">
            {world.blueprints.map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={state.forgeBase === b}
                aria-label={gearName(b)}
                class={state.forgeBase === b ? 'pp-chip pp-bp is-on' : 'pp-chip pp-bp'}
                onClick={() => {
                  setState((s) => ({ ...s, forgeBase: b }));
                }}
              >
                <ItemSprite baseId={b} scale={3} />
              </button>
            ))}
          </div>
          <span class="pp-cost">
            <CountBadge icon={{ kind: 'part', part: 'scrap' }} amount={6} label="Scrap" />
            <span class="pp-cost-have">/{String(scrap)}</span>
          </span>
          <ActionButton
            label="Start"
            detail={state.forgeBase === null ? '' : gearName(state.forgeBase)}
            disabled={state.forgeBase === null || scrap < 6}
            onClick={() => {
              setState(startCraft);
            }}
          />
        </div>
      )}
    </ViewShell>
  );
}

// --- Arena: the boss and three pedestals ---

function ArenaView({ state, setState, scale, wide }: ViewProps) {
  const { world } = state;
  const boss = world.raid.boss;
  const art = bossArt(boss.id);
  const team = world.raid.you.team?.creatures ?? [];
  const allies = (world.raid.party?.row ?? []).flatMap((s) =>
    s.creature !== null && !s.creature.mine ? [s.creature] : [],
  );
  const heldOk = state.held !== null && stationVerdict('arena', state.held, state).ok;
  const asking = state.ask === 'arena';
  const rock = worldSprite('rock');
  return (
    <ViewShell id="arena" state={state} setState={setState} scale={scale}>
      <div class="pp-ring" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <Sprite
            key={i}
            sprite={rock}
            scale={scale + 1}
            class={`pp-ring-rock pp-ring-${String(i)}`}
          />
        ))}
      </div>
      <div class="pp-boss">
        <Sprite sprite={art.sprite} scale={wide ? 7 : 5} alt={boss.name} class="pp-boss-art" />
        <span class="pp-boss-tags">
          <ElementChip element={boss.element} context="boss" />
          <span class="pp-boss-name">{boss.name}</span>
        </span>
      </div>
      <div class="pp-allies" aria-label="Your party's other creatures">
        {allies.map((a) => (
          <Mon
            key={`${a.ownerName}-${a.name}`}
            species={a.species}
            scale={2}
            alt={`${a.ownerName}'s ${a.name}`}
          />
        ))}
      </div>
      <div class="pp-pedestals">
        {Array.from({ length: RAID_TEAM_SIZE }, (_, i) => {
          const placed = team[i];
          if (placed !== undefined) {
            return (
              <span
                key={i}
                class="pp-pedestal is-full"
                aria-label={`${placed.name} placed`}
                role="img"
              >
                <Mon species={placed.species} scale={3} />
                <Sprite sprite={glyphOrUnknown('blade')} scale={2} class="pp-ped-mark" />
              </span>
            );
          }
          const lit = heldOk || asking;
          return (
            <button
              key={i}
              type="button"
              class={lit ? 'pp-pedestal is-lit' : 'pp-pedestal'}
              aria-label={
                heldOk && state.held !== null
                  ? `Place ${creatureName(creatureOf(world, state.held))} here`
                  : 'Empty spot: pick a creature'
              }
              onClick={() => {
                if (heldOk) setState((s) => sendToStation(s, 'arena'));
                else
                  setState((s) => ({ ...s, ask: 'arena', said: 'Pick a creature for the raid.' }));
              }}
            >
              {lit && <i class="pp-arrow" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <Visitor state={state} scale={3} />
      <span class="pp-arena-count">
        <PipRow
          count={RAID_TEAM_SIZE}
          lit={team.length}
          size="md"
          label={`${String(team.length)} of ${String(RAID_TEAM_SIZE)} placed`}
        />
      </span>
    </ViewShell>
  );
}

// --- Cave: today's run ---

function CaveView({ state, setState, scale }: ViewProps) {
  const { world } = state;
  const d = world.dungeon;
  const heldOk = state.held !== null && stationVerdict('cave', state.held, state).ok;
  const [note, setNote] = useState(false);
  return (
    <ViewShell id="cave" state={state} setState={setState} scale={scale}>
      <div class="pp-cave-mouth">
        <PixelScene
          art={{
            width: 55,
            height: 44,
            placed: [{ sprite: greyed(worldSprite('emberCaves')), x: 0, y: 0 }],
          }}
          scale={scale + 1}
        />
        <span class={d.canRun ? 'pp-door is-open' : 'pp-door'}>
          <Sprite sprite={glyphOrUnknown(d.canRun ? 'map-door' : 'check')} scale={scale * 2} />
        </span>
      </div>
      <div class="pp-cave-facts">
        <span class="pp-fact" role="img" aria-label={`Floor ${String(d.depth)}`}>
          <Sprite sprite={glyphOrUnknown('map-descend')} scale={2} />
          {String(d.depth)}
        </span>
        <PipRow
          count={d.attemptsAllowed}
          lit={d.attemptsAllowed - d.attemptsToday}
          size="md"
          label={`${String(d.attemptsAllowed - d.attemptsToday)} of ${String(d.attemptsAllowed)} tries left today`}
        />
        <span
          class="pp-fact"
          role="img"
          aria-label={`Resets at ${clock(d.resetsAt, world.timezone)}`}
        >
          <Sprite sprite={glyphOrUnknown('clock')} scale={2} />
          {clock(d.resetsAt, world.timezone)}
        </span>
      </div>
      <div class="pp-team" role="group" aria-label="Today's team">
        {Array.from({ length: CAVE_TEAM_SIZE }, (_, i) => {
          const id = state.caveTeam[i];
          if (id !== undefined) {
            const c = creatureOf(world, id);
            return (
              <span
                key={i}
                class="pp-team-slot is-full"
                role="img"
                aria-label={`${creatureName(c)} in the team`}
              >
                <Mon species={c.species} scale={3} />
              </span>
            );
          }
          const lit = heldOk || state.ask === 'cave';
          return (
            <button
              key={i}
              type="button"
              class={lit ? 'pp-team-slot is-lit' : 'pp-team-slot'}
              aria-label={heldOk ? 'Join the team here' : 'Empty: pick a creature'}
              onClick={() => {
                if (heldOk) setState((s) => sendToStation(s, 'cave'));
                else
                  setState((s) => ({
                    ...s,
                    ask: 'cave',
                    said: 'Pick a creature for today’s run.',
                  }));
              }}
            >
              {lit && <i class="pp-arrow" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div class="pp-view-go">
        <ActionButton
          label="Enter"
          disabled={state.caveTeam.length === 0 || !d.canRun}
          onClick={() => {
            setNote(true);
          }}
        />
        {note && <p class="pp-note">The run itself is not in this prototype.</p>}
      </div>
      <Visitor state={state} scale={3} />
    </ViewShell>
  );
}

// --- House: a corner of the living room ---

const ROOM_CROP = { x: 0, width: 112, height: 56 };

function RoomCanvas({ scale }: { scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = ROOM_CROP.width * scale;
  const height = ROOM_CROP.height * scale;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    drawSprites(ctx, roomScene('day').props, scale, -ROOM_CROP.x * scale, { width, height });
  }, [scale, width, height]);
  return <canvas ref={ref} class="pp-room" width={width} height={height} aria-hidden="true" />;
}

const SEATS = [
  { x: 30, y: 35 },
  { x: 56, y: 28 },
  { x: 72, y: 28 },
  { x: 88, y: 28 },
  { x: 2, y: 40 },
  { x: 16, y: 22 },
];

function HouseView({ state, setState, scale, wide }: ViewProps) {
  const { world } = state;
  const roomScale = wide ? 5 : 3;
  const lounger = state.lounger === null ? null : creatureOf(world, state.lounger);
  const others = world.residents.filter((r) => r.name !== 'You' && r.creature !== null);
  const sitters = [
    ...(lounger === null
      ? []
      : [
          {
            key: lounger.id,
            species: lounger.species,
            label: `${creatureName(lounger)}, yours, lounging`,
          },
        ]),
    ...others.map((r) => ({
      key: r.userId,
      species: r.creature?.species ?? 'cindle',
      label: `${r.name}'s ${speciesName(r.creature?.species ?? 'cindle')}`,
    })),
  ].slice(0, SEATS.length);
  const heldOk = state.held !== null && stationVerdict('house', state.held, state).ok;
  return (
    <ViewShell id="house" state={state} setState={setState} scale={scale} ground={false}>
      <div class="pp-room-wrap">
        <RoomCanvas scale={roomScale} />
        {sitters.map((s, i) => {
          const seat = SEATS[i] ?? { x: 0, y: 0 };
          return (
            <span
              key={s.key}
              class={i === 0 && lounger !== null ? 'pp-sitter is-mine' : 'pp-sitter'}
              ref={cssVars({
                '--x': `${String(seat.x * roomScale)}px`,
                '--y': `${String(seat.y * roomScale)}px`,
              })}
              role="img"
              aria-label={s.label}
            >
              <Sprite sprite={creatureSpriteOrFallback(s.species)} scale={roomScale} />
            </span>
          );
        })}
      </div>
      <p class="pp-room-count">
        <Sprite sprite={glyphOrUnknown('couch')} scale={2} />
        {String(sitters.length)} here
      </p>
      {heldOk && (
        <div class="pp-view-go">
          <ActionButton
            label="Lounge"
            detail={state.held === null ? '' : creatureName(creatureOf(world, state.held))}
            onClick={() => {
              setState((s) => sendToStation(s, 'house'));
            }}
          />
        </div>
      )}
      <Visitor state={state} scale={3} />
    </ViewShell>
  );
}

// --- Chest: the bag's pieces on the floor ---

function ChestView({ state, setState, scale }: ViewProps) {
  const { world } = state;
  const [open, setOpen] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const held = state.held === null ? null : creatureOf(world, state.held);
  const item = world.items.find((i) => i.id === open);
  return (
    <ViewShell id="chest" state={state} setState={setState} scale={scale}>
      <div class="pp-chest-lid" aria-hidden="true">
        <Sprite sprite={glyphOrUnknown('map-cache')} scale={scale * 4} />
      </div>
      <p
        class="pp-bag-count"
        role="img"
        aria-label={`${String(world.items.length)} of 60 in the bag`}
      >
        {String(world.items.length)}/60
      </p>
      <ul class="pp-pieces" aria-label="Gear in the bag">
        {world.items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              ref={(el) => {
                if (el === null) refs.current.delete(i.id);
                else refs.current.set(i.id, el);
              }}
              class="pp-piece"
              aria-label={`${gearName(i.baseId)}, ${i.rarity}`}
              {...popupProps(open === i.id)}
              onClick={() => {
                setOpen((o) => (o === i.id ? null : i.id));
              }}
            >
              <ItemFrame rarity={i.rarity} baseId={i.baseId} level={i.itemLevel}>
                <ItemSprite baseId={i.baseId} scale={3} />
              </ItemFrame>
            </button>
          </li>
        ))}
      </ul>
      {item !== undefined && (
        <Popover
          layer="page"
          anchor={() => refs.current.get(item.id) ?? null}
          label={gearName(item.baseId)}
          onClose={() => {
            setOpen(null);
          }}
        >
          <ItemCard item={item} plainRarity />
          {held !== null && (
            <ActionButton
              label={`Put on ${creatureName(held)}`}
              wide
              onClick={() => {
                setOpen(null);
                setState((s) => ({
                  ...s,
                  held: null,
                  said: `${creatureName(held)} wears ${gearName(item.baseId)} (not saved in the prototype).`,
                }));
              }}
            />
          )}
        </Popover>
      )}
      <Visitor state={state} scale={3} />
    </ViewShell>
  );
}

// --- Lectern: the Journal's newest page ---

function LecternView({ state, setState, scale }: ViewProps) {
  const page =
    expeditionContent.journal.entries.find((e) => e.place === 'verdant-hollow') ??
    expeditionContent.journal.entries[0];
  return (
    <ViewShell id="lectern" state={state} setState={setState} scale={scale}>
      <div class="pp-book pix-panel">
        <Sprite sprite={glyphOrUnknown('journal')} scale={3} />
        {page !== undefined && (
          <>
            <h3 class="pp-page-title">{page.title}</h3>
            <p class="pp-page-text prose">{page.text}</p>
          </>
        )}
      </div>
    </ViewShell>
  );
}

// --- Fairground: today's events ---

function FairView({ state, setState, scale, wide }: ViewProps) {
  const { world } = state;
  const games = world.games.next;
  const heldOk = state.held !== null && stationVerdict('fair', state.held, state).ok;
  return (
    <ViewShell id="fair" state={state} setState={setState} scale={scale}>
      <div class="pp-fair-grounds" aria-hidden="true">
        <PixelScene
          art={{
            width: 56,
            height: 45,
            placed: [{ sprite: worldSprite('festivalGrounds'), x: 0, y: 0 }],
          }}
          scale={wide ? 4 : 3}
        />
      </div>
      <p
        class="pp-fair-when"
        role="img"
        aria-label={`The show starts at ${clock(games.showAt, world.timezone)}`}
      >
        <Sprite sprite={glyphOrUnknown('trophy')} scale={2} />
        {clock(games.showAt, world.timezone)}
      </p>
      <ul class="pp-events" aria-label="Events">
        {games.lineup.map((e) => {
          const entered = state.fair.entries[e.id] ?? [];
          const lit = heldOk || (state.ask === 'fair' && state.fair.event === e.id);
          return (
            <li key={e.id}>
              <button
                type="button"
                class={[
                  'pp-event',
                  state.fair.event === e.id ? 'is-chosen' : '',
                  heldOk ? 'is-lit' : '',
                ]
                  .filter((c) => c !== '')
                  .join(' ')}
                aria-label={`${e.name}, team of ${String(e.team)}${entered.length > 0 ? `, ${String(entered.length)} entered` : ''}`}
                onClick={() => {
                  setState((s) => {
                    const next = { ...s, fair: { ...s.fair, event: e.id } };
                    return s.held !== null
                      ? enterGames(next)
                      : { ...next, ask: 'fair', said: `${e.name}: who enters?` };
                  });
                }}
              >
                <span class="pp-event-flag" aria-hidden="true">
                  <Sprite sprite={glyphOrUnknown('flag')} scale={3} />
                </span>
                <span class="pp-event-name">{e.name}</span>
                <span class="pp-event-team">
                  {Array.from({ length: e.team }, (_, i) => {
                    const id = entered[i];
                    return id === undefined ? (
                      <i key={i} class="pp-event-seat" />
                    ) : (
                      <Mon key={i} species={creatureOf(world, id).species} scale={2} />
                    );
                  })}
                </span>
                {lit && <i class="pp-arrow" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      <Visitor state={state} scale={3} />
    </ViewShell>
  );
}

/** The open station's own small scene, in the clearing's place. */
export function StationView(props: ViewProps) {
  switch (props.state.open) {
    case 'road':
      return <RoadView {...props} />;
    case 'forge':
      return <ForgeView {...props} />;
    case 'arena':
      return <ArenaView {...props} />;
    case 'cave':
      return <CaveView {...props} />;
    case 'house':
      return <HouseView {...props} />;
    case 'chest':
      return <ChestView {...props} />;
    case 'lectern':
      return <LecternView {...props} />;
    case 'fair':
      return <FairView {...props} />;
    case null:
      return null;
  }
}
