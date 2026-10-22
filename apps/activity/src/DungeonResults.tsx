import { useState } from 'preact/hooks';
import { LandmarkChip } from './ui/Tag';
import { LootList } from './LootList';
import { DungeonTreasure } from './DungeonTreasure';
import { glyphOrUnknown } from './glyphs';
import { baitCount, essenceCount, partCountItems, supplyCounts } from './count-items';
import { CountBadgeList, type CountItem } from './ui/CountBadge';
import { RevealLater, RevealShell, useRevealSequence } from './ui/RevealShell';
import { RewardSummary } from './ui/RewardSummary';
import { ToggleButton } from './ui/ToggleButton';
import {
  droppedSupplies,
  NO_REWARDS_HINT,
  NO_REWARDS_LINE,
  noRewards,
  rewardLoot,
  experienceRecap,
  roomStrip,
  streakBonus,
  teamBreakdown,
  type RecapEntry,
  type StripRoom,
  type TeamEntry,
} from './dungeon-playback';
import { bossArt } from './art';
import { resultSummary, resultTitle, resultTone } from './dungeon-text';
import { roomLog, type RoomLogRow } from './dungeon-route-rooms';
import { routeRun } from './dungeon-history';
import { DungeonMap } from './DungeonMap';
import { RunKeepsakes, TeamFace } from './DungeonRunStrip';
import { DungeonNext } from './DungeonNext';
import type { DungeonRunSummary, DungeonToday } from './dungeon-types';
import { creatureInfoOf } from './creature-info';
import { Sprite } from './sprites/Sprite';
import { ExperienceGainRow } from './ExperienceGainRow';
import { XpList } from './ui/XpGain';
import { Alert } from './ui/Alert';

/** A room panel's picture is 64 px (a foe) or 72 px (a floor boss), so three fit a 390 px phone. */
const PANEL_SCALE = { foe: 4, boss: 3 } as const;

interface Props {
  run: DungeonRunSummary;
  /** Today's state: the streak and when the day resets. */
  today: DungeonToday;
  /** The server's clock minus the local one, for the countdown. */
  offset: number;
  /** True when a run can still be started today (the first-day retry). */
  canRetry: boolean;
  busy: boolean;
  error: string | null;
  onWatch: () => void;
  onRetry: () => void;
  /** Which view of the route opens first. Default: the map. */
  initialView?: RouteView | undefined;
}

/**
 * The end of a run: a short title (green for a success, red for a defeat), one line that sums the run up
 * in plain words, the rewards (a badge for each kind earned: the Essence counts up, and the gear then pops
 * in), the route (the map, or the list of rooms it went through), the team with each creature's experience
 * and the keepsakes the run held. "Watch again" plays the run once more from the server's stored events.
 * All names are drawn as text.
 */
export function DungeonResults({
  run,
  today,
  offset,
  canRetry,
  busy,
  error,
  onWatch,
  onRetry,
  initialView,
}: Props) {
  const { rewards } = run;
  const empty = noRewards(rewards);
  const { frame, done } = useRevealSequence(rewards.essence);
  const loot = rewardLoot(rewards);
  const bonus = streakBonus(rewards);
  const counts: CountItem[] = [
    ...(rewards.bait > 0 ? [baitCount(rewards.bait, { entry: true })] : []),
    ...(rewards.essence > 0
      ? [essenceCount(done ? rewards.essence : frame.count, { entry: true })]
      : []),
    ...partCountItems(rewards.parts),
    ...supplyCounts(droppedSupplies(rewards)),
  ];
  return (
    <RevealShell
      id="dungeon-result-heading"
      title={<span class={`result-title ${resultTone(run)}`}>{resultTitle(run)}</span>}
      class="dungeon-result"
      footer={
        <p class="button-row dungeon-result-buttons">
          <button type="button" disabled={busy} onClick={onWatch}>
            Watch again
          </button>
          {canRetry && (
            <button type="button" class="primary" disabled={busy} onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      }
    >
      <p role="status" class="result-summary">
        {resultSummary(run)}
        {run.landmark && (
          <>
            {' '}
            <LandmarkChip />
          </>
        )}
      </p>

      <h4>Rewards</h4>
      {empty ? (
        <div class="no-rewards">
          <span class="no-rewards-art" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('sad-face')} scale={6} />
          </span>
          <p class="no-rewards-text">
            <strong>{NO_REWARDS_LINE}</strong>
            <span class="muted">{NO_REWARDS_HINT}</span>
          </p>
        </div>
      ) : (
        <RewardSummary
          source={rewards}
          prefix="Rewards"
          countsLabel="Bait, Essence, parts and supplies"
          counts={counts}
          pile={false}
        >
          <RevealLater done={done}>
            <LootList loot={loot} counted label="Loot from the dungeon" />
          </RevealLater>
        </RewardSummary>
      )}
      {rewards.treasureLost !== undefined && (
        <section class="treasure-lost" aria-labelledby="treasure-lost-heading">
          <h4 id="treasure-lost-heading">Treasure lost</h4>
          <p class="muted">The treasure was lost with the run: a defeat keeps nothing of it.</p>
          <DungeonTreasure treasure={rewards.treasureLost} label="The lost treasure" />
        </section>
      )}
      {bonus !== null && (
        <RevealLater done={done}>
          <section class="streak-bonus" aria-labelledby="streak-bonus-heading">
            <h4 id="streak-bonus-heading">
              <Sprite sprite={glyphOrUnknown('gift')} scale={2} />
              {bonus.title}
            </h4>
            {bonus.counts.length === 0 ? (
              <p class="muted">Nothing this time.</p>
            ) : (
              <CountBadgeList
                items={bonus.counts}
                label={bonus.title}
                class="reward-badges streak-bonus-badges"
              />
            )}
          </section>
        </RevealLater>
      )}

      <RouteSection run={run} initialView={initialView ?? 'map'} />
      <TeamBreakdown team={teamBreakdown(run)} recap={experienceRecap(run)} />
      {run.keepsakes !== undefined && <RunKeepsakes keepsakes={run.keepsakes} />}
      <DungeonNext today={today} offset={offset} />

      {error !== null && <Alert level="alert">{error}</Alert>}
    </RevealShell>
  );
}

type RouteView = 'map' | 'rooms';

/**
 * How the run went, as one of two views the player swaps between: the map with the route it walked (the
 * path in gold, the rest dimmed; a tap on a room says what happened there), which opens first, or the rooms it
 * went through, one panel each, in order. A run with no route (an older one) has only the strip of its
 * fights, with no toggle.
 */
function RouteSection({ run, initialView }: { run: DungeonRunSummary; initialView: RouteView }) {
  const [view, setView] = useState<RouteView>(initialView);
  const route = routeRun(run);
  const path = run.outcome !== undefined;
  const rooms = roomLog(run);
  if (route === null || rooms === null) {
    return (
      <>
        <h4>{path ? 'Fights' : 'Rooms'}</h4>
        <RoomStrip rooms={roomStrip(run)} path={path} />
      </>
    );
  }
  return (
    <>
      <div class="route-head">
        <h4>Route</h4>
        <div class="route-toggle" role="group" aria-label="Show the route as">
          <ToggleButton
            pressed={view === 'map'}
            onToggle={() => {
              setView('map');
            }}
          >
            Map
          </ToggleButton>
          <ToggleButton
            pressed={view === 'rooms'}
            onToggle={() => {
              setView('rooms');
            }}
          >
            Rooms
          </ToggleButton>
        </div>
      </div>
      {view === 'map' ? (
        <div class="dungeon-result-map">
          <DungeonMap
            map={route.map}
            undercroft={route.undercroft}
            state={route.run}
            landmark={run.landmark}
            depth={run.depth}
          />
        </div>
      ) : (
        <RoomLog rows={rooms} />
      )}
    </>
  );
}

/**
 * Every room the run went through, as panels left to right in the order it went: a fight shows its foe,
 * any other room (camp, mystery room, cache, door) its picture and a short line of what happened. A fight won
 * has a green CLEARED stamp and the fight the run fell in shows DEFEATED in red; a room that is not a fight
 * has no stamp (nothing was cleared there). The states are classes (`cleared`, `defeat`) that the stylesheet
 * turns into colours; the words say the same.
 */
function RoomLog({ rows }: { rows: readonly RoomLogRow[] }) {
  return (
    <ol class="room-strip path room-log" aria-label="Rooms, first to last">
      {rows.map((row) => (
        <li
          key={row.node}
          class={`room-panel ${row.state}${row.foe === null ? ' other' : ''}${row.elite ? ' elite' : ''}${row.level > 0 ? ' undercroft' : ''}${row.epic ? ' epic' : ''}`}
          aria-label={row.spoken}
        >
          <span class="rp-title pix" aria-hidden="true">
            <span>{row.where}</span>
            <span class="rp-what">{row.what}</span>
          </span>
          <span class="rp-art" aria-hidden="true">
            <Sprite
              sprite={
                row.foe === null ? glyphOrUnknown(row.glyph ?? '') : bossArt(row.foe.id).sprite
              }
              scale={row.foe === null ? 6 : PANEL_SCALE[row.foe.boss ? 'boss' : 'foe']}
            />
            {row.banner !== null && <span class="rp-banner pix">{row.banner}</span>}
          </span>
          <span class="rp-name" aria-hidden="true">
            {row.name}
          </span>
          {row.foe !== null && (
            <span class="rp-mod muted" aria-hidden="true">
              {row.foe.modifierName}
            </span>
          )}
          {row.foe?.hpLeft != null && (
            <span class="rp-hp muted" aria-hidden="true">
              {row.foe.hpLeft}
            </span>
          )}
          {row.note !== null && (
            <span class="rp-note muted" aria-hidden="true">
              {row.note}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * The rooms of an older run (from before the map) as a strip of panels, left to right like a comic: each
 * shows its foe's sprite. A cleared room is muted with a green CLEARED banner across it, the room that was
 * lost shows DEFEATED in red (with the foe's HP left), and a room never reached is dim and locked. The
 * states are classes (`cleared`, `defeat`, `locked`) that the stylesheet turns into filters; the words say
 * the same, so colour is never the only cue.
 */
function RoomStrip({ rooms, path }: { rooms: readonly StripRoom[]; path: boolean }) {
  return (
    <>
      <ol class={path ? 'room-strip path' : 'room-strip'} aria-label="Rooms, first to last">
        {rooms.map((room) => {
          const art = bossArt(room.foeId);
          return (
            <li
              key={room.index}
              class={`room-panel ${room.state}${room.elite ? ' elite' : ''}${room.level > 0 ? ' undercroft' : ''}${room.epic ? ' epic' : ''}`}
              aria-label={room.spoken}
            >
              <span class="rp-title pix" aria-hidden="true">
                {room.title}
              </span>
              <span class="rp-art" aria-hidden="true">
                <Sprite sprite={art.sprite} scale={PANEL_SCALE[room.kind]} />
                <span class="rp-banner pix">{room.banner}</span>
              </span>
              <span class="rp-name" aria-hidden="true">
                {room.foeName}
              </span>
              <span class="rp-mod muted" aria-hidden="true">
                {room.modifierName}
              </span>
              {room.foeHp !== null && (
                <span class="rp-hp muted" aria-hidden="true">
                  {room.foeHp}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * The team in its fighting order, one row, left to right: each sprite with the HP it ended with under it
 * ("340 / 391 HP"; a knocked-out creature is grey with a skull and "0 / 391 HP" in red). Under the row,
 * one list, the experience recap: a row for every creature the run paid (one sent home at a camp too, tagged
 * "Went home") as the same row every result screen shows (`ExperienceGainRow`: its name, the level change and
 * "Level up!" when the run levelled it, the bar counting up, the "+N" and the multiplier with its breakdown),
 * (a third of a phone is too narrow for it under each sprite). Tapping a sprite opens the small-creature popover with its role and element.
 */
function TeamBreakdown({
  team,
  recap,
}: {
  team: readonly TeamEntry[];
  recap: readonly RecapEntry[];
}) {
  return (
    <>
      <h4>Your team</h4>
      <ul class="team-row" aria-label="Your team after the run, left to right">
        {team.map((m) => (
          <li key={m.id} class={m.knockedOut ? 'team-member ko' : 'team-member'}>
            <TeamFace
              id={m.id}
              info={creatureInfoOf({ ...m, species: m.speciesId })}
              speciesId={m.speciesId}
              name={m.name}
              ko={m.knockedOut}
              label={`${m.spoken} Shows its role and element.`}
            />
            <span class="tm-hp pix">{m.hp}</span>
            {m.exp === null && (
              <span class="tm-level">
                <span class="lvl-tag pix">Lv {m.level}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {recap.length > 0 && (
        <XpList label="Experience after the run" caption class="team-xp">
          {recap.map((m) => (
            <ExperienceGainRow
              key={m.id}
              who={{ name: m.name, species: m.speciesId }}
              gain={m.exp}
              home={m.wentHome}
            />
          ))}
        </XpList>
      )}
    </>
  );
}
