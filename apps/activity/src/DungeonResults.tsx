import { GlossaryTag } from './Glossary';
import { LootList } from './GearLoot';
import { glyphOrUnknown } from './glyphs';
import { usePrefersReducedMotion } from './hooks';
import { RevealStage, useRevealFrame } from './Reveal';
import {
  foeHpLine,
  noRewards,
  rewardLoot,
  roomOutcome,
  runSentence,
  streakBonusText,
  streakLoot,
} from './dungeon-playback';
import { depthChangeText, resultHeadline } from './dungeon-text';
import type { DungeonRunSummary } from './dungeon-types';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { capitalize } from './game';

const OUTCOME_LABEL = { cleared: 'Cleared', lost: 'Lost', 'not reached': 'Not reached' } as const;

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
 * The end of a run: cleared or not, what it did to the depth, the three rooms, and the rewards. An
 * orb opens first (the finale's reveal) and the gear then pops in; Bait and Essence are icons with
 * numbers and parts use the Workshop's part icons. "Watch again" plays the run once more from the
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

      <ol class="dungeon-rooms" aria-label="Rooms">
        {run.rooms.map((room) => {
          const outcome = roomOutcome(room);
          return (
            <li
              key={room.index}
              class={`dungeon-room ${outcome === 'not reached' ? 'idle' : outcome}`}
            >
              <span class="pix">
                {room.kind === 'boss' ? 'Room boss' : `Room ${String(room.index + 1)}`}
              </span>
              <span class="dungeon-room-foe">
                {room.foe.name} <span class="muted">({room.modifier.name})</span>
              </span>
              <span
                class={
                  outcome === 'cleared' ? 'badge good' : outcome === 'lost' ? 'badge bad' : 'badge'
                }
              >
                {OUTCOME_LABEL[outcome]}
              </span>
              {foeHpLine(room) !== null && room.cleared === false && (
                <span class="muted">{foeHpLine(room)}</span>
              )}
            </li>
          );
        })}
      </ol>

      <h4>Your team</h4>
      <ul class="dungeon-team-end" aria-label="Your team after the run">
        {run.team.map((m) => (
          <li key={m.id}>
            <span class="chip-name">{m.name}</span>{' '}
            <span class="muted">
              {m.hpEnd <= 0 ? 'knocked out' : `${String(m.hpEnd)} of ${String(m.hpMax)} HP left`}
            </span>
            <span class="tags">
              <ElementChip element={m.element} role={capitalize(m.role)} />
            </span>
          </li>
        ))}
      </ul>

      <h4>Rewards</h4>
      {empty ? (
        <p class="muted">Nothing this time. Clear a room to earn Bait, Essence and parts.</p>
      ) : (
        <>
          <RevealStage frame={frame} />
          <ul class="loot-parts dungeon-rewards" aria-label="Bait and Essence">
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
          </ul>
          <div class={done ? 'reveal-gear-box done' : 'reveal-gear-box'}>
            <LootList loot={loot} label="Loot from the dungeon" />
            {bonus !== null && <LootList loot={bonus} label="Streak bonus" />}
            {streakBonusText(rewards) !== null && (
              <p class="muted">
                <GlossaryTag entry="streak">{streakBonusText(rewards)}</GlossaryTag>
              </p>
            )}
          </div>
        </>
      )}

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
