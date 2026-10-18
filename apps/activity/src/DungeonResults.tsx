import { useState } from 'preact/hooks';
import { LandmarkChip } from './ui/Tag';
import { GlossaryTag } from './Glossary';
import { LootList } from './GearLoot';
import { glyphOrUnknown } from './glyphs';
import { partCountItems } from './GearArt';
import type { CountItem } from './ui/CountBadge';
import { OutcomeBadge, RevealLater, RevealShell, useRevealSequence } from './ui/RevealShell';
import { RewardSummary } from './ui/RewardSummary';
import { GameIcon } from './ui/GameIcon';
import { ToggleButton } from './ui/ToggleButton';
import {
  droppedSupplies,
  NO_REWARDS_HINT,
  NO_REWARDS_LINE,
  noRewards,
  rewardLoot,
  roomStrip,
  runSentence,
  streakBonusText,
  streakLoot,
  teamBreakdown,
  type StripRoom,
  type TeamEntry,
} from './dungeon-playback';
import { bossArt } from './art';
import { depthChangeText, resultHeadline } from './dungeon-text';
import { packKindLabel, packKinds, packLost } from './dungeon-run';
import { routeRun } from './dungeon-history';
import { DungeonMap } from './DungeonMap';
import { RunKeepsakes } from './DungeonRunStrip';
import { DungeonNext } from './DungeonNext';
import type { DungeonPack, DungeonRunSummary, DungeonToday } from './dungeon-types';
import { creatureInfoOf } from './creature-info';
import { SmallCreature } from './SmallCreature';
import { supplyKindOf } from './trip-view';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

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
  /** Which view of the route opens first (the workbench shows the map so). Default: the fights. */
  initialView?: 'fights' | 'map' | undefined;
}

/**
 * The end of a run: how it ended (cleared, home with the pack, or defeated with half of it), what it
 * did to the depth, the rewards first (a small pile with
 * one icon for each kind earned, and the counts right beside it: the Essence counts up, and the gear
 * then pops in), then, for a path run, what the pack held and the keepsakes, then the rooms it played
 * and the team. "Watch again" plays the run once more from the
 * server's stored events. All names are drawn as text.
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
  const bonus = streakLoot(rewards);
  const counts: CountItem[] = [
    ...(rewards.bait > 0
      ? [
          {
            key: 'bait',
            icon: { kind: 'glyph', id: 'bait' } as const,
            amount: rewards.bait,
            label: 'Bait',
            entry: 'bait',
          },
        ]
      : []),
    ...(rewards.essence > 0
      ? [
          {
            key: 'essence',
            icon: { kind: 'glyph', id: 'gem' } as const,
            amount: done ? rewards.essence : frame.count,
            label: 'Essence',
            entry: 'essence',
          },
        ]
      : []),
    ...partCountItems(rewards.parts),
    ...droppedSupplies(rewards).map((s) => ({
      key: s.id,
      icon: { kind: 'supply', id: supplyKindOf(s.id) ?? 'unknown' } as const,
      amount: s.amount,
      name: s.name,
    })),
  ];
  return (
    <RevealShell
      id="dungeon-result-heading"
      title={resultHeadline(run)}
      badge={run.outcome === undefined ? <OutcomeBadge cleared={run.cleared} /> : undefined}
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
      <p role="status">
        <span class="visually-hidden">{runSentence(run)} </span>
        {run.outcome === 'cleared' ? null : depthChangeText(run)}
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
        >
          <RevealLater done={done}>
            <LootList loot={loot} counted label="Loot from the dungeon" />
            {bonus !== null && <LootList loot={bonus} label="Streak bonus" />}
            {streakBonusText(rewards) !== null && (
              <p class="muted">
                <GlossaryTag entry="streak">{streakBonusText(rewards)}</GlossaryTag>
              </p>
            )}
          </RevealLater>
        </RewardSummary>
      )}

      {run.pack !== undefined && <PackLine found={run.pack.found} kept={run.pack.kept} />}
      {run.keepsakes !== undefined && <RunKeepsakes keepsakes={run.keepsakes} />}

      <RouteSection run={run} initialView={initialView ?? 'fights'} />
      <TeamBreakdown team={teamBreakdown(run)} />
      <DungeonNext today={today} offset={offset} />

      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
    </RevealShell>
  );
}

/**
 * The pack on one line: "Pack: all kept" and the kinds as icons with numbers. After a defeat it says
 * "half kept" and each kind that lost something shows what was found struck through and dim, then what
 * came home. Nothing when the pack was empty (the headline says so).
 */
function PackLine({ found, kept }: { found: DungeonPack; kept: DungeonPack }) {
  const kinds = packKinds(found, kept);
  if (kinds.length === 0) return null;
  const lost = packLost(found, kept);
  return (
    <div class="dungeon-pack-line">
      <span>
        <GlossaryTag entry="dungeon-pack">Pack</GlossaryTag>:
      </span>
      <span class="pack-verdict">{lost ? 'half kept' : 'all kept'}</span>
      <ul class="pack-kinds plain-list" aria-label={lost ? 'Pack, half kept' : 'Pack, all kept'}>
        {kinds.map((kind) => (
          <li key={kind.key}>
            <span class="part-count" role="img" aria-label={packKindLabel(kind)}>
              <GameIcon icon={kind.icon} scale={2} />
              {kind.kept !== kind.found && (
                <s class="part-amount pix pack-was" aria-hidden="true">
                  {kind.found}
                </s>
              )}
              <span class="part-amount pix" aria-hidden="true">
                {kind.kept}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RouteView = 'fights' | 'map';

/**
 * How the run went, as one of two views the player swaps between: the fights it played as a strip of
 * panels, or the map with the route it walked (the path in gold, the rest dimmed; a tap on a room
 * says what happened there). A run with no route (an older one) has only the strip, with no toggle.
 */
function RouteSection({ run, initialView }: { run: DungeonRunSummary; initialView: RouteView }) {
  const [view, setView] = useState<RouteView>(initialView);
  const route = routeRun(run);
  const path = run.outcome !== undefined;
  const strip = <RoomStrip rooms={roomStrip(run)} path={path} />;
  if (route === null) {
    return (
      <>
        <h4>{path ? 'Fights' : 'Rooms'}</h4>
        {strip}
      </>
    );
  }
  return (
    <>
      <div class="route-head">
        <h4>Route</h4>
        <div class="route-toggle" role="group" aria-label="Show the route as">
          <ToggleButton
            pressed={view === 'fights'}
            onToggle={() => {
              setView('fights');
            }}
          >
            Fights
          </ToggleButton>
          <ToggleButton
            pressed={view === 'map'}
            onToggle={() => {
              setView('map');
            }}
          >
            Map
          </ToggleButton>
        </div>
      </div>
      {view === 'fights' ? (
        strip
      ) : (
        <div class="dungeon-result-map">
          <DungeonMap
            map={route.map}
            undercroft={route.undercroft}
            state={route.run}
            landmark={run.landmark}
            depth={run.depth}
          />
        </div>
      )}
    </>
  );
}

/**
 * The rooms of the run as a strip of panels, left to right like a comic: each shows its foe's
 * sprite. A cleared room is muted with a green CLEARED banner across it, the room that was lost
 * shows DEFEAT in red (with the foe's HP left), and a room never reached is dim and locked. The
 * states are classes (`cleared`, `defeat`, `locked`) that the stylesheet turns into filters; the
 * words say the same, so colour is never the only cue.
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
 * The team in its fighting order, one row, left to right: each sprite with the HP it ended with
 * under it ("340 / 391 HP"; a knocked-out creature is grey with a skull and "0 / 391 HP" in red).
 * Tapping a sprite opens the small-creature popover with its role and element.
 */
function TeamBreakdown({ team }: { team: readonly TeamEntry[] }) {
  return (
    <>
      <h4>Your team</h4>
      <ul class="team-row" aria-label="Your team after the run, left to right">
        {team.map((m) => (
          <li key={m.id} class={m.knockedOut ? 'team-member ko' : 'team-member'}>
            <SmallCreature
              id={m.id}
              info={creatureInfoOf({ ...m, species: m.speciesId })}
              class="tm-face"
              label={`${m.spoken} Shows its role and element.`}
            >
              <span class="tm-art">
                <Sprite sprite={creatureSpriteOrFallback(m.speciesId)} scale={4} />
                {m.knockedOut && (
                  <span class="ko-mark">
                    <Sprite sprite={glyphOrUnknown('skull')} scale={2} />
                  </span>
                )}
              </span>
              <span class="tm-name pix">{m.name}</span>
            </SmallCreature>
            <span class="tm-hp pix">{m.hp}</span>
            {m.experience !== null && <span class="tm-exp muted">{m.experience}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
