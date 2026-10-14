import { Tag } from './ui/Tag';
import { GLOSSARY_IDS } from '@creatures/game';
import type { OfferedGoal } from './expedition-types';
import { GameIcon } from './ui/GameIcon';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { goalCards, type GoalCard } from './push-on-view';
import { Sprite } from './sprites/Sprite';

/** One goal as a card: its name, its risk in words and a mark, the extra hours, what it can bring and what failing costs. */
function GoalCardView({
  card,
  busy,
  onPick,
}: {
  card: GoalCard;
  busy: boolean;
  onPick: (goalId: string) => void;
}) {
  const risky = card.risk === 'risky';
  const very = card.riskWord === 'Very risky';
  return (
    <li class={`goal-card ${risky ? 'risky' : 'safe'}${very ? ' very' : ''}`}>
      <p class="goal-flag">
        <Sprite sprite={glyphOrUnknown(very ? 'skull' : risky ? 'warning' : 'check')} scale={2} />
        <Tag entry={GLOSSARY_IDS.goal(card.risk)}>{card.riskWord}</Tag>
      </p>
      <h5 class="pix goal-name">{card.name}</h5>
      <p class="muted goal-flavor">{card.flavor}</p>
      <p class="goal-odds">
        {!risky && <span>Always works</span>}
        <span class="goal-extra">
          <Sprite sprite={glyphOrUnknown('clock')} scale={2} /> {card.extra} longer
        </span>
      </p>
      <p class="label">If it works</p>
      <ul class="goal-rewards">
        {card.rewards.map((reward) => (
          <li key={reward.key}>
            <GameIcon icon={reward.icon} scale={3} />
            <span>{reward.text}</span>
          </li>
        ))}
      </ul>
      {card.failure !== null && (
        <p class="goal-failure" role="note">
          <Sprite sprite={glyphOrUnknown('skull')} scale={2} /> {card.failure}
        </p>
      )}
      <button
        type="button"
        class={risky ? 'danger' : 'primary'}
        disabled={busy}
        aria-label={`Push on: ${card.name}, ${card.riskWord.toLowerCase()}`}
        onClick={() => {
          onPick(card.id);
        }}
      >
        Push on
      </button>
    </li>
  );
}

/**
 * The end-of-trip choice: the trip is over and a goal is on offer. Each goal is a card with its risk in
 * words (Safe, Risky, Very risky), the extra hours and what it can bring home, and a "Push on" button;
 * the risky ones are flagged with a mark (a warning, a skull for the very risky), a red frame and what
 * failing costs. No odds are shown. "Come home" claims the trip as usual.
 */
export function PushOnChoice({
  goals,
  busy,
  onPick,
  onHome,
}: {
  goals: readonly OfferedGoal[];
  busy: boolean;
  onPick: (goalId: string) => void;
  onHome: () => void;
}) {
  const cards = goalCards(goals);
  return (
    <div class="push-on" role="group" aria-label="Push on or come home">
      <p class="pix push-on-title">
        <Sprite sprite={glyphOrUnknown('fork')} scale={3} /> The trip is over. Push on, or come
        home? <GlossaryTag entry="push-on" look="help" />
      </p>
      <ul class="goal-cards">
        {cards.map((card) => (
          <GoalCardView key={card.id} card={card} busy={busy} onPick={onPick} />
        ))}
      </ul>
      <button type="button" class="primary home-button" disabled={busy} onClick={onHome}>
        Come home
      </button>
    </div>
  );
}
