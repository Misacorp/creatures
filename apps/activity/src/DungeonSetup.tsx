import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { TreatBox } from './TreatBox';
import type { Creature } from './api';
import { CreatureConfigurator, type ConfiguratorParts } from './CreatureConfigurator';
import { DepthPicker } from './DepthPicker';
import type { PreviewStatusName } from './use-job-preview';
import { DungeonPrerun } from './DungeonPrerun';
import { fetchDungeonPreview } from './dungeon-api';
import { DungeonTeam } from './DungeonTeam';
import { TeamCreaturePage, type TeamConfigure } from './TeamCreaturePage';
import {
  isComplete,
  pruneSlots,
  sameSlots,
  setupTeam,
  slotIndexOf,
  unplace,
  type Slots,
} from './dungeon-team';
import { blockedText, isRetryOffer, RETRY_TEXT } from './dungeon-text';
import type { DungeonPreview, DungeonToday } from './dungeon-types';
import { baitCount } from './count-items';
import { GlossaryTag } from './Glossary';
import { CountBadge } from './ui/CountBadge';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { tabPalette } from './tabs';
import { creatureName } from './game';
import { toPickerCreature } from './roster-picker';
import { scrollAndFocus } from './scroll-to';
import { useDungeonDraft } from './use-dungeon-draft';
import { BagFullNote } from './ui/BagFullNote';
import type { Forecast } from './weather-types';
import { Alert } from './ui/Alert';

interface Props {
  today: DungeonToday;
  /** The valley's sky, for the one line on the card (absent or null: none). */
  forecast?: Forecast | null;
  creatures: readonly Creature[];
  /** The player's Bait: a treat costs some of it. */
  bait: number;
  /** True while the run is being sent. */
  busy: boolean;
  error: string | null;
  /** The row of this session, kept by the game while the player was on another tab (null: none yet). */
  draft: Slots | null;
  /** Every change of the row, so the game can keep it for the next visit. */
  onDraftChange: (slots: Slots) => void;
  /** Saves the row on the server (`PUT /api/dungeon/team`), debounced; leave out to save nothing. */
  saveDraft?: (team: Slots) => Promise<unknown>;
  /** The player pressed Enter with a complete team, and the creatures they packed a treat for. */
  onEnter: (slots: Slots, treats: ReadonlySet<string>, depth?: number) => void;
  /**
   * Combat v2: the pre-run map at a depth picked below the player's own (the foes' numbers are the depth's). Absent: the real
   * request. The card shows today's map until the answer arrives, and again if it fails.
   */
  loadPreview?: (depth: number) => Promise<DungeonPreview>;
  /** The depth the picker starts on (the workbench's); absent: the player's own. */
  initialDepth?: number;
  /** Opens the summary of today's earlier run (the first-day retry offer). */
  onSeeLast: () => void;
  /**
   * Getting the team ready for the run. A tap on a creature of the board shows its configurator under the
   * board (another tap hides it); its Creature page button opens the creature's own page in the card's
   * place, flipping through the team, and Back returns. Absent: the creature's popover with Remove from team.
   */
  configure?: TeamConfigure | undefined;
}

/** What a dungeon run asks of a creature: who it is, how it grows, what it fights with. */
const DUNGEON_PARTS: ConfiguratorParts = {
  experience: true,
  stats: true,
  gear: true,
  talents: true,
};

/**
 * On a run of combat v2 the Knack is part of what a creature fights with (finale abilities are gone): the picker is on the card, set
 * before the run starts. The part draws only for a creature that has v2 data, so nothing else changes.
 */
const DUNGEON_PARTS_V2: ConfiguratorParts = { ...DUNGEON_PARTS, knack: true };

/**
 * The pre-run screen: one card (`DungeonPrerun`) with the title and streak, the three rooms and the
 * day's modifiers, the depth track, then the team on the Raid Roster's board and the Enter button
 * (or, instead of the card's team, the reason a run is not possible). The
 * team starts as the row of this session if there is one (`draft`), else the row saved on the
 * server (`today.draftTeam`), else the player's last team, each creature in the slot it stood in, or
 * on the first run their strongest three in the order that sets off the most reactions (`setupTeam`).
 * Every change is reported up and saved a moment later, so leaving the screen (or the page) keeps
 * the row; a run deletes the draft and the next row starts from that run's team. The choice is who
 * stands where; the server checks it and decides the run. Streak and reset time are in the end
 * report, not here.
 */
export function DungeonSetup({
  today,
  forecast = null,
  creatures,
  bait,
  busy,
  error,
  draft,
  onDraftChange,
  saveDraft,
  onEnter,
  loadPreview,
  initialDepth,
  onSeeLast,
  configure,
}: Props) {
  const pickable = useMemo(() => creatures.map(toPickerCreature), [creatures]);
  const saver = useDungeonDraft(saveDraft);
  // The creatures that get a treat on this run (not kept for the next one: each run pays for its own).
  const [treats, setTreats] = useState<ReadonlySet<string>>(new Set());
  /** The creature whose configurator is shown. */
  const [selected, setSelected] = useState<string | null>(null);
  /** The team creature whose page is open in the card's place. */
  const [page, setPage] = useState<string | null>(null);
  /** Back from a page: the tile of the creature shown last gets the focus. */
  const backTo = useRef<string | null>(null);
  // Combat v2: the depth to play, any the player has unlocked (1 to their own, `today.depth`); their own to begin with.
  const own = today.depth;
  const pickDepth = today.rules === 2 && own >= 2;
  // `null` is "my own depth", whatever it is when the card is used: a card left open while the depth moves on then
  // starts the new own depth, never a lower run by surprise.
  const [pick, setPick] = useState<number | null>(initialDepth ?? null);
  const depth = pickDepth && pick !== null ? Math.min(Math.max(1, pick), own) : own;
  const [preview, setPreview] = useState<DungeonPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatusName>('idle');
  // A depth below their own shows that depth's map and floor boss. Until the answer is in (or if it fails) the card
  // says so under the picker and does not show the own depth's map as if it were the picked depth's.
  useEffect(() => {
    if (!pickDepth || depth >= own) {
      setPreview(null);
      setPreviewStatus('idle');
      return undefined;
    }
    let live = true;
    setPreview(null);
    setPreviewStatus('loading');
    (loadPreview ?? ((d: number) => fetchDungeonPreview(d)))(depth).then(
      (answer) => {
        if (!live) return;
        setPreview(answer);
        setPreviewStatus('ready');
      },
      () => {
        if (!live) return;
        setPreview(null);
        setPreviewStatus('failed');
      },
    );
    return () => {
      live = false;
    };
  }, [pickDepth, depth, own]);
  const shownToday: DungeonToday =
    preview !== null && preview.depth === depth && depth < own
      ? {
          ...today,
          depth,
          landmark: preview.landmark,
          landmarkBoss: preview.landmarkBoss,
          map: preview.map,
        }
      : pickDepth && depth < own
        ? // The picked depth's map is not here yet (or failed): draw no map rather than the own depth's.
          { ...today, depth, landmark: false, landmarkBoss: null, map: null }
        : today;
  const [slots, setSlots] = useState<Slots>(() =>
    setupTeam({
      memory: draft,
      saved: today.draftTeam,
      lastTeam: today.lastTeam,
      creatures: pickable,
    }),
  );

  /** A change of the row by the player (or by the collection): keep it, report it and save it soon. */
  function change(next: Slots): void {
    setSlots(next);
    onDraftChange(next);
    saver.change(next);
  }

  // The collection can change under the screen (a refresh after another tab): drop creatures that are gone.
  const owned = creatures.map((c) => c.id);
  useEffect(() => {
    const pruned = pruneSlots(slots, owned);
    if (!sameSlots(pruned, slots)) change(pruned);
  }, [owned.join(',')]);

  // Back from a page: the card is drawn again; its creature's tile is scrolled to and focused.
  useEffect(() => {
    const id = backTo.current;
    if (page !== null || id === null) return;
    backTo.current = null;
    const slot = slotIndexOf(slots, id);
    if (slot === null) return;
    scrollAndFocus(
      document.body
        .querySelector('.dungeon-team')
        ?.querySelector<HTMLElement>(`[data-slot="${String(slot)}"]`) ?? null,
      'auto',
    );
  }, [page]);

  const blocked =
    blockedText(today) ??
    (creatures.length < 3 ? blockedText({ blocked: 'need_creatures', canRun: false }) : null);
  if (blocked !== null) {
    return (
      <>
        <DungeonPrerun today={today} forecast={forecast} />
        <section class="raid-section" aria-labelledby="dungeon-blocked-heading">
          <h3 id="dungeon-blocked-heading">Not today</h3>
          <p role="status">{blocked}</p>
        </section>
      </>
    );
  }

  const team = slots.flatMap((id) => creatures.filter((c) => c.id === id));
  const paged = page === null ? undefined : team.find((c) => c.id === page);
  const closePage = (): void => {
    backTo.current = page;
    setPage(null);
  };
  if (configure !== undefined && paged !== undefined) {
    return (
      <TeamCreaturePage
        creature={paged}
        team={team}
        configure={configure}
        backLabel="Dungeon"
        remove={{
          label: 'Remove from team',
          onAct: () => {
            setPage(null);
            setSelected(null);
            change(unplace(slots, paged.id));
          },
        }}
        onFlip={(target) => {
          setSelected(target.id);
          setPage(target.id);
        }}
        onBack={closePage}
      />
    );
  }
  const shown = selected === null ? undefined : team.find((c) => c.id === selected);

  const complete = isComplete(slots);
  // What the packed treats leave of the Bait, shown once above the boxes (they share one purse).
  const baitLeft = team.reduce((n, c) => n - (treats.has(c.id) ? c.treatCost : 0), bait);
  return (
    <>
      {isRetryOffer(today) && (
        <section class="raid-section dungeon-retry" aria-labelledby="dungeon-retry-heading">
          <h3 id="dungeon-retry-heading">
            <GlossaryTag entry="dungeon">One more try</GlossaryTag>
          </h3>
          <p>{RETRY_TEXT}</p>
          <p>
            <button type="button" onClick={onSeeLast}>
              See your last run
            </button>
          </p>
        </section>
      )}
      <DungeonPrerun today={shownToday} forecast={forecast} progressDepth={own}>
        {pickDepth && (
          <DepthPicker
            own={own}
            picked={depth}
            status={previewStatus}
            onPick={(picked) => {
              setPick(picked >= own ? null : picked);
            }}
          />
        )}
        <DungeonTeam
          creatures={pickable}
          slots={slots}
          disabled={busy}
          onChange={change}
          {...(configure === undefined
            ? {}
            : { selectedId: shown?.id ?? null, onSelect: setSelected })}
        >
          {configure !== undefined && shown !== undefined && (
            <CreatureConfigurator
              key={shown.id}
              creature={shown}
              state={configure.state}
              gear={configure.gear}
              busy={configure.busy}
              parts={today.rules === 2 ? DUNGEON_PARTS_V2 : DUNGEON_PARTS}
              actions={configure.actions}
              buttons={[
                {
                  label: 'Creature page',
                  withCreature: true,
                  onAct: () => {
                    setPage(shown.id);
                  },
                },
                {
                  label: 'Remove from team',
                  danger: true,
                  withCreature: true,
                  onAct: () => {
                    setSelected(null);
                    change(unplace(slots, shown.id));
                  },
                },
              ]}
            />
          )}
          <div class="dungeon-treats">
            {team.length > 0 && (
              <p class="treats-head">
                <span class="treats-title">Treats</span>
                <GlossaryTag entry="treat" look="help" />
                <span class="treats-left">
                  <CountBadge {...baitCount(baitLeft)} label="Bait left" />
                  <span>left</span>
                </span>
              </p>
            )}
            <div class="treat-list">
              {slots.flatMap((id) => {
                const creature = creatures.find((c) => c.id === id);
                if (creature === undefined) return [];
                // A treat is paid up front: the boxes cannot add up to more Bait than the player has.
                const others = [...treats]
                  .filter((t) => t !== creature.id)
                  .reduce((n, t) => n + (creatures.find((c) => c.id === t)?.treatCost ?? 0), 0);
                return [
                  <TreatBox
                    key={creature.id}
                    cost={creature.treatCost}
                    bait={bait - others}
                    checked={treats.has(creature.id)}
                    disabled={busy}
                    who={creatureName(creature)}
                    help={false}
                    {...(today.rules === 2 ? { times: 2 } : {})}
                    listed
                    onChange={(on) => {
                      setTreats((now) => {
                        const next = new Set(now);
                        if (on) next.add(creature.id);
                        else next.delete(creature.id);
                        return next;
                      });
                    }}
                  />,
                ];
              })}
            </div>
          </div>
          <div class="dungeon-enter">
            {error !== null && <Alert level="alert">{error}</Alert>}
            <BagFullNote
              inventory={configure?.gear?.inventory}
              onOpenWorkshop={configure?.onOpenWorkshop}
            />
            <p>
              <button
                type="button"
                class="primary"
                disabled={busy || !complete}
                aria-describedby={complete ? undefined : 'dungeon-enter-note'}
                onClick={() => {
                  // The run deletes the draft on the server, so a save still waiting is not sent.
                  saver.cancel();
                  const going = new Set([...treats].filter((id) => slots.includes(id)));
                  // Only a depth below the player's own is asked for; the own depth is the server's say.
                  if (pickDepth && depth < own) onEnter(slots, going, depth);
                  else onEnter(slots, going);
                }}
              >
                {/* The Dungeon tab's door, in ink on gold as on the active tab. */}
                <Sprite
                  sprite={glyphOrUnknown('door')}
                  scale={2}
                  class="dungeon-enter-door"
                  {...(tabPalette(true) === undefined
                    ? {}
                    : { palette: tabPalette(true) as Readonly<Record<string, string>> })}
                />
                <span>{busy ? 'Entering...' : 'Enter the dungeon'}</span>
              </button>
            </p>
            {!complete && (
              <p id="dungeon-enter-note" class="muted">
                Place 3 creatures to enter.
              </p>
            )}
          </div>
        </DungeonTeam>
      </DungeonPrerun>
    </>
  );
}
