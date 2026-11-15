/**
 * The shard exchange (V-FORGE-10, moved to the Market by Q64): the stall's wizard in the Market canvas's right drawer (a page on a phone).
 * It was the Forge's; it is the same exchange (the shard to get, the pile to pay from, how many trades, the rate and the crit chance),
 * moved and not copied. The first step is the trade itself, with the one gold button pinned under it; "You get" and "You pay" each open a
 * step of their own (a choice inside a step is a step of the wizard, never a sheet on the drawer). The words are `forge-view.ts`
 * (`exchange*`); the keyed spend is the game's (`MarketActions.exchange`).
 */
import { useState } from 'preact/hooks';
import type { ValleyVisit } from '../api';
import { anyShardMark, shardCount, shardMark } from '../resource-count';
import { Alert } from '../ui/Alert';
import { ActionButton } from '../ui/ActionButton';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CountBadge, SayLine } from '../ui/CountBadge';
import { CountStepper } from '../ui/CountStepper';
import { useWizard, type WizardStep } from '../ui/use-wizard';
import { WizardView } from '../ui/Wizard';
import { Slot, SlotRow } from '../ui/Slot';
import { PanelBody } from './PlaceCanvas';
import { SlotText } from './seat-parts';
import {
  SHARD_ELEMENTS,
  exchangeRate,
  exchangeReason,
  exchangeSources,
  shardName,
  tradesFrom,
} from './forge-view';

type Step = 'trade' | 'to' | 'from';

const STEPS: readonly WizardStep<Step>[] = [
  { id: 'trade', title: 'Trade shards', backLabel: 'to the Market' },
  { id: 'to', title: 'Trade for', backLabel: 'to the trade', back: 'trade' },
  { id: 'from', title: 'Pay with', backLabel: 'to the trade', back: 'trade' },
];

/** The shard exchange (V-FORGE-10, at the Market since Q64): the shard to get, the pile to pay from, how many trades, and the rate. */
export function Exchange({
  visit,
  busy,
  error,
  initial,
  onTrade,
  onClose,
}: {
  visit: ValleyVisit;
  busy: boolean;
  error: string | null;
  /** The element an order waits on, if any (the one-tap fix). */
  initial: string | null;
  onTrade: (request: { to: string; from: string | null; times: number }) => void;
  /** Back from the first step (the drawer's X does the same). */
  onClose: () => void;
}) {
  const { forge } = visit;
  const fewest = [...SHARD_ELEMENTS].sort(
    (a, b) => (forge.shelf.shards[a] ?? 0) - (forge.shelf.shards[b] ?? 0),
  )[0];
  const [to, setTo] = useState<string>(initial ?? fewest ?? 'tide');
  const [from, setFrom] = useState<string | null>(null);
  const [times, setTimes] = useState(1);
  const wizard = useWizard(STEPS, { onExit: onClose });
  const sources = exchangeSources(forge, to);
  const can = sources
    .filter((s) => from === null || s.element === from)
    .reduce((n, s) => n + tradesFrom(forge, s.held), 0);
  const most = Math.max(1, Math.min(20, can));
  const shown = Math.min(times, most);
  const reason = exchangeReason(forge, to, from, shown);
  if (wizard.step !== 'trade') {
    const picking = wizard.step === 'to';
    return (
      <PanelBody>
        <WizardView wizard={wizard}>
          <div class="pix-panel">
            <ChoiceList label={picking ? 'Shards to get' : 'Shards to pay with'}>
              {!picking && (
                <ChoiceButton
                  label="Any other shards"
                  line="The biggest pile that can pay."
                  selected={from === null}
                  disabled={false}
                  onClick={() => {
                    setFrom(null);
                    wizard.goTo('trade');
                  }}
                />
              )}
              {(picking
                ? SHARD_ELEMENTS.map((element) => ({
                    element,
                    held: forge.shelf.shards[element] ?? 0,
                  }))
                : sources
              ).map(({ element, held }) => (
                <ChoiceButton
                  key={element}
                  label={<CountBadge {...shardCount(element, held)} size="inline" />}
                  line={!picking && tradesFrom(forge, held) === 0 ? 'Too few' : ''}
                  selected={picking ? to === element : from === element}
                  disabled={!picking && tradesFrom(forge, held) === 0}
                  onClick={() => {
                    if (picking) {
                      setTo(element);
                      if (from === element) setFrom(null);
                    } else {
                      setFrom(element);
                    }
                    wizard.goTo('trade');
                  }}
                />
              ))}
            </ChoiceList>
          </div>
        </WizardView>
      </PanelBody>
    );
  }
  return (
    <PanelBody
      footer={
        <ActionButton
          label="Trade"
          detail={`× ${String(shown)}`}
          cost={[shardMark(to)]}
          wide
          large
          disabled={busy || reason !== null || can === 0}
          onClick={() => {
            onTrade({ to, from, times: shown });
          }}
        />
      }
    >
      <WizardView wizard={wizard}>
        <SlotRow
          label="Trade"
          slots={[
            <Slot
              kind="talent"
              state="filled"
              label={`Trade for ${shardName(to)}. You have ${String(forge.shelf.shards[to] ?? 0)}. Change`}
              onClick={() => {
                wizard.goTo('to');
              }}
            >
              <SlotText
                name={<CountBadge {...shardCount(to, forge.shelf.shards[to] ?? 0)} size="inline" />}
                sub="You get (have)"
              />
            </Slot>,
            <Slot
              kind="talent"
              state="filled"
              label={`Pay with ${from === null ? 'any other shards' : shardName(from)}. Change`}
              onClick={() => {
                wizard.goTo('from');
              }}
            >
              <SlotText
                name={
                  from === null ? (
                    <CountBadge {...anyShardMark()} size="inline" />
                  ) : (
                    <CountBadge {...shardCount(from, forge.shelf.shards[from] ?? 0)} size="inline" />
                  )
                }
                sub={from === null ? 'You pay, any other' : 'You pay (have)'}
              />
            </Slot>,
          ]}
        />
        <div class="fg-times">
          <span class="fg-times-name">Trades</span>
          <CountStepper label="trade" value={shown} max={most} onChange={setTimes} disabled={busy} />
        </div>
        <p class="muted sp-note">
          <SayLine say={exchangeRate(forge)} />
        </p>
        {reason !== null && (
          <Alert level="info">
            <SayLine say={reason} />
          </Alert>
        )}
        {error !== null && <Alert level="alert">{error}</Alert>}
      </WizardView>
    </PanelBody>
  );
}
