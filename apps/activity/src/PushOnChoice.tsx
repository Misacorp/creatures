import { GLOSSARY_IDS } from '@creatures/game';
import type { OfferedGoal } from './expedition-types';
import { ExpIcon } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { goalCards, type GoalCard } from './push-on-view';
import { Sprite } from './sprites/Sprite';

/** One goal as a card: its name, the exact odds, the extra hours, what it can bring and what failing costs. */
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
  return (
    <li class={`goal-card ${risky ? 'risky' : 'safe'}`}>
      <p class="goal-flag">
        <Sprite sprite={glyphOrUnknown(risky ? 'warning' : 'check')} scale={2} />
        <GlossaryTag entry={GLOSSARY_IDS.goal(card.risk)} look="chip" class="tag">
          {risky ? 'Risky' : 'Safe'}
        </GlossaryTag>
      </p>
      <h5 class="pix goal-name">{card.name}</h5>
      <p class="muted goal-flavor">{card.flavor}</p>
      <p class="goal-odds">
        <strong class="pix goal-odds-number">{card.odds}</strong>{' '}
        <span>{risky ? 'chance it works' : 'it always works'}</span>
        <span class="goal-extra">
          <Sprite sprite={glyphOrUnknown('clock')} scale={2} /> {card.extra} longer
        </span>
      </p>
      <p class="label">If it works</p>
      <ul class="goal-rewards">
        {card.rewards.map((reward) => (
          <li key={reward.key}>
            <ExpIcon icon={reward.icon} scale={3} />
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
        aria-label={`Push on: ${card.name}, ${card.odds}${risky ? ' chance, risky' : ', safe'}`}
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
 * The end-of-trip choice: the trip is over and a goal is on offer. Each goal is a card with the exact
 * odds, the extra hours and what it can bring home, and a "Push on" button; the risky ones are flagged
 * with a warning mark, a red frame and what failing costs. "Come home" claims the trip as usual.
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
