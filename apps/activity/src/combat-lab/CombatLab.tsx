import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { KEYWORDS, KNACKS, formStats, type FightResult } from '@creatures/lab';
import { cssVars } from '../css-vars';
import { DataTable } from '../ui/DataTable';
import { Switch } from '../ui/Switch';
import { Tag } from '../ui/Tag';
import { ToggleButton } from '../ui/ToggleButton';
import {
  CARD_CHOICES,
  DAMAGE_TEST_HP,
  FORM_IDS,
  MAX_ATK,
  MAX_COLS,
  MAX_HP,
  MAX_LEVEL,
  MAX_ROUNDS,
  MAX_ROWS,
  MIN_ATK,
  MIN_COLS,
  MIN_HP,
  MIN_LEVEL,
  MIN_ROUNDS,
  MIN_ROWS,
  NO_KNACK,
  PRESET_NAMES,
  applyPreset,
  cellIndex,
  clampInt,
  decodeSetup,
  encodeSetup,
  formName,
  groupSteps,
  knacksOf,
  levelCapOf,
  placementsOf,
  runFight,
  runMany,
  type Cell,
  type ManyStats,
  type Setup,
} from './lab-state';

const num = (n: number): string => Math.round(n).toLocaleString('en-US');
const one = (n: number): string => n.toFixed(1);

/** What a form is, for the small line over its slot ("tide setter"). */
const FORM_KINDS: ReadonlyMap<string, string> = new Map(
  FORM_IDS.map((id) => {
    const s = formStats(id, 1);
    return [id, `${s.element} ${s.role}`];
  }),
);

/** A labelled whole-number box. A value out of range is put back in range when the box is left. */
function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label class="cl-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = clampInt(event.currentTarget.valueAsNumber, min, max, value);
          event.currentTarget.value = String(next);
          onChange(next);
        }}
      />
    </label>
  );
}

/** A Knack's player text. A `{Keyword}` is a small chip: its title (and a tap) says what it means. */
function KnackText({ knackId }: { knackId: string }): JSX.Element | null {
  const [open, setOpen] = useState<string | null>(null);
  const knack = KNACKS[knackId];
  if (knack === undefined) return null;
  const parts = knack.text.split(/(\{[^}]+\})/);
  const meaning = open === null ? undefined : KEYWORDS[open]?.means;
  return (
    <div class="cl-knack-text">
      <p>
        {parts.map((part, i) => {
          const word = /^\{([^}]+)\}$/.exec(part)?.[1];
          if (word === undefined) return part;
          const means = KEYWORDS[word]?.means;
          if (means === undefined) return word;
          return (
            <button
              key={i}
              type="button"
              class={open === word ? 'cl-kw on' : 'cl-kw'}
              title={means}
              aria-pressed={open === word}
              onClick={() => {
                setOpen(open === word ? null : word);
              }}
            >
              {word}
            </button>
          );
        })}
      </p>
      {meaning !== undefined && <p class="cl-kw-means">{meaning}</p>}
    </div>
  );
}

function BoardCell({
  row,
  col,
  cell,
  onChange,
}: {
  row: number;
  col: number;
  cell: Cell;
  onChange: (patch: Partial<Cell>) => void;
}): JSX.Element {
  const where = `Row ${String(row + 1)}, slot ${String(col + 1)}`;
  const cap = cell.formId === null ? MAX_LEVEL : levelCapOf(cell.formId);
  return (
    <div class="cl-cell">
      <p class="cl-slot">
        {where}
        {cell.formId === null ? '' : ` · ${FORM_KINDS.get(cell.formId) ?? ''}`}
      </p>
      <select
        aria-label={`${where}: form`}
        value={cell.formId ?? ''}
        onChange={(event) => {
          const formId = event.currentTarget.value === '' ? null : event.currentTarget.value;
          onChange({ formId, knack: knacksOf(formId)[0] ?? NO_KNACK });
        }}
      >
        <option value="">Empty</option>
        {FORM_IDS.map((id) => (
          <option key={id} value={id}>
            {formName(id)}
          </option>
        ))}
      </select>
      {cell.formId !== null && (
        <>
          <select
            aria-label={`${where}: Knack`}
            value={cell.knack}
            onChange={(event) => {
              onChange({ knack: event.currentTarget.value });
            }}
          >
            <option value={NO_KNACK}>No Knack</option>
            {knacksOf(cell.formId).map((id) => (
              <option key={id} value={id}>
                {KNACKS[id]?.name ?? id}
              </option>
            ))}
          </select>
          <label class="cl-field cl-level">
            <span>Level</span>
            <input
              type="number"
              inputMode="numeric"
              aria-label={`${where}: level`}
              min={MIN_LEVEL}
              max={MAX_LEVEL}
              value={cell.level}
              onChange={(event) => {
                const level = clampInt(
                  event.currentTarget.valueAsNumber,
                  MIN_LEVEL,
                  MAX_LEVEL,
                  cell.level,
                );
                event.currentTarget.value = String(level);
                onChange({ level });
              }}
            />
          </label>
          {cell.level > cap && (
            <p class="cl-slot">Plays at level {String(cap)} (this form stops there).</p>
          )}
          {cell.knack !== NO_KNACK && <KnackText key={cell.knack} knackId={cell.knack} />}
        </>
      )}
    </div>
  );
}

function SetupPanel({
  setup,
  onChange,
}: {
  setup: Setup;
  onChange: (next: Setup) => void;
}): JSX.Element {
  const asks = CARD_CHOICES.filter((c) => setup.cards.includes(c.id));
  const toggleCard = (id: string): void => {
    const cards = setup.cards.includes(id)
      ? setup.cards.filter((c) => c !== id)
      : CARD_CHOICES.filter((c) => c.id === id || setup.cards.includes(c.id)).map((c) => c.id);
    onChange({ ...setup, cards });
  };
  const rowsInPlay = Array.from({ length: setup.rows }, (_, r) => r);
  const colsInPlay = Array.from({ length: setup.cols }, (_, c) => c);
  return (
    <section class="cl-panel" aria-labelledby="cl-setup-h">
      <h2 id="cl-setup-h">Setup</h2>

      <label class="cl-field">
        <span>Start from a preset (replaces the board)</span>
        <select
          value=""
          onChange={(event) => {
            const name = event.currentTarget.value;
            event.currentTarget.value = '';
            if (name !== '') onChange(applyPreset(setup, name));
          }}
        >
          <option value="">Choose a preset...</option>
          {PRESET_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <h3>Arena and boss</h3>
      <div class="cl-numbers">
        <NumberField
          label={`Rows (${String(MIN_ROWS)} to ${String(MAX_ROWS)})`}
          value={setup.rows}
          min={MIN_ROWS}
          max={MAX_ROWS}
          onChange={(rows) => {
            onChange({ ...setup, rows });
          }}
        />
        <NumberField
          label={`Slots per row (${String(MIN_COLS)} to ${String(MAX_COLS)})`}
          value={setup.cols}
          min={MIN_COLS}
          max={MAX_COLS}
          onChange={(cols) => {
            onChange({ ...setup, cols });
          }}
        />
        <NumberField
          label={`Rounds (${String(MIN_ROUNDS)} to ${String(MAX_ROUNDS)})`}
          value={setup.rounds}
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          onChange={(rounds) => {
            onChange({ ...setup, rounds });
          }}
        />
        <NumberField
          label={`Boss Attack (${String(MIN_ATK)} to ${String(MAX_ATK)})`}
          value={setup.atk}
          min={MIN_ATK}
          max={MAX_ATK}
          onChange={(atk) => {
            onChange({ ...setup, atk });
          }}
        />
      </div>
      <Switch
        on={setup.damageTest}
        label={`Damage test (boss has ${num(DAMAGE_TEST_HP)} HP, so the damage is the score)`}
        onChange={(damageTest) => {
          onChange({ ...setup, damageTest });
        }}
      />
      {!setup.damageTest && (
        <NumberField
          label={`Boss HP (${String(MIN_HP)} to ${num(MAX_HP)}; the fight can be won)`}
          value={setup.hp}
          min={MIN_HP}
          max={MAX_HP}
          onChange={(hp) => {
            onChange({ ...setup, hp });
          }}
        />
      )}

      <h3>Rule cards</h3>
      <div class="cl-chips" role="group" aria-label="Rule cards">
        {CARD_CHOICES.map((card) => (
          <ToggleButton
            key={card.id}
            pressed={setup.cards.includes(card.id)}
            title={card.asks}
            onToggle={() => {
              toggleCard(card.id);
            }}
          >
            {card.name}
          </ToggleButton>
        ))}
      </div>
      {asks.length === 0 ? (
        <p class="muted">No rule card on. Tap one to switch it on and read what it asks.</p>
      ) : (
        <ul class="cl-asks">
          {asks.map((card) => (
            <li key={card.id}>
              <strong>{card.name}:</strong> {card.asks}
            </li>
          ))}
        </ul>
      )}

      <h3>Board</h3>
      <p class="muted">
        Row 1 is the front. Each slot has a creature form, a Knack and a level (stage 1 forms stop
        at their own top level).
      </p>
      <div class="cl-board-scroll">
        <div class="cl-board" ref={cssVars({ '--cols': setup.cols })}>
          {rowsInPlay.flatMap((r) =>
            colsInPlay.map((c) => (
              <BoardCell
                key={`${String(r)}-${String(c)}`}
                row={r}
                col={c}
                cell={setup.cells[cellIndex(r, c)] ?? { formId: null, knack: NO_KNACK, level: 25 }}
                onChange={(patch) => {
                  const cells = setup.cells.slice();
                  const i = cellIndex(r, c);
                  const old = cells[i];
                  if (old === undefined) return;
                  cells[i] = { ...old, ...patch };
                  onChange({ ...setup, cells });
                }}
              />
            )),
          )}
        </div>
      </div>
    </section>
  );
}

const KIND_NOTE =
  'The log lists the notable steps: marks, reactions, Blocked hits, dodges, intercepts, silences and hits on creatures. A plain hit on the boss is not a line of its own; its damage is in the table above.';

function FightView({ result }: { result: FightResult }): JSX.Element {
  const rounds = useMemo(() => groupSteps(result.events), [result]);
  return (
    <>
      <h3>Summary</h3>
      <DataTable
        tabular
        bright
        rows={[
          { label: 'Damage', value: num(result.damage) },
          { label: 'Boss HP left', value: num(result.bossHpLeft) },
          { label: 'Won', value: result.won ? 'Yes' : 'No' },
          { label: 'Knockouts', value: String(result.knockouts) },
          { label: 'Reactions', value: String(result.reactions) },
          { label: 'Blocked', value: String(result.blocked) },
          { label: 'Dodges', value: String(result.dodges) },
          { label: 'Intercepts', value: String(result.intercepts) },
          { label: 'Healed', value: num(result.healed) },
        ]}
      />

      <h3>Creatures</h3>
      <div class="cl-scroll-x">
        <table class="cl-table">
          <thead>
            <tr>
              <th scope="col">Creature</th>
              <th scope="col">Knack</th>
              <th scope="col">HP at the end</th>
              <th scope="col">Damage dealt</th>
            </tr>
          </thead>
          <tbody>
            {result.fighters.map((f) => (
              <tr key={f.uid} class={f.hp <= 0 ? 'cl-down' : ''}>
                <th scope="row">
                  {f.name}
                  <span class="muted">
                    {' '}
                    row {String(f.row + 1)}, slot {String(f.col + 1)}
                  </span>
                </th>
                <td>{f.knack === undefined ? 'No Knack' : (KNACKS[f.knack]?.name ?? f.knack)}</td>
                <td>
                  {num(f.hp)} / {num(f.maxHp)}
                  {f.hp <= 0 ? ' (knocked out)' : ''}
                </td>
                <td>{num(f.damageDealt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Step by step</h3>
      <p class="muted">{KIND_NOTE}</p>
      {rounds.length === 0 ? (
        <p class="muted">Nothing notable happened.</p>
      ) : (
        <div class="cl-log" tabIndex={0} role="region" aria-label="Step log">
          {rounds.map((round) => (
            <section key={round.round}>
              <h4>Round {round.round}</h4>
              {round.groups.map((group) => (
                <div key={group.row} class="cl-group">
                  <p class="cl-group-head">
                    Row {group.row + 1} acts, then the boss's turn {group.row + 1}
                  </p>
                  <ul>
                    {group.events.map((event, i) => (
                      <li key={i}>
                        <Tag class={`cl-kind cl-kind-${event.kind}`}>{event.kind}</Tag>
                        <span>{event.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function ManyView({ stats }: { stats: ManyStats }): JSX.Element {
  return (
    <>
      <h3>{String(stats.fights)} seeds</h3>
      <DataTable
        tabular
        bright
        rows={[
          { label: 'Mean damage', value: num(stats.meanDamage) },
          { label: 'Lowest damage', value: num(stats.lowestDamage) },
          { label: 'Highest damage', value: num(stats.highestDamage) },
          { label: 'Fights won', value: `${String(Math.round(stats.winShare * 100))}%` },
          { label: 'Mean knockouts', value: one(stats.meanKnockouts) },
          { label: 'Mean reactions', value: one(stats.meanReactions) },
        ]}
      />
    </>
  );
}

/** What was run: the setup (as its address text) and the seed, so a change since then can be told. */
interface Ran<T> {
  key: string;
  seed: string;
  value: T;
}

/** The combat lab: set up a combat v2 prototype fight, run it, read it. Everything runs in the browser. */
export function CombatLab(): JSX.Element {
  const [setup, setSetup] = useState<Setup>(() => decodeSetup(window.location.hash));
  const [seed, setSeed] = useState('lab');
  const [fightRan, setFightRan] = useState<Ran<FightResult> | null>(null);
  const [manyRan, setManyRan] = useState<Ran<ManyStats> | null>(null);

  const address = encodeSetup(setup);
  useEffect(() => {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${address}`,
    );
  }, [address]);
  useEffect(() => {
    const onHash = (): void => {
      setSetup(decodeSetup(window.location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const creatures = placementsOf(setup).length;
  const stale = (ran: Ran<unknown> | null): boolean =>
    ran !== null && (ran.key !== address || ran.seed !== seed);

  return (
    <main class="cl">
      <header class="cl-head">
        <h1>Combat lab</h1>
        <p class="muted">
          Staging only. Set up a combat v2 prototype fight, run it and read what happened. It runs
          in your browser: no server, no sign-in. The address holds your setup, so you can copy it
          to share or come back to it.
        </p>
      </header>
      <div class="cl-layout">
        <SetupPanel setup={setup} onChange={setSetup} />
        <section class="cl-panel" aria-labelledby="cl-run-h">
          <h2 id="cl-run-h">Run</h2>
          <label class="cl-field">
            <span>Seed (the same seed always plays out the same)</span>
            <input
              type="text"
              maxLength={60}
              value={seed}
              onInput={(event) => {
                setSeed(event.currentTarget.value);
              }}
            />
          </label>
          <div class="cl-buttons">
            <button
              type="button"
              class="primary"
              disabled={creatures === 0}
              onClick={() => {
                setFightRan({ key: address, seed, value: runFight(setup, seed) });
              }}
            >
              Run fight
            </button>
            <button
              type="button"
              disabled={creatures === 0}
              onClick={() => {
                setManyRan({ key: address, seed, value: runMany(setup, seed) });
              }}
            >
              Run 100 seeds
            </button>
          </div>
          {creatures === 0 && <p class="muted">Put at least one creature on the board.</p>}
          {(stale(fightRan) || stale(manyRan)) && (
            <p class="muted" role="status">
              The setup or the seed has changed since the last run. Run again to see its effect.
            </p>
          )}
          {manyRan !== null && <ManyView stats={manyRan.value} />}
          {fightRan !== null && <FightView result={fightRan.value} />}
        </section>
      </div>
    </main>
  );
}
