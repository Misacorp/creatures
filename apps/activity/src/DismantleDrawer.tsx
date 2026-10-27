import { GLOSSARY_IDS } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { JobWhoStep } from './JobWizard';
import { creatureName } from './game';
import { ItemThumb } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { DismantlePreview, GearItem, GearState } from './gear-types';
import { dismantleCountItems, oddsPercent, pickerOptions, pileQuestion } from './gear-view';
import { jobWho } from './job-who';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Alert } from './ui/Alert';
import { CountBadgeList } from './ui/CountBadge';
import { Drawer } from './ui/Drawer';
import { PreviewStatus } from './ui/PreviewStatus';
import { type WizardStep, useWizard } from './ui/use-wizard';
import { WizardFooter, WizardView } from './ui/Wizard';
import { useJobPreview, usePickedCreature } from './use-job-preview';

/** The two steps of dismantling the pile: who does it, then the confirmation. */
export type DismantleStep = 'who' | 'confirm';

function dismantleSteps(title: string): readonly WizardStep<DismantleStep>[] {
  return [
    { id: 'who', title: 'Who dismantles', backLabel: 'to the bag', next: 'Next' },
    { id: 'confirm', title, backLabel: 'to who dismantles', next: 'Dismantle' },
  ];
}

/**
 * Dismantling the marked pile (2026-10-27) as the shared wizard (`ui/Wizard`) in a drawer opened from the bag
 * (a sheet from a page, never from a drawer): Who dismantles (the job wizard's list: free creatures first,
 * busy ones greyed with the reason; no Crafting level rule and no time, so nothing is folded and no clock),
 * then the confirmation. The confirmation asks "Dismantle 23 items (20 Common, 3 Rare)?", shows the items that
 * go, the chosen creature, and the server's numbers (what the pile can break into as count badges and ranges, the
 * chance to learn a blueprint or raise its quality, Market Day and Tinker's luck when they apply), with "Cannot
 * be undone." above the gold "Dismantle" at the bottom (the destructive action last). The safe choices are Back
 * and Escape (nothing changes); the focus goes to Back when the confirmation opens, so a second Enter on the button
 * that said "Next" cannot dismantle. The request names exactly these items; the server takes nothing if the
 * marked set changed meanwhile, and the error says so here.
 */
export function DismantleDrawer({
  items,
  gear,
  creatures,
  busy,
  error,
  loadPreview,
  onConfirm,
  onClose,
  start,
  returnFocusTo,
}: {
  /** The marked items the player saw (the exact pile the request names). */
  items: readonly GearItem[];
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  /** The server's last error, shown above the button after a dismantle that was refused. */
  error: string | null;
  loadPreview: (creatureId: string, itemIds: readonly string[]) => Promise<DismantlePreview>;
  /** Dismantles the pile with the creature; resolves true when it was done (the caller then closes). */
  onConfirm: (creatureId: string) => Promise<boolean>;
  onClose: () => void;
  /** Where it starts (the workbench shows the confirmation); Who by default. */
  start?: DismantleStep | undefined;
  returnFocusTo?: HTMLElement | null | undefined;
}) {
  const title = pileQuestion(items);
  const wizard = useWizard(dismantleSteps(title), { onExit: onClose, initial: start });
  const noTime = (): number => 0;
  const options = pickerOptions(creatures, gear.skills, noTime);
  const [creatureId, pick] = usePickedCreature(options);
  // No level rule: minimum 0 lists everybody as able or busy, and nothing is folded.
  const who = jobWho(creatures, gear.skills, noTime, 0);
  const picked = options.find((o) => o.creature.id === creatureId);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const ids = items.map((i) => i.id);

  const onConfirmStep = wizard.step === 'confirm';
  // The server is asked only when the confirmation is shown.
  const { status, preview } = useJobPreview(
    onConfirmStep ? creatureId : null,
    (who) => loadPreview(who, ids),
    [ids.join(',')],
  );

  // The confirmation opens with the focus on Back (the safe choice), not on the button that said "Next".
  useEffect(() => {
    if (onConfirmStep) {
      root.current?.querySelector<HTMLElement>('.drill-back')?.focus({ preventScroll: true });
    }
  }, [onConfirmStep]);
  // Nobody is free any more while the confirmation is up: back to Who.
  const nobody = creatureId === null;
  useEffect(() => {
    if (onConfirmStep && nobody) wizard.goTo('who');
  }, [onConfirmStep, nobody]);

  let blocked: string | null = null;
  if (nobody) blocked = 'Nobody is free to dismantle.';
  else if (onConfirmStep && status === 'failed') {
    blocked = 'Could not load the refund. Go back and pick again.';
  } else if (onConfirmStep && preview === null) blocked = 'Loading the refund...';

  const finish = (): void => {
    if (creatureId === null || preview === null) return;
    setFailed(false);
    void onConfirm(creatureId).then((done) => {
      if (!done) setFailed(true);
    });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Dismantle"
      returnFocusTo={returnFocusTo}
      class="dismantle-drawer"
      footer={
        <WizardFooter
          wizard={wizard}
          blocked={blocked}
          busy={busy}
          reasonShown={!onConfirmStep}
          onFinish={finish}
          before={
            onConfirmStep && (
              <p class="reason">
                Cannot be undone. <GlossaryTag entry="job-dismantle" look="help" />
              </p>
            )
          }
          extra={onConfirmStep && failed && error !== null && <Alert level="alert">{error}</Alert>}
        />
      }
    >
      <div ref={root} class="dismantle-wizard pix-panel">
        <WizardView wizard={wizard} class="job-wizard" focus>
          {wizard.step === 'who' ? (
            <JobWhoStep
              who={who}
              value={creatureId}
              onPick={pick}
              legend="Who dismantles"
              groupName="dismantle-pile-who"
              time={false}
            />
          ) : (
            <div class="job-ready dismantle-ready">
              <ul
                class="dismantle-items"
                aria-label={`${String(items.length)} items to take apart`}
              >
                {items.map((item) => (
                  <li key={item.id}>
                    <ItemThumb item={item} scale={items.length > 12 ? 3 : 4} />
                  </li>
                ))}
              </ul>
              {picked !== undefined && (
                <div class="pick on job-ready-who">
                  <Sprite sprite={creatureSpriteOrFallback(picked.creature.species)} scale={2} />
                  <span class="pick-text">
                    <span class="pick-name pix">{creatureName(picked.creature)}</span>
                    <span class="pick-meta">Crafting level {picked.level}</span>
                  </span>
                </div>
              )}
              <PreviewStatus status={status} what="the refund" loading="Loading..." />
              {preview !== null && (
                <>
                  <CountBadgeList
                    items={dismantleCountItems(preview.range)}
                    label="Gives"
                    class="gives"
                  />
                  {preview.learnBp !== null && (
                    <p class="muted">
                      {oddsPercent(preview.learnBp)} per piece to learn its blueprint or{' '}
                      <GlossaryTag entry="blueprint-quality">raise its quality</GlossaryTag>.
                    </p>
                  )}
                  {preview.tinkersLuckBp > 0 && (
                    <p class="muted">
                      <GlossaryTag entry={GLOSSARY_IDS.gearLine('tinkers-luck')}>
                        {"Tinker's luck"}
                      </GlossaryTag>
                      : {oddsPercent(preview.tinkersLuckBp)} per item to give back its full craft
                      cost.
                    </p>
                  )}
                  {preview.boosted > 0 && (
                    <p class="muted">
                      Market Day: the best{' '}
                      {preview.boosted === 1 ? 'item' : `${String(preview.boosted)} items`} roll the
                      top of their range.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </WizardView>
      </div>
    </Drawer>
  );
}
