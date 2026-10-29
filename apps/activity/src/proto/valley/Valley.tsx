/**
 * The valley prototype: the world state (the shared sample Saturday, changed only by the `world.ts` helpers),
 * where the player is (the valley, or inside a place), and the tour. Each step of the tour opens on its
 * moment (step 2 the haul open under the signpost, step 4 the forge with the claim just made, and so on);
 * playing on from there moves the tour forward with the real local state.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from '../../api';
import { CurrencyPile } from '../../CurrencyPile';
import { SettingsButton } from '../../Hud';
import { PopoverHost } from '../../PopoverHost';
import { Drawer } from '../../ui/Drawer';
import { usePrefersReducedMotion } from '../../hooks';
import {
  TOUR,
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
import { HaulReveal } from './HaulReveal';
import { HouseScene } from './HouseScene';
import { Glyph, isStill } from './parts';
import { CaveScene, FairScene, PaddockScene } from './PeekScenes';
import { SignpostScene, type SendPicks } from './SignpostScene';
import { placeOf, type PlaceId } from './valley-art';
import { bubblesOf, placeLabel, readingOrder } from './valley-logic';
import { ValleyMap } from './ValleyMap';
import { ZoomCut } from './ZoomCut';

/** Where the player is, and the moment a place opens on. */
interface View {
  world: ProtoWorld;
  scene: 'valley' | PlaceId;
  /** The valley's view: the start (the middle) or centred on a place. */
  at: 'start' | PlaceId;
  /** The place whose button has the focus on coming back. */
  focus: PlaceId | null;
  /** A trip's haul open under the signpost. */
  haul: string | null;
  /** Just sent: walking off along the east road. */
  departing: Creature | null;
  forge: ForgeMoment;
  arenaPick: number | null;
  houseChoosing: boolean;
  send: SendPicks;
}

const NO_SEND: SendPicks = { place: null, creatureId: null, supply: null };

function base(world: ProtoWorld): View {
  return {
    world,
    scene: 'valley',
    at: 'start',
    focus: null,
    haul: null,
    departing: null,
    forge: null,
    arenaPick: null,
    houseChoosing: false,
    send: NO_SEND,
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
        send: {
          place: TOUR.send.destination,
          creatureId: TOUR.send.creatureId,
          supply: TOUR.send.supply,
        },
      };
    case 4:
      return { ...base(claimJob(world, TOUR.claimJobId)), scene: 'forge', forge: 'reveal' };
    case 5: {
      const first = TOUR.raidCreatureIds[0];
      const placed = first === undefined ? world : placeRaid(world, first);
      const empty = (placed.raid.party?.row ?? []).find((s) => s.creature === null);
      return { ...base(placed), scene: 'arena', arenaPick: empty?.slot ?? null };
    }
    case 6:
      return { ...base(world), scene: 'house', houseChoosing: true };
    case 7:
      return { ...base(world), at: 'cave' };
    default:
      return base(world);
  }
}

export function Valley({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  const [view, setView] = useState<View>(() => viewAtStep(step));
  const liveStep = useRef(step);
  const [zoom, setZoom] = useState<{ place: PlaceId; out: boolean } | null>(null);
  const [hatch, setHatch] = useState(false);
  const reduced = usePrefersReducedMotion();
  const still = reduced || isStill();

  // A step chosen from outside (the tour strip, the address) opens on its moment; a step the play reached does not.
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

  const world = view.world;
  const setWorld = (w: ProtoWorld): void => {
    setView((v) => ({ ...v, world: w }));
  };

  const enter = (id: PlaceId): void => {
    setHatch(false);
    if (id === 'signpost' && tripsHome(world).length > 0) {
      const trip = tripsHome(world)[0];
      setView((v) => ({ ...v, scene: 'valley', at: 'signpost', haul: trip?.id ?? null }));
      return;
    }
    const go = (): void => {
      setView((v) => ({
        ...v,
        scene: id,
        haul: null,
        forge: null,
        arenaPick: null,
        houseChoosing: false,
        send: NO_SEND,
      }));
    };
    if (still) go();
    else {
      setZoom({ place: id, out: false });
      pending.current = go;
    }
  };
  const pending = useRef<(() => void) | null>(null);

  const leave = (): void => {
    const from = view.scene;
    if (from === 'valley') return;
    setView((v) => ({ ...v, scene: 'valley', at: from, focus: from }));
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
      departing: creatureOf(after, choice.creatureId),
    }));
    progress(4);
  };

  const bubbles = bubblesOf(world);

  let body;
  switch (view.scene) {
    case 'valley':
      body = (
        <>
          <ValleyMap
            key={`${view.at}-${String(view.focus)}`}
            world={world}
            at={view.at}
            focus={view.focus}
            departing={view.departing}
            onPlace={enter}
          />
          {view.haul !== null && <HaulReveal world={world} tripId={view.haul} onClaim={claim} />}
        </>
      );
      break;
    case 'forge':
      body = (
        <ForgeScene
          world={world}
          setWorld={setWorld}
          moment={view.forge}
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
          pickSlot={view.arenaPick}
          onLeave={leave}
          onProgress={() => {
            progress(6);
          }}
        />
      );
      break;
    case 'house':
      body = (
        <HouseScene
          world={world}
          setWorld={setWorld}
          choosing={view.houseChoosing}
          onLeave={leave}
          onProgress={() => {
            progress(7);
          }}
        />
      );
      break;
    case 'signpost':
      body = <SignpostScene world={world} picks={view.send} onSend={send} onLeave={leave} />;
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

  return (
    <PopoverHost onOpenHowTo={() => undefined}>
      <div class={`pv pv-at-${view.scene}`}>
        <div class="pv-hud">
          <button
            type="button"
            class="pv-hatch"
            aria-label="Places"
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
        {body}
        {zoom !== null && (
          <ZoomCut
            place={zoom.place}
            onDone={() => {
              setZoom(null);
              pending.current?.();
              pending.current = null;
            }}
          />
        )}
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
