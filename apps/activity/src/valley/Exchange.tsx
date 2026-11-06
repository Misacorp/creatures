/**
 * The shard exchange (V-FORGE-10, moved to the Market by Q64): the drawer's content, drawn by the Market's page once the server has built
 * the Market. It was the Forge's; it is the same drawer (the shard to get, the pile to pay from, how many trades, the rate and the crit
 * chance), moved and not copied. The words are `forge-view.ts` (`exchange*`); the keyed spend is the game's (`ForgeActions` no longer
 * carries it; `MarketActions.exchange` does).
 */
import { useState } from 'preact/hooks';
import type { ValleyVisit } from '../api';
import { elementName } from '../game';
import { Alert } from '../ui/Alert';
import { ActionButton } from '../ui/ActionButton';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CountStepper } from '../ui/CountStepper';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { Slot, SlotRow } from '../ui/Slot';
import { SlotText } from './seat-parts';
import {
  SHARD_ELEMENTS,
  exchangeRateText,
  exchangeReason,
  exchangeSources,
  shardName,
  tradesFrom,
} from './forge-view';

/** The shard exchange (V-FORGE-10, at the Market since Q64): the shard to get, the pile to pay from, how many trades, and the rate. */
export function Exchange({
  visit,
  busy,
  error,
  initial,
  onTrade,
}: {
  visit: ValleyVisit;
  busy: boolean;
  error: string | null;
  /** The element an order waits on, if any (the one-tap fix). */
  initial: string | null;
  onTrade: (request: { to: string; from: string | null; times: number }) => void;
}) {
  const { forge } = visit;
  const fewest = [...SHARD_ELEMENTS].sort(
    (a, b) => (forge.shelf.shards[a] ?? 0) - (forge.shelf.shards[b] ?? 0),
  )[0];
  const [to, setTo] = useState<string>(initial ?? fewest ?? 'tide');
  const [from, setFrom] = useState<string | null>(null);
  const [times, setTimes] = useState(1);
  const [drill, setDrill] = useState<'to' | 'from' | null>(null);
  const sources = exchangeSources(forge, to);
  const can = sources
    .filter((s) => from === null || s.element === from)
    .reduce((n, s) => n + tradesFrom(forge, s.held), 0);
  const most = Math.max(1, Math.min(20, can));
  const shown = Math.min(times, most);
  const reason = exchangeReason(forge, to, from, shown);
  if (drill !== null) {
    const picking = drill === 'to';
    return (
      <div
        class="dr-stack"
        onKeyDown={onDrillKey(() => {
          setDrill(null);
        })}
      >
        <DrillHead
          title={picking ? 'Trade for' : 'Pay with'}
          backLabel="to the trade"
          focus
          onBack={() => {
            setDrill(null);
          }}
        />
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
                  setDrill(null);
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
                label={shardName(element)}
                line={`You have ${String(held)}.`}
                selected={picking ? to === element : from === element}
                disabled={!picking && tradesFrom(forge, held) === 0}
                onClick={() => {
                  if (picking) {
                    setTo(element);
                    if (from === element) setFrom(null);
                  } else {
                    setFrom(element);
                  }
                  setDrill(null);
                }}
              />
            ))}
          </ChoiceList>
        </div>
      </div>
    );
  }
  return (
    <div class="dr-stack">
      <SlotRow
        label="Trade"
        slots={[
          <Slot
            kind="talent"
            state="filled"
            label={`Trade for ${shardName(to)}. You have ${String(forge.shelf.shards[to] ?? 0)}. Change`}
            onClick={() => {
              setDrill('to');
            }}
          >
            <SlotText
              name={shardName(to)}
              sub={`You get (have ${String(forge.shelf.shards[to] ?? 0)})`}
            />
          </Slot>,
          <Slot
            kind="talent"
            state="filled"
            label={`Pay with ${from === null ? 'any other shards' : shardName(from)}. Change`}
            onClick={() => {
              setDrill('from');
            }}
          >
            <SlotText
              name={from === null ? 'Any other' : shardName(from)}
              sub={
                from === null
                  ? 'You pay'
                  : `You pay (have ${String(forge.shelf.shards[from] ?? 0)})`
              }
            />
          </Slot>,
        ]}
      />
      <div class="fg-times">
        <span class="fg-times-name">Trades</span>
        <CountStepper label="trade" value={shown} max={most} onChange={setTimes} disabled={busy} />
      </div>
      <p class="muted sp-note">{exchangeRateText(forge)}</p>
      {reason !== null && <Alert level="info">{reason}</Alert>}
      {error !== null && <Alert level="alert">{error}</Alert>}
      <ActionButton
        label="Trade"
        detail={`${String(shown)} for ${elementName(to)}`}
        wide
        large
        disabled={busy || reason !== null || can === 0}
        onClick={() => {
          onTrade({ to, from, times: shown });
        }}
      />
    </div>
  );
}
