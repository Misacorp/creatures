import { useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { CampRow } from './CampRow';
import {
  campCreatureOf,
  canSwapIn,
  keepsakeAct,
  packBadges,
  orderAfterSwap,
  restAct,
  rowIds,
  swapAct,
  swapOptions,
  type CampRowCreature,
} from './dungeon-run';
import {
  CAMP_HOME_BUTTON,
  CAMP_ARRANGE_LINE,
  CAMP_INTRO,
  CAMP_TITLE,
  NO_SWAP_LINE,
  campChoiceLines,
  isPackEmpty,
  runHpText,
} from './dungeon-text';
import type {
  DungeonAct,
  DungeonKeepsakeView,
  DungeonPack,
  DungeonRunCreature,
} from './dungeon-types';
import { creatureName, getSpecies } from './game';
import { IN_TEAM_NOTE } from './roster-picker';
import { ChoiceButton, ChoiceList } from './ui/ChoiceList';
import { CountBadgeList } from './ui/CountBadge';
import { DrillHead } from './ui/DrillHead';
import { onDrillKey } from './ui/drill-keys';
import { RevealShell } from './ui/RevealShell';
import { RosterPicker } from './ui/RosterPicker';

type Step = 'menu' | 'keepsake' | 'out' | 'arrange';

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
  /**
   * Open at this step (the workbench shows each one); `initialIncoming` is who is coming in for the
   * `out` and `arrange` steps, and `initialOut` who goes home for `arrange`.
   */
  initialStep?: Step;
  initialIncoming?: string;
  initialOut?: string;
}

/**
 * The camp, halfway up the map. Pick one thing: Rest (standing creatures recover part of their HP),
 * take a keepsake (one of two), or Swap (a creature from the collection comes in at full HP, and
 * one of the row goes home; the knocked-out one is easy to see). The row sits above the choices on
 * the same board as the dungeon entry, each creature with its HP under it, and can be rearranged
 * for free (drag, or tap two); the order goes along with the choice. A Swap has one more step after
 * "who goes home": the row as it will stand, with the new creature in the place of the one that left,
 * which can be rearranged before the swap is confirmed, so the recruit can stand anywhere. Apart
 * from the three, the player may head home and keep the whole pack; that asks once more before it
 * ends the run. The server checks every act again: this only builds them.
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
  initialOut,
}: Props) {
  const [order, setOrder] = useState(() => rowIds(team));
  const [step, setStep] = useState<Step>(initialStep ?? 'menu');
  const [incoming, setIncoming] = useState<string | null>(initialIncoming ?? null);
  const [picking, setPicking] = useState(false);
  const [confirmHome, setConfirmHome] = useState(false);
  /** The creature that goes home, once picked (the swap's second step). */
  const [outId, setOutId] = useState<string | null>(initialOut ?? null);
  /** The row as a swap leaves it (the new creature in the place of the one that went home), as the player arranges it. */
  const [arranged, setArranged] = useState<string[]>(() =>
    initialOut !== undefined && initialIncoming !== undefined
      ? orderAfterSwap(rowIds(team), initialOut, initialIncoming)
      : [],
  );
  const swapButton = useRef<HTMLButtonElement>(null);

  const ordered = order.flatMap((id) => {
    const found = team.find((c) => c.id === id);
    return found === undefined ? [] : [found];
  });
  const lines = campChoiceLines(camp.restBp);
  const swappable = canSwapIn(creatures, order);
  const comesIn = creatures.find((c) => c.id === incoming);

  /** A creature of the run's row for the camp's board. */
  const rowCreature = (id: string): CampRowCreature[] => {
    const found = team.find((c) => c.id === id);
    if (found !== undefined) return [campCreatureOf(found)];
    // The one that comes in: fresh, at full HP.
    const fresh = creatures.find((c) => c.id === id);
    if (fresh === undefined) return [];
    return [
      {
        id: fresh.id,
        name: creatureName(fresh),
        species: fresh.species,
        level: fresh.level,
        element: getSpecies(fresh.species)?.element ?? 'unknown',
        hp: null,
      },
    ];
  };

  /** The steps' way back: Back and Escape do the same (not while an act is running). */
  const toMenu = (): void => {
    setStep('menu');
  };
  /** Back from "who goes home" is back to the menu with nobody picked to come in. */
  const fromOut = (): void => {
    setIncoming(null);
    setStep('menu');
  };
  const toOut = (): void => {
    setStep('out');
  };
  const keysFor = (back: () => void) => (busy ? undefined : onDrillKey(back));

  const row = (
    ids: readonly string[],
    onChange: (order: string[]) => void,
  ): ReturnType<typeof CampRow> => (
    <CampRow creatures={ids.flatMap(rowCreature)} disabled={busy} onChange={onChange} />
  );

  return (
    <RevealShell
      id="dungeon-camp-heading"
      title={CAMP_TITLE}
      class="dungeon-camp"
      pix
      arrive
      footer={<></>}
    >
      {step === 'menu' && (
        <>
          <p class="muted prose">{CAMP_INTRO}</p>
          {row(order, setOrder)}
          <ChoiceList label="Pick one">
            <ChoiceButton
              label={lines.rest.label}
              line={lines.rest.line}
              disabled={busy}
              onClick={() => {
                onAct(restAct(order));
              }}
            />
            <ChoiceButton
              label={lines.keepsake.label}
              line={lines.keepsake.line}
              disabled={busy || camp.offers.length === 0}
              onClick={() => {
                setStep('keepsake');
              }}
            />
            <ChoiceButton
              buttonRef={swapButton}
              label={lines.swap.label}
              line={swappable ? lines.swap.line : NO_SWAP_LINE}
              disabled={busy || !swappable}
              onClick={() => {
                setPicking(true);
              }}
            />
          </ChoiceList>
          <div class="camp-home">
            {confirmHome ? (
              <div class="confirm" role="group" aria-label="Head home">
                {isPackEmpty(pack) ? (
                  <p>Head home now? Your pack is empty, but your experience is safe.</p>
                ) : (
                  <>
                    <p>Head home now? You keep your whole pack:</p>
                    <CountBadgeList
                      items={packBadges(pack)}
                      label="Your pack"
                      class="run-pack-items"
                    />
                  </>
                )}
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
              </>
            )}
          </div>
        </>
      )}

      {step === 'keepsake' && (
        <div class="camp-step" onKeyDown={keysFor(toMenu)}>
          <DrillHead
            title="Take a keepsake"
            level={4}
            backLabel="to the camp"
            focus
            disabled={busy}
            onBack={toMenu}
          />
          <ChoiceList label="Keepsakes on offer">
            {camp.offers.map((offer) => (
              <ChoiceButton
                key={offer.id}
                label={offer.name}
                line={offer.description}
                disabled={busy}
                onClick={() => {
                  onAct(keepsakeAct(order, offer.id));
                }}
              />
            ))}
          </ChoiceList>
        </div>
      )}

      {step === 'out' && (
        <div class="camp-step" onKeyDown={keysFor(fromOut)}>
          <DrillHead
            title="Who goes home?"
            level={4}
            backLabel="to the camp"
            focus
            disabled={busy}
            onBack={fromOut}
          />
          <p class="muted prose">
            {comesIn === undefined ? 'A fresh creature' : creatureName(comesIn)} comes in at full
            HP.
          </p>
          <ChoiceList label="Pick who goes home">
            {ordered.map((creature) => (
              <ChoiceButton
                key={creature.id}
                class={`camp-out${creature.hp <= 0 ? ' ko' : ''}`}
                label={creature.name}
                line={`Level ${String(creature.level)} · ${runHpText(creature)}`}
                disabled={busy || incoming === null}
                onClick={() => {
                  if (incoming === null) return;
                  setOutId(creature.id);
                  setArranged(orderAfterSwap(order, creature.id, incoming));
                  setStep('arrange');
                }}
              />
            ))}
          </ChoiceList>
        </div>
      )}

      {step === 'arrange' && (
        <div class="camp-step" onKeyDown={keysFor(toOut)}>
          <DrillHead
            title="Arrange your row"
            level={4}
            backLabel="to who goes home"
            focus
            disabled={busy}
            onBack={toOut}
          />
          <p class="muted prose">{CAMP_ARRANGE_LINE}</p>
          {row(arranged, setArranged)}
          <p class="button-row camp-arrange-actions">
            <button
              type="button"
              class="camp-confirm"
              disabled={busy || incoming === null || outId === null}
              onClick={() => {
                if (incoming !== null && outId !== null) onAct(swapAct(arranged, outId, incoming));
              }}
            >
              Swap and push on
            </button>
          </p>
        </div>
      )}

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
