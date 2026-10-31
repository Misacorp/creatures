import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchLedger, type Balances, type LeetSyncStatus, type LedgerEntry } from './api';
import { GlossaryTag } from './Glossary';
import type { IconRef } from './icon-ref';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { leetStatusLine } from './leet-status';
import { INCOME_FETCH, baitIncome, incomeRow } from './ledger-text';
import { compactCount } from './number-format';
import { CountBadgeList } from './ui/CountBadge';
import { DataTable } from './ui/DataTable';
import { GameIcon } from './ui/GameIcon';
import { Popover, popupProps } from './ui/Popover';

/** What assistive technology says for the button: both amounts. */
export function currencyLabel(balances: Balances): string {
  return `Currencies: ${String(balances.bait)} Bait, ${String(balances.essence)} Essence`;
}

/**
 * An amount for the HUD's tight spot: whole numbers with thousands separators ("1,240") up to 9,999, then
 * "12.3K" and so on (`compactCount`). The exact numbers are in the button's spoken label and the popover.
 */
export function hudAmount(n: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return value < 10_000 ? value.toLocaleString('en') : compactCount(value);
}

/** One line of the popover: the currency's picture, its amount and its glossary tag. */
function CurrencyLine({
  glyph,
  amount,
  entry,
  name,
}: {
  glyph: string;
  amount: number;
  entry: string;
  name: string;
}) {
  return (
    <li class="currency-line">
      <Sprite sprite={glyphOrUnknown(glyph)} scale={3} />
      <span class="currency-amount pix">{amount}</span>
      <GlossaryTag entry={entry}>{name}</GlossaryTag>
    </li>
  );
}

/** The popover's short list of recent Bait income (sources only, never spends), loaded each time it opens. */
function IncomeList({ load }: { load: () => Promise<LedgerEntry[]> }) {
  // null: loading; 'failed': the history did not load; else the credits.
  const [entries, setEntries] = useState<LedgerEntry[] | 'failed' | null>(null);
  useEffect(() => {
    let current = true;
    load().then(
      (all) => {
        if (current) setEntries(baitIncome(all));
      },
      () => {
        if (current) setEntries('failed');
      },
    );
    return () => {
      current = false;
    };
  }, []);
  return (
    <section class="income" aria-label="Recent Bait income">
      <h3 class="income-title pix">Recent Bait income</h3>
      {entries === 'failed' ? (
        <p class="small muted">Could not load the history.</p>
      ) : entries === null ? (
        <p class="small muted">Loading...</p>
      ) : entries.length === 0 ? (
        <p class="small muted">No Bait has come in yet.</p>
      ) : (
        // The shared data table: where it came from, then the amount in its own column (2026-10-28: as one
        // line, "+30 · leet on 2026-10-23 with 4 players" wrapped mid-phrase).
        <DataTable
          class="income-list"
          bright
          rows={entries.map((entry) => {
            const row = incomeRow(entry);
            return { label: row.source, value: row.amount };
          })}
        />
      )}
    </section>
  );
}

/** A failed leet sync is a warning players can report; a healthy one says nothing here. */
function LeetWarning({ status }: { status: LeetSyncStatus | null | undefined }) {
  if (status === null || status === undefined || status.lastError === null) return null;
  const line = leetStatusLine(status, Date.now());
  return (
    <p class="small error" role="status">
      {line.text}
    </p>
  );
}

/** One resource of a purse that is not Bait and Essence (the valley prototype's Acorns, scrap and shards). */
export interface PurseResource {
  key: string;
  icon: IconRef;
  amount: number;
  /** "Acorns": what assistive technology says, and the popover's name. */
  label: string;
}

/**
 * The currency pile: one button in the HUD (left of "?") that shows the Bait and Essence balances, each
 * with its picture, and opens a compact popover with the exact amounts and their glossary tags. The popover
 * is its own, so the tags can open their entries above it without closing it. Below the amounts it lists the
 * latest Bait income (`loadLedger`, the player's ledger, filtered to credits) and, when the leet sync is
 * failing, its warning. Reachable from every tab.
 */
export function CurrencyPile({
  balances,
  leetSync,
  loadLedger = () => fetchLedger(INCOME_FETCH, true),
  resources,
}: {
  balances: Balances;
  /**
   * Show these in place of Bait and Essence (the valley prototype's purse); the popover then lists them as
   * count badges, with no ledger. The game itself never sets it.
   */
  resources?: readonly PurseResource[];
  /** The leet sync status: a failure is shown in the popover ("Tell the game admin"). */
  leetSync?: LeetSyncStatus | null;
  /** Fetches the newest ledger entries (the workbench and tests pass their own). */
  loadLedger?: () => Promise<LedgerEntry[]>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        class="currency-pile"
        {...popupProps(open)}
        aria-label={
          resources === undefined
            ? currencyLabel(balances)
            : `Purse: ${resources.map((r) => `${String(r.amount)} ${r.label}`).join(', ')}`
        }
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {resources === undefined ? (
          <>
            <span class="currency-chip">
              <Sprite sprite={glyphOrUnknown('bait')} scale={2} />
              <span class="pix">{hudAmount(balances.bait)}</span>
            </span>
            <span class="currency-chip">
              <Sprite sprite={glyphOrUnknown('gem')} scale={2} />
              <span class="pix">{hudAmount(balances.essence)}</span>
            </span>
          </>
        ) : (
          resources.map((r) => (
            <span key={r.key} class="currency-chip">
              <GameIcon icon={r.icon} scale={2} />
              <span class="pix">{hudAmount(r.amount)}</span>
            </span>
          ))
        )}
      </button>
      {open && (
        <Popover
          layer="page"
          size="compact"
          anchor={() => ref.current}
          label="Currencies"
          onClose={() => {
            setOpen(false);
          }}
        >
          {resources === undefined ? (
            <>
              <ul class="currency-lines">
                <CurrencyLine glyph="bait" amount={balances.bait} entry="bait" name="Bait" />
                <CurrencyLine
                  glyph="gem"
                  amount={balances.essence}
                  entry="essence"
                  name="Essence"
                />
              </ul>
              <IncomeList load={loadLedger} />
              <LeetWarning status={leetSync} />
            </>
          ) : (
            <CountBadgeList
              label="Purse"
              items={resources.map((r) => ({
                key: r.key,
                icon: r.icon,
                amount: r.amount,
                label: r.label,
                name: r.label,
              }))}
            />
          )}
        </Popover>
      )}
    </>
  );
}
