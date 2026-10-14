import { LandmarkChip } from './ui/Tag';
import { GlossaryTag } from './Glossary';
import { LootList } from './GearLoot';
import { glyphOrUnknown } from './glyphs';
import { partCountItems } from './GearArt';
import type { CountItem } from './ui/CountBadge';
import { OutcomeBadge, RevealLater, RevealShell, useRevealSequence } from './ui/RevealShell';
import { RewardSummary } from './ui/RewardSummary';
import {
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
import { DungeonNext } from './DungeonNext';
import type { DungeonRunSummary, DungeonToday } from './dungeon-types';
import { creatureInfoOf } from './creature-popover';
import { SmallCreature } from './SmallCreature';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** A room panel's picture is 64 px (a foe) or 72 px (a room boss), so three fit a 390 px phone. */
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
}

/**
 * The end of a run: cleared or not, what it did to the depth, the rewards first (a small pile with
 * one icon for each kind earned, and the counts right beside it: the Essence counts up, and the gear
 * then pops in), then the three rooms and the team. "Watch again" plays the run once more from the
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
  ];
  return (
    <RevealShell
      id="dungeon-result-heading"
      title={resultHeadline(run)}
      badge={<OutcomeBadge cleared={run.cleared} />}
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
        {depthChangeText(run)}
        {run.landmark && (
          <>
            {' '}
            <LandmarkChip />
          </>
        )}
      </p>

      <h4>Rewards</h4>
      {empty ? (
        <p class="muted">Nothing this time. Clear a room to earn Bait, Essence and parts.</p>
      ) : (
        <RewardSummary
          source={rewards}
          prefix="Rewards"
          countsLabel="Bait, Essence and parts"
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

      <RoomStrip rooms={roomStrip(run)} />
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
 * The rooms of the run as a strip of panels, left to right like a comic: each shows its foe's
 * sprite. A cleared room is muted with a green CLEARED banner across it, the room that was lost
 * shows DEFEAT in red (with the foe's HP left), and a room never reached is dim and locked. The
 * states are classes (`cleared`, `defeat`, `locked`) that the stylesheet turns into filters; the
 * words say the same, so colour is never the only cue.
 */
function RoomStrip({ rooms }: { rooms: readonly StripRoom[] }) {
  return (
    <>
      <h4>Rooms</h4>
      <ol class="room-strip" aria-label="Rooms, first to last">
        {rooms.map((room) => {
          const art = bossArt(room.foeId);
          return (
            <li key={room.index} class={`room-panel ${room.state}`} aria-label={room.spoken}>
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
          </li>
        ))}
      </ul>
    </>
  );
}
