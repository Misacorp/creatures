/**
 * The staging-only debug panel: a small "DEV" button and, opened, a full-screen overlay on a desktop (a sheet on a phone)
 * with a section nav, the target player's picker at the top and the dev tools of
 * `docs/design/dev-tools.md`. This module (with `dev.css` and everything else in `src/dev/`) is loaded
 * lazily by `dev-gate.ts` and is not part of the production build.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DevPanelProps } from '../dev-gate';
import { creatureName } from '../game';
import {
  clockRows,
  describeBench,
  describeResult,
  errorSentence,
  eventLine,
  fetchDevEvents,
  fetchDevState,
  fetchPresetChoices,
  parseWatch,
  replayPhaseOf,
  runTool,
  type DevStateView,
  type PresetChoices,
  type WatchTarget,
} from './dev-api';
import './dev.css';
import { buildRows, readBuildInfo } from '../build-info';
import { openExternalLink } from '../external-link';
import { isLook, LOOKS, ROOM_MODES, type LookId, type RoomMode } from '../looks';
import { resetLocalFlags } from './flags';
import { chooseLook, chooseRoom, storedLook, storedRoom } from './look-prefs';
import { isTargeted, type CreatureChoice, type ToolSpec } from './forms';
import { speciesName } from './options';
import {
  ROSTER_PRESET_SPEC,
  SECTIONS,
  firstSection,
  navGroups,
  sectionUsesTarget,
  type SectionDef,
  type SectionExtra,
} from './specs';
import { RosterPresets } from './RosterPresets';
import { ToolForm } from './ToolForm';
import { COMBAT_LAB_URL } from './combat-lab-link';
import { PROTOTYPE_URL } from './prototype-link';
import { WORKBENCH_URL } from './workbench-link';
import { Replay } from '../Replay';
import { ToggleButton } from '../ui/ToggleButton';
import { DataTable } from '../ui/DataTable';

/** The "Look" section: which look and room band mode this device tries (remembered on the device). */
function LookSwitch(): JSX.Element {
  const [look, setLook] = useState<LookId>(() => storedLook());
  const [room, setRoom] = useState<RoomMode>(() => storedRoom());
  return (
    <div class="dev-fields">
      <label class="dev-field">
        Look
        <select
          value={look}
          onChange={(e) => {
            const value = e.currentTarget.value;
            if (!isLook(value)) return;
            setLook(value);
            chooseLook(value);
          }}
        >
          {LOOKS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label class="dev-field">
        Room band
        <select
          value={room}
          onChange={(e) => {
            const value = e.currentTarget.value;
            const mode = ROOM_MODES.find((m) => m === value);
            if (mode === undefined) return;
            setRoom(mode);
            chooseRoom(mode);
          }}
        >
          {ROOM_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** A string only this module tree contains: the production build test searches the output for it. */
const DEV_PANEL_MARKER = 'DEV_PANEL_MARKER_7f3a';

interface Status {
  ok: boolean;
  text: string;
}

/** A link to a staging-only page: opened through Discord when inside it, else shown to copy. */
function PageLink({
  name,
  url,
  blurb,
  onStatus,
}: {
  name: string;
  url: string;
  blurb: string;
  onStatus: (status: Status) => void;
}): JSX.Element {
  return (
    <div class="dev-workbench">
      <p class="dev-hint">{blurb}</p>
      <p class="dev-url">{url}</p>
      <div class="dev-quick-row">
        <button
          type="button"
          class="dev-btn"
          onClick={() => {
            void openExternalLink(url).then((ok) => {
              onStatus(
                ok
                  ? { ok: true, text: `${name}: link opened` }
                  : { ok: false, text: `${name}: could not open it, copy the address` },
              );
            });
          }}
        >
          Open
        </button>
        <button
          type="button"
          class="dev-btn"
          onClick={() => {
            navigator.clipboard.writeText(url).then(
              () => {
                onStatus({ ok: true, text: `${name}: address copied` });
              },
              () => {
                onStatus({ ok: false, text: `${name}: could not copy, select the address` });
              },
            );
          }}
        >
          Copy link
        </button>
      </div>
    </div>
  );
}

/** The link to the component workbench. */
function WorkbenchLink({ onStatus }: { onStatus: (status: Status) => void }): JSX.Element {
  return (
    <PageLink
      name="Component workbench"
      url={WORKBENCH_URL}
      blurb="Every reusable piece of the game on one page, with controls and a feedback button. It opens in your browser, no sign-in."
      onStatus={onStatus}
    />
  );
}

/** The link to the combat lab (the combat v2 prototype). */
function CombatLabLink({ onStatus }: { onStatus: (status: Status) => void }): JSX.Element {
  return (
    <PageLink
      name="Combat lab"
      url={COMBAT_LAB_URL}
      blurb="Set up a combat v2 prototype fight, run it and read what happened step by step. It opens in your browser, no sign-in."
      onStatus={onStatus}
    />
  );
}

/** The link to the clickable concept prototypes (the valley, the party). */
function PrototypeLink({ onStatus }: { onStatus: (status: Status) => void }): JSX.Element {
  return (
    <PageLink
      name="Prototypes"
      url={PROTOTYPE_URL}
      blurb="Two clickable concepts for the game's next look: the valley as the menu, and your creatures running the show. Sample data only. It opens in your browser, no sign-in."
      onStatus={onStatus}
    />
  );
}

function ClockStatus({ view }: { view: DevStateView | null }): JSX.Element {
  if (view === null) return <p class="dev-hint">Loading the clock...</p>;
  return <DataTable class="dev-clock" rows={clockRows(view)} />;
}

/** The picker's value for the caller ("You"): no `userId` is sent, so the server acts on the session's own player. */
const YOU = 'you';

/**
 * The target player, at the top of the panel and shared by every tool that acts on a player: "You" (the default) or any
 * player of the server. A section whose tools do not act on a player says so instead of looking usable.
 */
function TargetBar({
  choices,
  value,
  onChange,
  used,
}: {
  choices: PresetChoices | null;
  value: string;
  onChange: (value: string) => void;
  used: boolean;
}): JSX.Element {
  const others = choices?.players.filter((p) => p.userId !== choices.you) ?? [];
  const me = choices?.players.find((p) => p.userId === choices.you);
  const other = value !== YOU;
  return (
    <div class={other && used ? 'dev-target is-other' : 'dev-target'}>
      <label class="dev-target-pick">
        <span>Target player</span>
        <select
          value={value}
          onChange={(e) => {
            onChange(e.currentTarget.value);
          }}
        >
          <option value={YOU}>
            {me === undefined
              ? 'You'
              : `You (${me.name}, ${String(me.creatures)} creatures, ${String(me.items)} items)`}
          </option>
          {others.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name} ({String(p.creatures)} creatures, {String(p.items)} items)
            </option>
          ))}
        </select>
      </label>
      <p class="dev-target-note">
        {used
          ? other
            ? 'The tools below act on this player, not on you.'
            : 'The tools below act on you.'
          : 'This section does not act on a player: it is about the whole server.'}
      </p>
    </div>
  );
}

export default function DevPanel({ tab, creatures, onChanged }: DevPanelProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DevStateView | null>(null);
  const [players, setPlayers] = useState<PresetChoices | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<string[] | null>(null);
  const [sectionId, setSectionId] = useState(() => firstSection(tab));
  /** The target player: `you`, or a user id of the server. */
  const [target, setTarget] = useState(YOU);
  /** The fight a Play button opened: its replay is on screen over the game. */
  const [watch, setWatch] = useState<WatchTarget | null>(null);
  const inFlight = useRef(false);

  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  // A target who left the list (or a list that did not load) means "You".
  const targetId =
    target === YOU || players?.players.some((p) => p.userId === target) !== true ? YOU : target;
  const targetPlayer =
    targetId === YOU ? null : (players?.players.find((p) => p.userId === targetId) ?? null);

  /** The creatures the pickers list: the target's (from the server's list), or yours before it loaded. */
  const choices = useMemo<CreatureChoice[]>(() => {
    const owner = players?.players.find((p) => p.userId === (targetPlayer?.userId ?? players.you));
    if (owner !== undefined) {
      return owner.roster.map((c) => ({
        id: c.id,
        species: c.species,
        label: `${speciesName(c.species)} (Lv ${String(c.level)})`,
      }));
    }
    return creatures.map((c) => ({
      id: c.id,
      species: c.species,
      label: `${creatureName(c)} (Lv ${String(c.level)})`,
    }));
  }, [creatures, players, targetPlayer]);

  const reloadView = (): void => {
    void fetchDevState().then(setView);
    void fetchPresetChoices().then((found) => {
      if (found !== null) setPlayers(found);
    });
  };
  const loadEvents = (): void => {
    void fetchDevEvents().then((list) => {
      if (list === null) setStatus({ ok: false, text: 'Could not load the events' });
      else setEvents(list.map(eventLine));
    });
  };

  useEffect(() => {
    if (open) reloadView();
  }, [open]);
  // A new tab opens its own section first.
  useEffect(() => {
    setSectionId(firstSection(tab));
  }, [tab]);
  // Escape closes the panel (the replay on top of it has its own Back).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (spec: ToolSpec, body: Record<string, unknown>): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    // A per-player tool acts on the target player: the id goes in the body (the server checks it is a player of this server).
    const sent = targetId !== YOU && isTargeted(spec.tool) ? { ...body, userId: targetId } : body;
    void runTool(spec.tool, sent).then((outcome) => {
      inFlight.current = false;
      setBusy(false);
      if (!outcome.ok) {
        setStatus({ ok: false, text: `${spec.label}: ${errorSentence(outcome.error)}` });
        return;
      }
      const who = targetPlayer !== null && isTargeted(spec.tool) ? ` (${targetPlayer.name})` : '';
      setStatus({
        ok: true,
        text: `${spec.label}${who}: ${describeBench(spec.tool, outcome.result) ?? describeResult(outcome.result)}`,
      });
      // A played stage opens its replay at once (a live finale has none: the game's own finale screen shows it).
      const watchTarget = spec.tool === 'raid-play' ? parseWatch(outcome.result) : null;
      if (watchTarget !== null) {
        setWatch(watchTarget);
        setOpen(false);
      }
      reloadView();
      if (spec.tool === 'analytics-rollup' && events !== null) loadEvents();
      onChanged();
    });
  };

  const tag = targetPlayer?.name ?? null;

  /** The controls one after the other, as listed: a sequence of steps. */
  const steps = (specs: readonly ToolSpec[]): JSX.Element => (
    <>
      {specs.map((s) => (
        <ToolForm
          key={`${s.tool}:${s.label}`}
          spec={s}
          choices={choices}
          busy={busy}
          onRun={run}
          stacked
          targetName={tag}
        />
      ))}
    </>
  );

  const forms = (specs: readonly ToolSpec[]): JSX.Element => (
    <>
      <div class="dev-quick-row">
        {specs
          .filter((s) => s.fields.length === 0)
          .map((s) => (
            <ToolForm
              key={`${s.tool}:${s.label}`}
              spec={s}
              choices={choices}
              busy={busy}
              onRun={run}
              targetName={tag}
            />
          ))}
      </div>
      <div class="dev-cards">
        {specs
          .filter((s) => s.fields.length > 0)
          .map((s) => (
            <ToolForm
              key={`${s.tool}:${s.label}`}
              spec={s}
              choices={choices}
              busy={busy}
              onRun={run}
              targetName={tag}
            />
          ))}
      </div>
    </>
  );

  /** A piece of a section that is not a plain tool control. */
  const extra = (id: SectionExtra): JSX.Element => {
    switch (id) {
      case 'presets':
        return (
          <div class="dev-cards">
            <RosterPresets
              choices={players}
              target={targetId === YOU ? (players?.you ?? '') : targetId}
              busy={busy}
              onApply={(body) => {
                run(ROSTER_PRESET_SPEC, body);
              }}
            />
          </div>
        );
      case 'clock-status':
        return <ClockStatus view={view} />;
      case 'events':
        return (
          <div class="dev-events">
            <button type="button" class="dev-btn" onClick={loadEvents}>
              Show last 50 events
            </button>
            {events !== null && (
              <ol class="dev-event-list">
                {events.length === 0 && <li>No events yet</li>}
                {events.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            )}
          </div>
        );
      case 'look':
        return (
          <>
            <LookSwitch />
            <p class="dev-hint">
              Tries a visual style on this device (kept until you change it). Room band: every
              place, or Home only on a wide window.
            </p>
          </>
        );
      case 'links':
        return (
          <div class="dev-cards">
            <WorkbenchLink onStatus={setStatus} />
            <CombatLabLink onStatus={setStatus} />
            <PrototypeLink onStatus={setStatus} />
          </div>
        );
      case 'build':
        return <DataTable class="dev-clock" rows={buildRows(readBuildInfo(document))} />;
      case 'local-flags':
        return (
          <div class="dev-quick-row">
            <button
              type="button"
              class="dev-btn"
              onClick={() => {
                const removed = resetLocalFlags();
                setStatus({
                  ok: true,
                  text: `Reset local flags: ${String(removed)} removed (coach marks, slot-wipe notice)`,
                });
                onChanged();
              }}
            >
              Reset local flags
            </button>
          </div>
        );
    }
  };

  const body = (def: SectionDef): JSX.Element => (
    <>
      {def.before?.map((id) => (
        <div key={id}>{extra(id)}</div>
      ))}
      {def.blocks !== undefined
        ? def.blocks.map((block) => (
            <section key={block.title} class="dev-block">
              <h4 class="dev-block-title">{block.title}</h4>
              {forms(block.specs)}
            </section>
          ))
        : def.ordered === true
          ? steps(def.specs)
          : forms(def.specs)}
      {def.after?.map((id) => (
        <div key={id}>{extra(id)}</div>
      ))}
    </>
  );

  return (
    <div data-dev-panel={DEV_PANEL_MARKER}>
      <button
        type="button"
        class="dev-fab"
        aria-expanded={open}
        aria-controls="dev-drawer"
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        DEV
      </button>
      {watch !== null && (
        <div class="dev-replay" role="region" aria-label="Replay">
          <Replay
            weekId={watch.week}
            party={watch.party}
            phase={replayPhaseOf(watch.phase)}
            rules={2}
            onClose={() => {
              setWatch(null);
            }}
          />
        </div>
      )}
      {open && section !== undefined && (
        <div class="dev-drawer" id="dev-drawer" role="region" aria-label="Dev tools">
          <header class="dev-head">
            <h2>Dev tools (staging)</h2>
            <button
              type="button"
              class="dev-close"
              onClick={() => {
                setOpen(false);
              }}
            >
              Close
            </button>
          </header>
          {status !== null && (
            <p class={status.ok ? 'dev-status dev-ok' : 'dev-status dev-bad'} role="status">
              {status.ok ? 'OK ' : 'Error '}
              {status.text}
            </p>
          )}
          <TargetBar
            choices={players}
            value={targetId}
            onChange={setTarget}
            used={sectionUsesTarget(section)}
          />
          <div class="dev-body">
            <nav class="dev-nav" aria-label="Dev tool sections">
              {navGroups().map((g) => (
                <div key={g.group} class="dev-nav-group">
                  <p class="dev-nav-heading">{g.group}</p>
                  <div class="dev-nav-items">
                    {g.sections.map((s) => (
                      <ToggleButton
                        key={s.id}
                        pressed={s.id === section.id}
                        onToggle={() => {
                          setSectionId(s.id);
                        }}
                      >
                        {s.title}
                      </ToggleButton>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div class="dev-scroll">
              <h3 class="dev-section-title">{section.title}</h3>
              {body(section)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
