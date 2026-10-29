import { useEffect, useRef, useState } from 'preact/hooks';
import { CurrencyPile } from '../../CurrencyPile';
import { dropOutcome } from '../../slot-outcome';
import { creatureName } from '../../game';
import { useDragDrop } from '../../use-drag-drop';
import { DragGhost } from '../../ui/DragGhost';
import { LiveRegion } from '../../ui/LiveRegion';
import { useWide } from '../../ui/wide-layout';
import { creatureOf } from '../world';
import { Camp } from './Camp';
import { Clearing } from './Clearing';
import { HaulScene } from './HaulScene';
import { HeldCard } from './HeldCard';
import { HudExtras } from './HudExtras';
import {
  closeView,
  collectCraft,
  openHaul,
  pick,
  putDown,
  sendToStation,
  tapStation,
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
 * The party prototype: the clearing (or a place's scene) fills the window under the HUD, the camp of
 * creatures runs along the bottom. Everything starts from a creature: pick it up (tap, or drag) and the
 * places that can take it light up. On a wide screen the creature's card and the day's timers sit in the
 * camp beside the creatures; there is no side panel.
 */
export function PartyScreen({ step }: { step: number }) {
  const [state, setState] = useState<PartyState>(() => partyAtStep(step));
  const [shake, setShake] = useState<StationId | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const wide = useWide();
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
    disabled: state.moment !== null || state.open !== null,
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
      const verdict = stationVerdict(target, creatureId, held);
      if (!verdict.ok) {
        shakeStation(target);
        setState((s) => ({ ...s, said: `${target}: ${(verdict.word ?? 'no').toLowerCase()}.` }));
        return dropOutcome('invalid', null, null, '');
      }
      setState((s) => sendToStation({ ...s, held: creatureId }, target));
      return dropOutcome('valid', null, null, '');
    },
  });

  // While a creature is carried, the places answer for it.
  const carried = dnd.drag?.creatureId ?? null;
  const shown: PartyState = carried === null ? state : { ...state, held: carried, ask: null };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]') !== null) return;
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

  const moment = state.moment;
  const evolving =
    moment !== null &&
    (moment.kind === 'evolve' || moment.kind === 'evolving' || moment.kind === 'evolved');
  const haul = moment?.kind === 'haul';
  const showCard = shown.held !== null && !haul && !evolving;
  const card = showCard ? (
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
        update((s) => ({
          ...s,
          open: 'house',
          ask: null,
          form: null,
          moment: { kind: 'evolve', creatureId: id },
        }));
      }}
    />
  ) : null;

  let field;
  if (haul) field = <HaulScene state={state} setState={setState} />;
  else if (state.open !== null)
    field = <StationView state={shown} setState={setState} wide={wide} />;
  else {
    field = (
      <Clearing
        state={shown}
        mode={wide ? 'wide' : 'phone'}
        over={dnd.drag?.over ?? null}
        shake={shake}
        onTap={(id) => {
          update((s) => tapStation(s, id));
        }}
      />
    );
  }

  // The phone's camp: two rows, or one under the held creature's card or a place's scene.
  const rows: 1 | 2 = wide || card !== null || state.open !== null || haul ? 1 : 2;
  const side = wide ? (card ?? <Today state={state} />) : card;
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
      <div ref={fieldRef} class="pp-field">
        {field}
      </div>
      <Camp
        state={shown}
        rows={rows}
        scale={wide ? 6 : 3}
        onPick={onPick}
        onPointerDown={(id, e) => {
          dnd.startDrag(id, e);
        }}
      >
        {side}
      </Camp>
      <DragGhost
        ghostRef={dnd.ghostRef}
        creature={
          heldCreature === undefined
            ? undefined
            : { species: heldCreature.species, name: creatureName(heldCreature) }
        }
      />
      <LiveRegion>{state.said}</LiveRegion>
    </div>
  );
}
