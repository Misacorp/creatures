import { useEffect, useRef, useState } from 'preact/hooks';
import { CurrencyPile } from '../../CurrencyPile';
import { dropOutcome } from '../../slot-outcome';
import { creatureName } from '../../game';
import { useDragDrop } from '../../use-drag-drop';
import { DragGhost } from '../../ui/DragGhost';
import { LiveRegion } from '../../ui/LiveRegion';
import { SidePanel } from '../../ui/SidePanel';
import { WideLayout } from '../../ui/WideLayout';
import { useWide } from '../../ui/wide-layout';
import { creatureOf } from '../world';
import { Camp } from './Camp';
import { Clearing } from './Clearing';
import { EvolveStage } from './EvolveStage';
import { HaulScene } from './HaulScene';
import { HeldCard } from './HeldCard';
import { HudExtras } from './HudExtras';
import {
  closeView,
  collectCraft,
  openHaul,
  pick,
  putDown,
  tapStation,
  sendToStation,
} from './party-actions';
import { partyAtStep, type PartyState, type StationId } from './party-state';
import { StationView } from './StationView';
import { stationVerdict } from './stations';
import { Today } from './Today';
import './party.css';

const TOUCH_HOLD_MS = 250;
const SHAKE_MS = 450;

/** Whether the address asks for the escape hatch (`&hatch=1`). */
function hatchAsked(): boolean {
  return /[?&]hatch=1\b/.test(window.location.hash);
}

/**
 * The party prototype: the clearing of stations above, the camp of creatures below, the HUD on top.
 * Everything starts from a creature: pick it up (tap, or drag) and the stations that can take it light up.
 */
export function PartyScreen({ step }: { step: number }) {
  const [state, setState] = useState<PartyState>(() => partyAtStep(step));
  const [shake, setShake] = useState<StationId | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const scale = wide ? 3 : 2;
  const hatch = hatchAsked();

  useEffect(() => {
    setState(partyAtStep(step));
  }, [step]);

  const update = (change: (s: PartyState) => PartyState): void => {
    setState((s) => change(s));
  };

  const shakeStation = (id: StationId): void => {
    setShake(id);
    if (shakeTimer.current !== null) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => {
      setShake(null);
    }, SHAKE_MS);
  };

  const dnd = useDragDrop<StationId>({
    disabled: state.moment !== null,
    stripRef: fieldRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p) => {
      const el = document
        .elementsFromPoint(p.x, p.y)
        .find((e) => e instanceof HTMLElement && e.dataset['station'] !== undefined);
      return el instanceof HTMLElement
        ? ((el.dataset['station'] ?? null) as StationId | null)
        : null;
    },
    onDrop: (creatureId, target) => {
      if (target === null) return dropOutcome('none', null, null, '');
      const held = { ...state, held: creatureId };
      if (!stationVerdict(target, creatureId, held).ok) {
        shakeStation(target);
        setState((s) => ({ ...s, said: `${target}: cannot take it.` }));
        return dropOutcome('invalid', null, null, '');
      }
      setState((s) => sendToStation({ ...s, held: creatureId }, target));
      return dropOutcome('valid', null, null, '');
    },
  });

  // While a creature is carried, the stations answer for it.
  const carried = dnd.drag?.creatureId ?? null;
  const shown: PartyState = carried === null ? state : { ...state, held: carried, ask: null };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setState((s) => (s.held !== null ? putDown(s) : s.open !== null ? closeView(s) : s));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const onPick = (id: string): void => {
    if (dnd.consumeClick()) return;
    update((s) => pick(s, id));
  };
  const card = (
    <HeldCard
      state={shown}
      onClose={() => {
        update(putDown);
      }}
      onOpenSack={(id) => {
        update((s) => openHaul(s, id));
      }}
      onCollect={(jobId) => {
        update((s) => collectCraft(s, jobId));
      }}
      onEvolve={(id) => {
        update((s) => ({ ...s, moment: { kind: 'evolve', creatureId: id }, open: null }));
      }}
    />
  );

  const moment = state.moment;
  const evolving =
    moment !== null &&
    (moment.kind === 'evolve' || moment.kind === 'evolving' || moment.kind === 'evolved');
  const haul = moment?.kind === 'haul';

  let field;
  if (evolving) {
    field = <EvolveStage state={state} setState={setState} scale={scale} />;
  } else if (state.open !== null) {
    field = <StationView state={shown} setState={setState} scale={scale} wide={wide} />;
  } else {
    field = (
      <Clearing
        state={shown}
        scale={scale}
        over={dnd.drag?.over ?? null}
        shake={shake}
        onTap={(id) => {
          update((s) => tapStation(s, id));
        }}
      >
        {haul && !wide && <HaulScene state={state} setState={setState} />}
      </Clearing>
    );
  }

  const panel = !wide ? null : haul ? (
    <SidePanel class="pp-panel">
      <HaulScene state={state} setState={setState} />
    </SidePanel>
  ) : shown.held !== null && !evolving ? (
    <SidePanel class="pp-panel">{card}</SidePanel>
  ) : (
    <SidePanel class="pp-panel">
      <Today state={state} />
    </SidePanel>
  );

  const heldCreature = carried === null ? undefined : creatureOf(state.world, carried);
  return (
    <div class={wide ? 'pp is-wide' : 'pp'}>
      <header class="pp-hud">
        <HudExtras
          state={state}
          hatch={hatch}
          onPlace={(id) => {
            update((s) => tapStation(putDown(s), id));
          }}
        />
        <CurrencyPile balances={state.world.balances} loadLedger={() => Promise.resolve([])} />
      </header>
      <WideLayout
        wide={wide}
        class="pp-layout"
        mainClass="pp-main"
        main={
          <>
            <div ref={fieldRef} class="pp-field">
              {field}
            </div>
            {!wide && !haul && !evolving && card}
            <Camp
              state={shown}
              collapsed={!wide && (state.open !== null || evolving)}
              onPick={onPick}
              onPointerDown={(id, e) => {
                dnd.startDrag(id, e);
              }}
            />
          </>
        }
        panel={panel}
      >
        <DragGhost
          ghostRef={dnd.ghostRef}
          creature={
            heldCreature === undefined
              ? undefined
              : { species: heldCreature.species, name: creatureName(heldCreature) }
          }
        />
        <LiveRegion>{state.said}</LiveRegion>
      </WideLayout>
    </div>
  );
}
