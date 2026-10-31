/**
 * The valley prototype, round 2 (the hybrid): the valley and the full-screen places of round 1's direction,
 * with the party prototype's creature tray as the one thing always on screen along the bottom. Tap a creature:
 * its card shows over the valley and the places it can go now light up (the others dim, with one word); tap a
 * lit place and you go in with it. Inside a place the tray holds the creatures that place is about, and the
 * one main action is pinned at the bottom of the scene. "◀ Valley" is always in the same top-left corner.
 *
 * Each step of the tour opens on its moment; playing on from there moves the tour forward with real local state.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from '../../api';
import { CurrencyPile } from '../../CurrencyPile';
import { creatureName } from '../../game';
import { SettingsButton } from '../../Hud';
import { usePrefersReducedMotion } from '../../hooks';
import { PopoverHost } from '../../PopoverHost';
import { ElementChip } from '../../sprites/ElementChip';
import { Drawer } from '../../ui/Drawer';
import {
  TOUR,
  elementOf,
  claimJob,
  claimTrip,
  creatureOf,
  placeRaid,
  sendTrip,
  tripsHome,
  worldAtStep,
  type ProtoWorld,
  type SendTripChoice,
} from '../world';
import { ArenaScene } from './ArenaScene';
import { ForgeScene, type ForgeMoment } from './ForgeScene';
import { HAUL_FRAMES, HaulCaption, HaulOnGround, haulOf } from './Haul';
import { HouseScene } from './HouseScene';
import { CreatureSprite, Glyph, isStill } from './parts';
import { CaveScene, FairScene, PaddockScene } from './PeekScenes';
import { SignpostScene, type SendPicks } from './SignpostScene';
import { Tray } from './Tray';
import { placesFor, trayBadge, trayFor } from './tray-state';
import { placeOf, type PlaceId } from './valley-art';
import { bubblesOf, placeLabel, readingOrder } from './valley-logic';
import { ValleyMap } from './ValleyMap';
import { ZoomCut } from './ZoomCut';
import { WalkStage } from '../walk/WalkStage';
import type { CastMember, WalkPlan } from '../walk/walk-plan';
import { decisionBubbles } from '../walk/walk-world';

/** Where the player is, and the moment a place opens on. */
export interface View {
  world: ProtoWorld;
  scene: 'valley' | PlaceId;
  /** The valley's view: the start (the middle) or centred on a place. */
  at: 'start' | PlaceId;
  /** The place whose button has the focus on coming back. */
  focus: PlaceId | null;
  /** A trip's haul open at the signpost. */
  haul: string | null;
  /** Just sent: walking off along the east road. */
  departing: Creature | null;
  forge: ForgeMoment;
  houseChoosing: boolean;
  send: SendPicks;
  /** The creature picked in the tray. */
  held: string | null;
}

/** A return walk to play on opening (the "Return walk" prototype, `proto/walk/`): the world, who the lines name, the plan. */
export interface WalkSetup {
  world: ProtoWorld;
  cast: readonly CastMember[];
  plan: WalkPlan;
}

const NO_SEND: SendPicks = { place: null, supply: null };

function base(world: ProtoWorld): View {
  return {
    world,
    scene: 'valley',
    at: 'start',
    focus: null,
    haul: null,
    departing: null,
    forge: null,
    houseChoosing: false,
    send: NO_SEND,
    held: null,
  };
}

/** Each step opens on its moment: a fixed world and a fixed view (screenshots never catch a frame between). */
export function viewAtStep(step: number): View {
  const world = worldAtStep(step);
  switch (step) {
    case 2:
      return { ...base(world), at: 'signpost', haul: TOUR.claimTripId };
    case 3:
      return {
        ...base(world),
        scene: 'signpost',
        send: { place: TOUR.send.destination, supply: TOUR.send.supply },
        held: TOUR.send.creatureId,
      };
    case 4:
      return { ...base(claimJob(world, TOUR.claimJobId)), scene: 'forge', forge: 'reveal' };
    case 5: {
      const [first, second] = TOUR.raidCreatureIds;
      const placed = first === undefined ? world : placeRaid(world, first);
      return { ...base(placed), scene: 'arena', held: second ?? null };
    }
    case 6:
      return { ...base(world), scene: 'house', houseChoosing: true };
    case 7:
      return { ...base(world), at: 'cave' };
    default:
      return base(world);
  }
}

export function Valley({
  step,
  setStep,
  walk,
}: {
  step: number;
  setStep: (n: number) => void;
  /** Open on a return walk; when it ends (or is skipped) this is the valley as usual, at the walk's last place. */
  walk?: WalkSetup;
}) {
  const [view, setView] = useState<View>(() =>
    walk === undefined
      ? viewAtStep(step)
      : { ...base(walk.world), at: walk.plan.stops[walk.plan.stops.length - 1]?.place ?? 'start' },
  );
  const [walking, setWalking] = useState(walk !== undefined);
  const liveStep = useRef(step);
  const [zoom, setZoom] = useState<PlaceId | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const [hatch, setHatch] = useState(false);
  const reduced = usePrefersReducedMotion();
  const still = reduced || isStill();

  useEffect(() => {
    if (liveStep.current === step) return;
    liveStep.current = step;
    setView(viewAtStep(step));
  }, [step]);
  const progress = (n: number): void => {
    if (n <= liveStep.current) return;
    liveStep.current = n;
    setStep(n);
  };

  // The haul's frames: the sack opens, then one thing pops out per frame.
  const [haulFrame, setHaulFrame] = useState(0);
  useEffect(() => {
    if (view.haul === null) return undefined;
    if (still) {
      setHaulFrame(HAUL_FRAMES);
      return undefined;
    }
    setHaulFrame(0);
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      setHaulFrame(frame);
      if (frame >= HAUL_FRAMES) window.clearInterval(id);
    }, 140);
    return () => {
      window.clearInterval(id);
    };
  }, [view.haul, still]);

  const world = view.world;
  const setWorld = (w: ProtoWorld): void => {
    setView((v) => ({ ...v, world: w }));
  };
  const setHeld = (id: string | null): void => {
    setView((v) => ({ ...v, held: id }));
  };

  const enter = (id: PlaceId, withCreature: string | null = null): void => {
    setHatch(false);
    if (id === 'signpost' && tripsHome(world).length > 0 && withCreature === null) {
      const trip = tripsHome(world)[0];
      setView((v) => ({
        ...v,
        scene: 'valley',
        at: 'signpost',
        haul: trip?.id ?? null,
        held: null,
      }));
      return;
    }
    const go = (): void => {
      setView((v) => ({
        ...v,
        scene: id,
        haul: null,
        forge: null,
        houseChoosing: id === 'house' && withCreature !== null,
        send: NO_SEND,
        held: id === 'house' ? null : withCreature,
      }));
    };
    if (still) go();
    else {
      pending.current = go;
      setZoom(id);
    }
  };

  const leave = (): void => {
    const from = view.scene;
    if (from === 'valley') return;
    setView((v) => ({ ...v, scene: 'valley', at: from, focus: from, held: null }));
  };

  const claim = (): void => {
    if (view.haul === null) return;
    const after = claimTrip(world, view.haul);
    setView((v) => ({ ...v, world: { ...after, haul: null }, haul: null, focus: 'signpost' }));
    progress(3);
  };

  const send = (choice: SendTripChoice): void => {
    const after = sendTrip(world, choice);
    setView((v) => ({
      ...v,
      world: after,
      scene: 'valley',
      at: 'signpost',
      focus: 'signpost',
      held: null,
      departing: creatureOf(after, choice.creatureId),
    }));
    progress(4);
  };

  // The tray: in the valley a tap holds a creature (its card, the places it can go); in a place it picks.
  const inValley = view.scene === 'valley';
  const heldCreature =
    view.held === null ? undefined : world.creatures.find((c) => c.id === view.held);
  const lit = inValley && heldCreature !== undefined ? placesFor(world, heldCreature) : null;
  const onTray = (id: string): void => {
    if (view.scene === 'house') {
      const c = world.creatures.find((x) => x.id === id);
      if (c?.evolution?.available === true) setView((v) => ({ ...v, houseChoosing: true }));
      return;
    }
    setHeld(view.held === id ? null : id);
  };
  const onPlace = (id: PlaceId): void => {
    const pick = lit !== null && lit[id].ok && view.held !== null ? view.held : null;
    if (
      pick !== null &&
      id === 'signpost' &&
      trayBadge(world, creatureOf(world, pick)).state === 'loot'
    ) {
      enter(id);
      return;
    }
    enter(id, pick);
  };

  const haul = view.haul === null ? null : haulOf(world, view.haul);
  let body;
  switch (view.scene) {
    case 'valley':
      body =
        walk !== undefined && walking ? (
          <WalkStage
            world={world}
            cast={walk.cast}
            plan={walk.plan}
            onDone={() => {
              setWalking(false);
            }}
          />
        ) : (
          <>
            <ValleyMap
              key={`${view.at}-${String(view.focus)}`}
              world={world}
              at={view.at}
              focus={view.focus}
              departing={view.departing}
              bubbles={walk === undefined ? undefined : decisionBubbles(walk.plan)}
              onPlace={onPlace}
              lit={lit}
              haulOpen={haul !== null}
              overlay={
                haul === null
                  ? undefined
                  : (g) => <HaulOnGround things={haul.things} frame={haulFrame} {...g} />
              }
            />
            {haul !== null && view.haul !== null && (
              <HaulCaption world={world} tripId={view.haul} view={haul.view} onClaim={claim} />
            )}
            {haul === null && heldCreature !== undefined && (
              <CreatureCard
                creature={heldCreature}
                world={world}
                onClose={() => {
                  setHeld(null);
                }}
              />
            )}
          </>
        );
      break;
    case 'forge':
      body = (
        <ForgeScene
          world={world}
          setWorld={setWorld}
          moment={view.forge}
          held={view.held}
          setHeld={setHeld}
          onLeave={leave}
          onProgress={() => {
            progress(5);
          }}
        />
      );
      break;
    case 'arena':
      body = (
        <ArenaScene
          world={world}
          setWorld={setWorld}
          held={view.held}
          setHeld={setHeld}
          onLeave={leave}
          onDone={leave}
          onProgress={() => {
            progress(6);
          }}
        />
      );
      break;
    case 'house':
      body = (
        <HouseScene
          key={String(view.houseChoosing)}
          world={world}
          setWorld={setWorld}
          choosing={view.houseChoosing}
          onLeave={leave}
          onDone={leave}
          onProgress={() => {
            progress(7);
          }}
        />
      );
      break;
    case 'signpost':
      body = (
        <SignpostScene
          world={world}
          picks={view.send}
          held={view.held}
          onSend={send}
          onLeave={leave}
        />
      );
      break;
    case 'cave':
      body = <CaveScene world={world} onLeave={leave} />;
      break;
    case 'fair':
      body = <FairScene world={world} onLeave={leave} />;
      break;
    case 'paddock':
      body = <PaddockScene world={world} onLeave={leave} />;
      break;
  }

  const bubbles = walk === undefined ? bubblesOf(world) : decisionBubbles(walk.plan);
  const where = view.scene === 'valley' ? null : placeOf(view.scene);
  return (
    <PopoverHost onOpenHowTo={() => undefined}>
      <div class={`pv pv-at-${view.scene}`}>
        <div class="pv-main">
          {body}
          <div class="pv-hud">
            {where !== null && (
              <button
                type="button"
                class="pv-back"
                aria-label={`Back to the valley (leave the ${where.name})`}
                onClick={leave}
              >
                <span class="pv-back-head" aria-hidden="true" />
                <span class="pix">Valley</span>
              </button>
            )}
            <button
              type="button"
              class="pv-hatch"
              aria-label="Places"
              title="Places"
              aria-haspopup="dialog"
              onClick={() => {
                setHatch(true);
              }}
            >
              <Glyph id="flag" scale={3} />
            </button>
            <div class="pv-hud-end">
              <CurrencyPile balances={world.balances} loadLedger={() => Promise.resolve([])} />
              <SettingsButton onSettings={() => undefined} />
            </div>
          </div>
          {zoom !== null && (
            <ZoomCut
              place={zoom}
              onDone={() => {
                setZoom(null);
                pending.current?.();
                pending.current = null;
              }}
            />
          )}
        </div>
        <Tray
          world={world}
          creatures={trayFor(world, view.scene)}
          held={view.held}
          onPick={onTray}
          label={where === null ? 'Your creatures' : `Your creatures for the ${where.name}`}
        />
        <Drawer
          open={hatch}
          onClose={() => {
            setHatch(false);
          }}
          title="Places"
        >
          <ul class="pv-hatch-list" aria-label="Places">
            {[
              ...bubbles.map((b) => b.place),
              ...readingOrder().filter((id) => !bubbles.some((b) => b.place === id)),
            ].map((id) => {
              const bubble = bubbles.find((b) => b.place === id);
              const place = placeOf(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    class={`pv-hatch-row${bubble === undefined ? '' : ' needs'}`}
                    aria-label={placeLabel(id, bubble)}
                    onClick={() => {
                      if (view.scene !== 'valley') leave();
                      enter(id);
                    }}
                  >
                    <Glyph id={place.glyph} scale={3} />
                    <span class="pv-hatch-name pix">{place.name}</span>
                    <span class="pv-hatch-what">{bubble?.spoken ?? place.what}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Drawer>
      </div>
    </PopoverHost>
  );
}

/** A held creature's card, over the valley just above the tray (not a page): who it is and what it is doing. */
function CreatureCard({
  creature,
  world,
  onClose,
}: {
  creature: Creature;
  world: ProtoWorld;
  onClose: () => void;
}) {
  const badge = trayBadge(world, creature);
  const where = Object.entries(placesFor(world, creature))
    .filter(([id, v]) => v.ok && id !== 'paddock')
    .map(([id]) => placeOf(id as PlaceId).name);
  return (
    <section class="pv-card" aria-label={`${creatureName(creature)}'s card`}>
      <span class="pv-card-sprite">
        <CreatureSprite creature={creature} scale={4} />
      </span>
      <span class="pv-card-text">
        <span class="pv-card-name pix">
          {creatureName(creature)} <span class="pv-card-lv">Lv {creature.level}</span>
        </span>
        <ElementChip element={elementOf(creature.species)} as="plain" />
        <span class="pv-card-state">{badge.label.split('. ').slice(1).join('. ')}</span>
        <span class="pv-card-where">
          {where.length === 0 ? 'Nowhere to go now.' : `Can go: ${where.join(', ')}.`}
        </span>
      </span>
      <button type="button" class="pv-card-close" aria-label="Put down" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
    </section>
  );
}
