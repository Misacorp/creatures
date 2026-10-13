import { GlossaryTag } from './Glossary';
import { LootList } from './GearLoot';
import { glyphOrUnknown } from './glyphs';
import { usePrefersReducedMotion } from './hooks';
import { useRevealFrame } from './Reveal';
import { PartCount } from './GearArt';
import { RewardPile } from './RewardPile';
import { rewardPileItems } from './reward-pile';
import { partName, partsEntries } from './gear-view';
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
import type { DungeonRunSummary } from './dungeon-types';
import { SmallCreature } from './SmallCreature';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** The pile in words: "Rewards: Scrap, Essence, Bait". */
function pileLabel(rewards: DungeonRunSummary['rewards']): string {
  const kinds = rewardPileItems(rewards).map((i) =>
    i.icon.kind === 'part'
      ? partName(i.icon.part)
      : i.icon.kind === 'gear'
        ? 'Gear'
        : i.key === 'essence'
          ? 'Essence'
          : 'Bait',
  );
  return `Rewards: ${kinds.join(', ')}`;
}

/** A room panel's picture is 64 px (a foe) or 72 px (a room boss), so three fit a 390 px phone. */
const PANEL_SCALE = { foe: 4, boss: 3 } as const;

/** An icon with a number and a word, for Bait and Essence (parts use the Workshop's own icons). */
function RewardCount({
  glyph,
  amount,
  label,
  entry,
}: {
  glyph: string;
  amount: number;
  label: string;
  entry: string;
}) {
  return (
    <GlossaryTag entry={entry} look="chip" class="part-count" label={`${label}: ${String(amount)}`}>
      <Sprite sprite={glyphOrUnknown(glyph)} scale={2} />
      <span class="part-amount pix">{amount}</span>
    </GlossaryTag>
  );
}

interface Props {
  run: DungeonRunSummary;
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
export function DungeonResults({ run, canRetry, busy, error, onWatch, onRetry }: Props) {
  const reduced = usePrefersReducedMotion();
  const { rewards } = run;
  const empty = noRewards(rewards);
  const frame = useRevealFrame(rewards.essence, reduced);
  const done = frame.phase === 'done';
  const loot = rewardLoot(rewards);
  const bonus = streakLoot(rewards);
  return (
    <section class="reveal-card dungeon-result" aria-labelledby="dungeon-result-heading">
      <h3 id="dungeon-result-heading">
        {resultHeadline(run)}{' '}
        <span class={run.cleared ? 'badge good' : 'badge bad'}>
          {run.cleared ? 'Cleared' : 'Not cleared'}
        </span>
      </h3>
      <p role="status">
        <span class="visually-hidden">{runSentence(run)} </span>
        {depthChangeText(run)}
        {run.landmark && (
          <>
            {' '}
            <GlossaryTag entry="landmark" look="chip" class="chip dungeon-landmark-chip">
              <Sprite sprite={glyphOrUnknown('flag')} scale={2} />
              <span class="chip-text">Landmark</span>
            </GlossaryTag>
          </>
        )}
      </p>

      <h4>Rewards</h4>
      {empty ? (
        <p class="muted">Nothing this time. Clear a room to earn Bait, Essence and parts.</p>
      ) : (
        <>
          <div class="reward-row">
            <RewardPile source={rewards} label={pileLabel(rewards)} />
            <ul class="reward-badges" aria-label="Bait, Essence and parts">
              {rewards.bait > 0 && (
                <li>
                  <RewardCount glyph="bait" amount={rewards.bait} label="Bait" entry="bait" />
                </li>
              )}
              {rewards.essence > 0 && (
                <li>
                  <RewardCount
                    glyph="gem"
                    amount={done ? rewards.essence : frame.count}
                    label="Essence"
                    entry="essence"
                  />
                </li>
              )}
              {partsEntries(rewards.parts).map((p) => (
                <li key={p.kind}>
                  <PartCount kind={p.kind} amount={p.amount} />
                </li>
              ))}
            </ul>
          </div>
          <div class={done ? 'reveal-gear-box done' : 'reveal-gear-box'}>
            <LootList loot={{ ...loot, parts: {} }} label="Loot from the dungeon" />
            {bonus !== null && <LootList loot={bonus} label="Streak bonus" />}
            {streakBonusText(rewards) !== null && (
              <p class="muted">
                <GlossaryTag entry="streak">{streakBonusText(rewards)}</GlossaryTag>
              </p>
            )}
          </div>
        </>
      )}

      <RoomStrip rooms={roomStrip(run)} />
      <TeamBreakdown team={teamBreakdown(run)} />

      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
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
    </section>
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
              info={{
                name: m.name,
                species: m.speciesId,
                level: m.level,
                element: m.element,
                role: m.role,
              }}
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
