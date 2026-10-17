import { useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { RunTile } from './DungeonRunStrip';
import {
  canSwapIn,
  keepsakeAct,
  moveInOrder,
  restAct,
  rowIds,
  swapAct,
  swapOptions,
} from './dungeon-run';
import {
  CAMP_HOME_BUTTON,
  CAMP_HOME_LINE,
  CAMP_INTRO,
  CAMP_TITLE,
  NO_SWAP_LINE,
  campChoiceLines,
  isPackEmpty,
  packText,
  runHpText,
} from './dungeon-text';
import type {
  DungeonAct,
  DungeonKeepsakeView,
  DungeonPack,
  DungeonRunCreature,
} from './dungeon-types';
import { creatureName } from './game';
import { IN_TEAM_NOTE } from './roster-picker';
import { LiveRegion } from './ui/LiveRegion';
import { RevealShell } from './ui/RevealShell';
import { RosterPicker } from './ui/RosterPicker';

type Step = 'menu' | 'keepsake' | 'out';

interface Props {
  /** The row now, left to right. */
  team: readonly DungeonRunCreature[];
  pack: DungeonPack;
  /** The camp the run stands at: the two keepsakes on offer (stored by the server) and the Rest's share. */
  camp: { offers: readonly DungeonKeepsakeView[]; restBp: number };
  /** Everything the player owns: Swap brings one of those that are not in the row. */
  creatures: readonly Creature[];
  busy: boolean;
  /** The player chose: the act to send (a camp choice with the row's order, or heading home). */
  onAct: (act: DungeonAct) => void;
  /** Open at this step (the workbench shows each one); `initialIncoming` is who is coming in for the `out` step. */
  initialStep?: Step;
  initialIncoming?: string;
}

/**
 * The camp, halfway up the map. Pick one thing: Rest (standing creatures recover part of their HP),
 * take a keepsake (one of two), or Swap (a creature from the collection comes in at full HP, and
 * one of the row goes home; the knocked-out one is easy to see). The row can be reordered for free
 * with the Left and Right buttons, and the order goes along with the choice. Apart from the three,
 * the player may head home and keep the whole pack; that asks once more before it ends the run. The
 * server checks every act again: this only builds them.
 */
export function DungeonCamp({
  team,
  pack,
  camp,
  creatures,
  busy,
  onAct,
  initialStep,
  initialIncoming,
}: Props) {
  const [order, setOrder] = useState(() => rowIds(team));
  const [step, setStep] = useState<Step>(initialStep ?? 'menu');
  const [incoming, setIncoming] = useState<string | null>(initialIncoming ?? null);
  const [picking, setPicking] = useState(false);
  const [confirmHome, setConfirmHome] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const swapButton = useRef<HTMLButtonElement>(null);

  const ordered = order.flatMap((id) => {
    const found = team.find((c) => c.id === id);
    return found === undefined ? [] : [found];
  });
  const lines = campChoiceLines(camp.restBp);
  const swappable = canSwapIn(creatures, order);
  const comesIn = creatures.find((c) => c.id === incoming);

  function move(creature: DungeonRunCreature, by: -1 | 1): void {
    const next = moveInOrder(order, creature.id, by);
    setOrder(next);
    setAnnouncement(
      `${creature.name} moved ${by === -1 ? 'left' : 'right'}, now place ${String(next.indexOf(creature.id) + 1)}.`,
    );
  }

  const row = (
    <ul class="team-row run-row" aria-label="Your team, left to right. You can change the order.">
      {ordered.map((creature, index) => (
        <RunTile key={creature.id} creature={creature}>
          {step === 'menu' && (
            <span class="run-move">
              <button
                type="button"
                class="run-move-button"
                disabled={busy || index === 0}
                aria-label={`Move ${creature.name} left`}
                onClick={() => {
                  move(creature, -1);
                }}
              >
                Left
              </button>
              <button
                type="button"
                class="run-move-button"
                disabled={busy || index === ordered.length - 1}
                aria-label={`Move ${creature.name} right`}
                onClick={() => {
                  move(creature, 1);
                }}
              >
                Right
              </button>
            </span>
          )}
        </RunTile>
      ))}
    </ul>
  );

  return (
    <RevealShell
      id="dungeon-camp-heading"
      title={CAMP_TITLE}
      class="dungeon-camp"
      arrive
      footer={<></>}
    >
      {step === 'menu' && (
        <>
          <p class="muted">{CAMP_INTRO}</p>
          {row}
          <ul class="camp-choices" aria-label="Pick one">
            <li>
              <button
                type="button"
                class="camp-choice"
                disabled={busy}
                onClick={() => {
                  onAct(restAct(order));
                }}
              >
                <strong class="pix">{lines.rest.label}</strong> <span>{lines.rest.line}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                class="camp-choice"
                disabled={busy || camp.offers.length === 0}
                onClick={() => {
                  setStep('keepsake');
                }}
              >
                <strong class="pix">{lines.keepsake.label}</strong>{' '}
                <span>{lines.keepsake.line}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                ref={swapButton}
                class="camp-choice"
                disabled={busy || !swappable}
                onClick={() => {
                  setPicking(true);
                }}
              >
                <strong class="pix">{lines.swap.label}</strong>{' '}
                <span>{swappable ? lines.swap.line : NO_SWAP_LINE}</span>
              </button>
            </li>
          </ul>
          <div class="camp-home">
            {confirmHome ? (
              <div class="confirm" role="group" aria-label="Head home">
                <p>
                  {isPackEmpty(pack)
                    ? 'Head home now? Your pack is empty, but your experience is safe.'
                    : `Head home now? You keep your whole pack: ${packText(pack)}.`}
                </p>
                <p class="button-row">
                  <button
                    type="button"
                    class="danger"
                    disabled={busy}
                    onClick={() => {
                      onAct({ type: 'home' });
                    }}
                  >
                    Yes, head home
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmHome(false);
                    }}
                  >
                    Not yet
                  </button>
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  class="camp-home-button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmHome(true);
                  }}
                >
                  {CAMP_HOME_BUTTON}
                </button>
                <p class="muted">{CAMP_HOME_LINE}</p>
              </>
            )}
          </div>
        </>
      )}

      {step === 'keepsake' && (
        <>
          <h4>Take a keepsake</h4>
          <p class="muted">Choose one of two. It lasts until the run ends.</p>
          <ul class="camp-choices" aria-label="Keepsakes on offer">
            {camp.offers.map((offer) => (
              <li key={offer.id}>
                <button
                  type="button"
                  class="camp-choice"
                  disabled={busy}
                  onClick={() => {
                    onAct(keepsakeAct(order, offer.id));
                  }}
                >
                  <strong class="pix">{offer.name}</strong> <span>{offer.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep('menu');
              }}
            >
              Back
            </button>
          </p>
        </>
      )}

      {step === 'out' && (
        <>
          <h4>Who goes home?</h4>
          <p class="muted">
            {comesIn === undefined ? 'A fresh creature' : creatureName(comesIn)} comes in at full
            HP. Pick the creature that leaves the row.
          </p>
          <ul class="camp-choices" aria-label="Pick who goes home">
            {ordered.map((creature) => (
              <li key={creature.id}>
                <button
                  type="button"
                  class={`camp-choice camp-out${creature.hp <= 0 ? ' ko' : ''}`}
                  disabled={busy || incoming === null}
                  onClick={() => {
                    if (incoming !== null) onAct(swapAct(order, creature.id, incoming));
                  }}
                >
                  <strong class="pix">{creature.name}</strong>{' '}
                  <span>{`Level ${String(creature.level)} · ${runHpText(creature)}`}</span>
                </button>
              </li>
            ))}
          </ul>
          <p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setIncoming(null);
                setStep('menu');
              }}
            >
              Back
            </button>
          </p>
        </>
      )}

      <LiveRegion>{announcement}</LiveRegion>
      {picking && (
        <RosterPicker
          title="Choose who comes in"
          status="Anyone you own that is not in the row"
          options={swapOptions(creatures, order)}
          showEffects={false}
          placedNote={IN_TEAM_NOTE}
          anchor={() => swapButton.current}
          onPick={(id) => {
            setPicking(false);
            setIncoming(id);
            setStep('out');
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </RevealShell>
  );
}
