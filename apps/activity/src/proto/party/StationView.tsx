import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { expeditionContent } from '@creatures/game';
import { bossArt } from '../../art';
import { ItemCard } from '../../ItemCard';
import { ItemSprite } from '../../GearArt';
import { creatureName, speciesName } from '../../game';
import { gearName } from '../../gear-view';
import { glyphOrUnknown } from '../../glyphs';
import { usePrefersReducedMotion } from '../../hooks';
import { mapPlaces, mapScaleWide } from '../../map-view';
import { ROOM_SPOTS } from '../../sprites/room-art';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { destinationName, supplyKindOf, supplyName } from '../../trip-view';
import { ActionButton } from '../../ui/ActionButton';
import { GameIcon } from '../../ui/GameIcon';
import { PipRow } from '../../ui/PipRow';
import { Popover, popupProps } from '../../ui/Popover';
import { XpGain, XpList } from '../../ui/XpGain';
import { WorldMap } from '../../WorldMap';
import { craftingGain } from '../../xp-gain';
import type { ExpeditionLength } from '../../expedition-types';
import { RAID_TEAM_SIZE, creatureOf, raidTeamIds } from '../world';
import {
  closeView,
  collectCraft,
  enterGames,
  evolveTo,
  goOnTrip,
  sendToStation,
  startCraft,
} from './party-actions';
import type { PartyState } from './party-state';
import { At, PlaceScene } from './PlaceScene';
import { ARENA_BOSS, ARENA_SEATS, CAVE_TEAM, FORGE_ANVILS, FORGE_BENCH } from './scenes';
import { stationDef, stationVerdict } from './stations';
import { clock } from './Today';
import { pipsLeft } from './camp-state';
import { useSize } from './use-size';

type SetState = (change: (s: PartyState) => PartyState) => void;

interface ViewProps {
  state: PartyState;
  setState: SetState;
  wide: boolean;
}

/** A creature standing in a scene at the scene's scale (decorative unless `alt`). */
function Mon({
  species,
  scale,
  alt,
  class: extra,
}: {
  species: string;
  scale: number;
  alt?: string;
  class?: string;
}) {
  return (
    <Sprite
      sprite={creatureSpriteOrFallback(species)}
      scale={scale}
      {...(alt === undefined ? {} : { alt })}
      class={extra === undefined ? 'pp-v-mon' : `pp-v-mon ${extra}`}
    />
  );
}

const back = (setState: SetState) => (): void => {
  setState(closeView);
};

// --- Road: the world map fills the field; the picks float over its bottom edge ---

const LENGTHS: { id: ExpeditionLength; hours: number }[] = [
  { id: 'short', hours: 2 },
  { id: 'medium', hours: 6 },
  { id: 'long', hours: 12 },
  { id: 'day', hours: 24 },
];

function RoadView({ state, setState, wide }: ViewProps) {
  const { world } = state;
  const rootRef = useRef<HTMLElement | null>(null);
  const size = useSize(rootRef);
  const held = state.held === null ? null : creatureOf(world, state.held);
  const chosen = state.road.destination;
  const places = mapPlaces({
    trips: world.trips,
    creatures: world.creatures,
    now: world.now,
    selected: chosen,
    rules: { 'moonlit-reef': 'Night only', 'festival-grounds': 'Festival only' },
  });
  const dest = world.destinations.destinations.find((d) => d.id === chosen);
  const closed = dest === undefined ? [] : dest.closed.filter((c) => c !== 'rank');
  const supplies = Object.entries(world.supplies).filter(([, n]) => n > 0);
  const hours = LENGTHS.find((l) => l.id === state.road.length)?.hours ?? 6;
  return (
    <section
      ref={(el) => {
        rootRef.current = el;
      }}
      class="pp-place pp-place-road"
      aria-label={stationDef('road').name}
    >
      <div class="pp-map">
        <WorldMap
          places={places}
          selected={chosen}
          night={false}
          onPick={(id) => {
            setState((s) => ({
              ...s,
              road: { ...s.road, destination: id },
              ask: s.held === null ? 'road' : null,
              said: `${destinationName(id)} picked.${s.held === null ? ' Who goes?' : ''}`,
            }));
          }}
          {...(wide ? { scale: mapScaleWide(size.width, size.height - 80) } : {})}
        />
      </div>
      <button type="button" class="pp-back" aria-label="Back to camp" onClick={back(setState)}>
        <BackGlyph />
        <span>Camp</span>
      </button>
      <div class="pp-pinned pp-pinned-road">
        {chosen === null ? (
          <p class="pp-hint">Tap a place on the map.</p>
        ) : closed.length > 0 ? (
          <p class="pp-hint">{destinationName(chosen)} is closed now.</p>
        ) : (
          <>
            <div class="pp-picks">
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
                    {`${String(l.hours)}h`}
                  </button>
                ))}
              </div>
              <div class="pp-supplies" role="group" aria-label="Supplies">
                {supplies.map(([id, n]) => {
                  const on = state.road.supply === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      aria-label={`Pack ${supplyName(id)}, ${String(n)} in stock`}
                      class={on ? 'pp-chip is-on' : 'pp-chip'}
                      onClick={() => {
                        setState((s) => ({ ...s, road: { ...s.road, supply: on ? null : id } }));
                      }}
                    >
                      <GameIcon
                        icon={{ kind: 'supply', id: supplyKindOf(id) ?? 'unknown' }}
                        scale={2}
                      />
                      {String(n)}
                    </button>
                  );
                })}
              </div>
            </div>
            <ActionButton
              label={held === null ? 'Pick who goes' : `Send ${creatureName(held)}`}
              detail={`${destinationName(chosen)} · ${String(hours)} h`}
              large
              disabled={held === null}
              onClick={() => {
                setState(goOnTrip);
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}

function BackGlyph() {
  return (
    <svg viewBox="0 0 4 7" aria-hidden="true" shape-rendering="crispEdges">
      <path d="M3 0h1v7h-1v-1h-1v-1h-1v-1h-1v-1h1v-1h1v-1h1z" />
    </svg>
  );
}

// --- Forge: the worker at the anvil, the blueprints on the bench ---

function ForgeView({ state, setState }: ViewProps) {
  const { world } = state;
  const open = world.jobs.filter((j) => j.status !== 'claimed');
  const anvils = Array.from({ length: world.jobSlots.total }, (_, i) => open[i] ?? null);
  const held = state.held === null ? null : creatureOf(world, state.held);
  const heldOk = held !== null && stationVerdict('forge', held.id, state).ok;
  const moment = state.moment;
  const crafted =
    moment?.kind === 'crafted' ? world.jobs.find((j) => j.id === moment.jobId) : undefined;
  const made = crafted?.result?.kind === 'craft' ? crafted.result : null;
  // The piece just made sits on the first anvil; the next worker takes the next free one.
  const madeAnvil = made === null ? -1 : anvils.findIndex((a) => a === null);
  const workAnvil = anvils.findIndex((a, i) => a === null && i !== madeAnvil);
  const madeItem = made === null ? undefined : world.items.find((i) => i.id === made.gearId);
  const [card, setCard] = useState(false);
  const madeRef = useRef<HTMLButtonElement>(null);
  const scrap = world.parts.scrap;
  const pinned =
    (made !== null && crafted !== undefined) || (heldOk && held !== null && workAnvil >= 0) ? (
      <>
        {made !== null && crafted !== undefined && (
          <XpList label="Crafting">
            <XpGain
              change={craftingGain(made, creatureName(creatureOf(world, crafted.creatureId)))}
              what="Crafting XP"
              label={`${gearName(made.baseId)} made`}
            />
          </XpList>
        )}
        {heldOk && held !== null && workAnvil >= 0 && (
          <ActionButton
            label={
              state.forgeBase === null ? 'Pick a blueprint' : `Start ${gearName(state.forgeBase)}`
            }
            detail={`${creatureName(held)} · 6 scrap`}
            large
            disabled={state.forgeBase === null || scrap < 6}
            onClick={() => {
              setState(startCraft);
            }}
          />
        )}
      </>
    ) : undefined;
  return (
    <PlaceScene id="forge" label="Forge" onBack={back(setState)} pinned={pinned}>
      {(g) => (
        <>
          {anvils.map((job, i) => {
            const a = FORGE_ANVILS[i] ?? FORGE_ANVILS[0];
            if (job !== null) {
              const worker = creatureOf(world, job.creatureId);
              const ready = job.status === 'ready';
              const what = gearName(job.input.baseId ?? 'kelp-cap');
              return (
                <Fragment key={job.id}>
                  <At g={g} x={a.x - 17} y={a.y}>
                    <Mon species={worker.species} scale={g.s} />
                  </At>
                  {job.input.baseId !== undefined && (
                    <At g={g} x={a.x + 2} y={a.y - 12}>
                      <ItemSprite
                        baseId={job.input.baseId}
                        scale={g.s}
                        class={ready ? 'pp-bounce' : 'pp-ghost'}
                      />
                    </At>
                  )}
                  <At g={g} x={a.x - 18} y={a.y - 14}>
                    <button
                      type="button"
                      class={ready ? 'pp-anvil-hit is-ready' : 'pp-anvil-hit'}
                      aria-label={
                        ready
                          ? `Collect ${what} from ${creatureName(worker)}`
                          : `${creatureName(worker)} crafts ${what}, done ${clock(job.endsAt, world.timezone)}`
                      }
                      onClick={() => {
                        if (ready) setState((s) => collectCraft(s, job.id));
                      }}
                    />
                  </At>
                  {!ready && (
                    <At g={g} x={a.x} y={a.y + 18}>
                      <PipRow count={4} lit={pipsLeft(job.startedAt, job.endsAt, world.now)} />
                    </At>
                  )}
                </Fragment>
              );
            }
            if (i === madeAnvil && made !== null) {
              return (
                <At key="made" g={g} x={a.x + 2} y={a.y - 12}>
                  <button
                    ref={madeRef}
                    type="button"
                    class="pp-find pp-bounce"
                    aria-label={`${gearName(made.baseId)}, just made: see its card`}
                    {...popupProps(card)}
                    onClick={() => {
                      setCard((c) => !c);
                    }}
                  >
                    <ItemSprite baseId={made.baseId} scale={g.s} />
                  </button>
                </At>
              );
            }
            if (i === workAnvil && heldOk && held !== null) {
              return (
                <At key={`free-${String(i)}`} g={g} x={a.x - 17} y={a.y}>
                  <Mon
                    species={held.species}
                    scale={g.s}
                    alt={`${creatureName(held)} at the anvil`}
                    class="pp-hop"
                  />
                </At>
              );
            }
            return (
              <At key={`free-${String(i)}`} g={g} x={a.x + 2} y={a.y - 18}>
                <button
                  type="button"
                  class={state.ask === 'forge' ? 'pp-plus-btn is-lit' : 'pp-plus-btn'}
                  aria-label="Free anvil: who works?"
                  onClick={() => {
                    setState((s) => ({ ...s, ask: 'forge', said: 'Who works? Pick a creature.' }));
                  }}
                >
                  <span class="pp-bub pp-bub-say pp-plus">+</span>
                </button>
              </At>
            );
          })}
          <At g={g} x={FORGE_BENCH.x + 4} y={FORGE_BENCH.y - 15}>
            <div class="pp-blueprints" role="radiogroup" aria-label="Blueprints on the bench">
              {world.blueprints.map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={state.forgeBase === b}
                  aria-label={gearName(b)}
                  disabled={!heldOk}
                  class={state.forgeBase === b ? 'pp-bp is-on' : 'pp-bp'}
                  onClick={() => {
                    setState((s) => ({ ...s, forgeBase: b }));
                  }}
                >
                  <ItemSprite baseId={b} scale={Math.max(2, g.s - 1)} />
                </button>
              ))}
            </div>
          </At>
          {card && madeItem !== undefined && (
            <Popover
              layer="page"
              anchor={() => madeRef.current}
              label={gearName(madeItem.baseId)}
              onClose={() => {
                setCard(false);
              }}
            >
              <ItemCard item={madeItem} plainRarity />
            </Popover>
          )}
        </>
      )}
    </PlaceScene>
  );
}

// --- Arena: the boss on the sand, the party's lane board ---

function ArenaView({ state, setState }: ViewProps) {
  const { world } = state;
  const boss = world.raid.boss;
  const art = bossArt(boss.id);
  const row = world.raid.party?.row ?? [];
  const placed = raidTeamIds(world).length;
  const heldOk = state.held !== null && stationVerdict('arena', state.held, state).ok;
  const placing = heldOk || state.ask === 'arena';
  return (
    <PlaceScene id="arena" label="Arena" onBack={back(setState)}>
      {(g) => (
        <>
          <At g={g} x={ARENA_BOSS.x} y={ARENA_BOSS.y}>
            <Sprite sprite={art.sprite} scale={g.s} alt={boss.name} class="pp-boss" />
          </At>
          <At g={g} x={ARENA_BOSS.x + 30} y={ARENA_BOSS.y + 4}>
            <PipRow
              count={RAID_TEAM_SIZE}
              lit={placed}
              size="md"
              label={`Yours placed: ${String(placed)} / ${String(RAID_TEAM_SIZE)}`}
            />
          </At>
          <At g={g} x={64} y={ARENA_BOSS.y + 26} class="pp-centre">
            <span
              class="pp-plate pp-plate-boss"
              role="img"
              aria-label={`${boss.name}, ${boss.element}`}
            >
              <GameIcon icon={{ kind: 'element', element: boss.element }} scale={2} />
              {boss.name}
            </span>
          </At>
          {row.map((seat) => {
            const line = Math.floor(seat.slot / 3);
            const lane = seat.slot % 3;
            const x = ARENA_SEATS.x + lane * ARENA_SEATS.step;
            const y = ARENA_SEATS.y + line * ARENA_SEATS.step;
            const c = seat.creature;
            return (
              <At key={seat.slot} g={g} x={x} y={y}>
                {c !== null ? (
                  <span
                    class={c.mine ? 'pp-seat is-mine' : 'pp-seat'}
                    role="img"
                    aria-label={
                      c.mine
                        ? `Your ${c.name}, level ${String(c.level)}`
                        : `${c.ownerName}'s ${c.name}, level ${String(c.level)}`
                    }
                  >
                    <Mon species={c.species} scale={g.s} />
                    {c.mine && (
                      <Sprite sprite={glyphOrUnknown('flag')} scale={3} class="pp-seat-flag" />
                    )}
                    <span class="pp-seat-name">{c.mine ? 'You' : c.ownerName}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    class={placing ? 'pp-seat is-empty is-lit' : 'pp-seat is-empty'}
                    aria-label={
                      heldOk && state.held !== null
                        ? `Place ${creatureName(creatureOf(world, state.held))} here`
                        : 'Empty seat: pick a creature'
                    }
                    disabled={placed >= RAID_TEAM_SIZE}
                    onClick={() => {
                      if (heldOk)
                        setState((s) => sendToStation({ ...s, seat: seat.slot }, 'arena'));
                      else
                        setState((s) => ({
                          ...s,
                          ask: 'arena',
                          seat: seat.slot,
                          said: 'Pick a creature for this seat.',
                        }));
                    }}
                  >
                    {placing && placed < RAID_TEAM_SIZE && (
                      <i class="pp-arrow" aria-hidden="true" />
                    )}
                  </button>
                )}
              </At>
            );
          })}
        </>
      )}
    </PlaceScene>
  );
}

// --- Cave: the landing, the lantern, the stair down ---

function CaveView({ state, setState }: ViewProps) {
  const { world } = state;
  const d = world.dungeon;
  const heldOk = state.held !== null && stationVerdict('cave', state.held, state).ok;
  const [note, setNote] = useState(false);
  const left = d.attemptsAllowed - d.attemptsToday;
  return (
    <PlaceScene
      id="cave"
      label="Cave"
      onBack={back(setState)}
      pinned={
        <>
          {note && <p class="pp-hint">The run itself is not in this prototype.</p>}
          <ActionButton
            label="Go down"
            detail={`Floor ${String(d.depth)}`}
            large
            disabled={state.caveTeam.length === 0 || !d.canRun}
            onClick={() => {
              setNote(true);
            }}
          />
        </>
      }
    >
      {(g) => (
        <>
          <At g={g} x={84} y={6} class="pp-cave-facts">
            <span
              class="pp-plate"
              role="img"
              aria-label={`Tries left today: ${String(left)} / ${String(d.attemptsAllowed)}. Resets at ${clock(d.resetsAt, world.timezone)}.`}
            >
              <PipRow count={d.attemptsAllowed} lit={left} size="md" />
              <Sprite sprite={glyphOrUnknown('clock')} scale={2} />
              {clock(d.resetsAt, world.timezone)}
            </span>
          </At>
          {CAVE_TEAM.map((spot, i) => {
            const id = state.caveTeam[i];
            if (id !== undefined) {
              const c = creatureOf(world, id);
              return (
                <At key={i} g={g} x={spot.x} y={spot.y}>
                  <span
                    class="pp-team-slot is-full"
                    role="img"
                    aria-label={`${creatureName(c)} in the team`}
                  >
                    <Mon species={c.species} scale={g.s} />
                  </span>
                </At>
              );
            }
            const lit = (heldOk || state.ask === 'cave') && i === state.caveTeam.length;
            return (
              <At key={i} g={g} x={spot.x} y={spot.y}>
                <button
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
              </At>
            );
          })}
        </>
      )}
    </PlaceScene>
  );
}

// --- House: the real living room; the lounger on the cushion; evolution on the rug ---

const SPOT = (id: string): { x: number; y: number } => {
  const s = ROOM_SPOTS.find((r) => r.id === id);
  return s === undefined ? { x: 0, y: 0 } : { x: s.x, y: s.y };
};
const RUG = { x: 194, y: 39 };
const FLASH_MS = 900;
const SPARKS = 8;

function HouseView({ state, setState }: ViewProps) {
  const { world } = state;
  const reduced = usePrefersReducedMotion();
  const moment = state.moment;
  const lounger = state.lounger === null ? null : creatureOf(world, state.lounger);
  const others = world.residents.filter((r) => r.name !== 'You' && r.creature !== null);
  const seats = ['couch-left', 'couch-middle', 'couch-right', 'table-chair-left'].map(SPOT);
  const evolving =
    moment !== null &&
    (moment.kind === 'evolve' || moment.kind === 'evolving' || moment.kind === 'evolved')
      ? moment
      : null;
  const flashing = moment?.kind === 'evolving' ? moment : null;
  useEffect(() => {
    if (flashing === null) return undefined;
    const t = setTimeout(
      () => {
        setState((s) => evolveTo(s, flashing.creatureId, flashing.to));
      },
      reduced ? 120 : FLASH_MS,
    );
    return () => {
      clearTimeout(t);
    };
  }, [flashing?.creatureId, flashing?.to, reduced]);

  const evolver = evolving === null ? null : creatureOf(world, evolving.creatureId);
  const evo = evolver?.evolution;
  const heldOk =
    state.held !== null && evolving === null && stationVerdict('house', state.held, state).ok;
  const afford = evo !== undefined && world.balances.essence >= evo.essence;

  let pinned: ComponentChildren = undefined;
  if (evolving?.kind === 'evolve' && evolver !== null && evo !== undefined) {
    pinned = (
      <ActionButton
        label={state.form === null ? 'Pick a form' : `Evolve into ${speciesName(state.form)}`}
        detail={`${String(evo.essence)} Essence`}
        large
        disabled={state.form === null || !afford}
        onClick={() => {
          const to = state.form;
          if (to !== null)
            setState((s) => ({ ...s, moment: { kind: 'evolving', creatureId: evolver.id, to } }));
        }}
      />
    );
  } else if (evolving?.kind === 'evolved' && evolver !== null) {
    pinned = (
      <ActionButton
        label="Back to camp"
        large
        onClick={() => {
          setState((s) => ({ ...closeView(s), held: evolver.id }));
        }}
      />
    );
  } else if (heldOk && state.held !== null) {
    const name = creatureName(creatureOf(world, state.held));
    pinned = (
      <ActionButton
        label={`Lounge ${name}`}
        detail="on the cushion"
        large
        onClick={() => {
          setState((s) => sendToStation(s, 'house'));
        }}
      />
    );
  }
  const cushion = SPOT('window-cushion');
  return (
    <PlaceScene
      id="house"
      label="House"
      onBack={back(setState)}
      pinned={pinned}
      start={evolving === null ? 70 : RUG.x + 8}
      maxScale={5}
    >
      {(g) => (
        <>
          {lounger !== null && (evolving === null || lounger.id !== evolving.creatureId) && (
            <At g={g} x={cushion.x} y={cushion.y}>
              <Mon
                species={lounger.species}
                scale={g.s}
                alt={`${creatureName(lounger)}, yours, lounging`}
              />
            </At>
          )}
          {others.slice(0, seats.length).map((r, i) => {
            const seat = seats[i] ?? { x: 0, y: 0 };
            const species = r.creature?.species ?? 'cindle';
            return (
              <At key={r.userId} g={g} x={seat.x} y={seat.y}>
                <Mon species={species} scale={g.s} alt={`${r.name}'s ${speciesName(species)}`} />
              </At>
            );
          })}
          {evolver !== null && evo !== undefined && evolving !== null && (
            <>
              {evolving.kind !== 'evolved' &&
                [evo.toSpecies, ...(evo.alt === undefined ? [] : [evo.alt.toSpecies])].map(
                  (to, i) => (
                    <At key={to} g={g} x={RUG.x + (i === 0 ? -30 : 30)} y={RUG.y - 2}>
                      <button
                        type="button"
                        class={[
                          'pp-form',
                          state.form === to ? 'is-on' : '',
                          flashing !== null && flashing.to !== to ? 'is-gone' : '',
                        ]
                          .filter((c) => c !== '')
                          .join(' ')}
                        aria-pressed={state.form === to}
                        aria-label={`${speciesName(to)}, ${String(evo.essence)} Essence`}
                        disabled={flashing !== null}
                        onClick={() => {
                          setState((s) => ({ ...s, form: to }));
                        }}
                      >
                        <Mon species={to} scale={g.s} />
                        <span class="pp-form-name">{speciesName(to)}</span>
                      </button>
                    </At>
                  ),
                )}
              <At
                g={g}
                x={RUG.x}
                y={RUG.y - 4}
                class={flashing === null ? 'pp-evolver' : 'pp-evolver is-flash'}
              >
                {evolving.kind === 'evolved' && (
                  <span class="pp-burst" aria-hidden="true">
                    {Array.from({ length: SPARKS }, (_, i) => (
                      <Sprite
                        key={i}
                        sprite={glyphOrUnknown('sparkle')}
                        scale={2}
                        class={`pp-ray pp-ray-${String(i)}`}
                      />
                    ))}
                  </span>
                )}
                <Mon
                  species={evolver.species}
                  scale={g.s}
                  alt={`${creatureName(evolver)}${evolving.kind === 'evolved' ? ', evolved' : ''}`}
                />
              </At>
            </>
          )}
        </>
      )}
    </PlaceScene>
  );
}

// --- Chest: the bag's pieces on the floor ---

function ChestView({ state, setState }: ViewProps) {
  const { world } = state;
  const [open, setOpen] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const held = state.held === null ? null : creatureOf(world, state.held);
  const item = world.items.find((i) => i.id === open);
  const PER_ROW = 6;
  return (
    <PlaceScene id="chest" label="Chest" onBack={back(setState)}>
      {(g) => (
        <>
          <At g={g} x={84} y={8}>
            <span
              class="pp-plate"
              role="img"
              aria-label={`In the bag: ${String(world.items.length)} / 60`}
            >
              {String(world.items.length)} / 60
            </span>
          </At>
          {world.items.map((it, i) => (
            <At key={it.id} g={g} x={14 + (i % PER_ROW) * 17} y={70 + Math.floor(i / PER_ROW) * 18}>
              <button
                type="button"
                ref={(el) => {
                  if (el === null) refs.current.delete(it.id);
                  else refs.current.set(it.id, el);
                }}
                class={`pp-piece pp-r-${it.rarity}`}
                aria-label={`${gearName(it.baseId)}, ${it.rarity}`}
                {...popupProps(open === it.id)}
                onClick={() => {
                  setOpen((o) => (o === it.id ? null : it.id));
                }}
              >
                <ItemSprite baseId={it.baseId} scale={g.s} />
              </button>
            </At>
          ))}
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
        </>
      )}
    </PlaceScene>
  );
}

// --- Lectern: the Journal's newest page ---

function LecternView({ setState }: ViewProps) {
  const page =
    expeditionContent.journal.entries.find((e) => e.place === 'verdant-hollow') ??
    expeditionContent.journal.entries[0];
  return (
    <PlaceScene id="lectern" label="Lectern" onBack={back(setState)}>
      {(g) => (
        <At g={g} x={64} y={18} class="pp-centre">
          <div class="pp-page">
            {page !== undefined && (
              <>
                <h3 class="pp-page-title">{page.title}</h3>
                <p class="pp-page-text prose">{page.text}</p>
              </>
            )}
          </div>
        </At>
      )}
    </PlaceScene>
  );
}

// --- Fairground: today's events as flags on the green ---

function FairView({ state, setState }: ViewProps) {
  const { world } = state;
  const games = world.games.next;
  const heldOk = state.held !== null && stationVerdict('fair', state.held, state).ok;
  return (
    <PlaceScene id="fair" label="Fairground" onBack={back(setState)}>
      {(g) => (
        <>
          <At g={g} x={84} y={52}>
            <span
              class="pp-plate"
              role="img"
              aria-label={`The show starts at ${clock(games.showAt, world.timezone)}`}
            >
              <Sprite sprite={glyphOrUnknown('trophy')} scale={2} />
              {clock(games.showAt, world.timezone)}
            </span>
          </At>
          {games.lineup.map((e, i) => {
            const entered = state.fair.entries[e.id] ?? [];
            const lit = heldOk || (state.ask === 'fair' && state.fair.event === e.id);
            return (
              <At key={e.id} g={g} x={4 + i * 42} y={68} class="pp-event-at">
                <button
                  type="button"
                  class={['pp-event', state.fair.event === e.id ? 'is-on' : '', lit ? 'is-lit' : '']
                    .filter((c) => c !== '')
                    .join(' ')}
                  aria-label={`${e.name}, team of ${String(e.team)}${entered.length > 0 ? `, entered: ${String(entered.length)}` : ''}`}
                  onClick={() => {
                    setState((s) => {
                      const next = { ...s, fair: { ...s.fair, event: e.id } };
                      return s.held !== null
                        ? enterGames(next)
                        : { ...next, ask: 'fair', said: `${e.name}: who enters?` };
                    });
                  }}
                >
                  <Sprite sprite={glyphOrUnknown('flag')} scale={g.s} />
                  <span class="pp-event-name">{e.name}</span>
                  <span class="pp-event-team">
                    {Array.from({ length: e.team }, (_, k) => {
                      const id = entered[k];
                      return id === undefined ? (
                        <i key={k} class="pp-event-seat" />
                      ) : (
                        <Mon key={k} species={creatureOf(world, id).species} scale={2} />
                      );
                    })}
                  </span>
                  {lit && <i class="pp-arrow" aria-hidden="true" />}
                </button>
              </At>
            );
          })}
        </>
      )}
    </PlaceScene>
  );
}

/** The open place's own scene, in the clearing's place. */
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
