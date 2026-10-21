import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { JobWhoStep } from './JobWizard';
import { creatureName } from './game';
import { ItemThumb } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { DismantlePreview, GearItem, GearState } from './gear-types';
import {
  dismantleCountItems,
  dismantleDurationFor,
  durationCountItem,
  gearName,
  oddsPercent,
  pickerOptions,
} from './gear-view';
import { jobWho } from './job-who';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Alert } from './ui/Alert';
import { CountBadge, CountBadgeList } from './ui/CountBadge';
import { PreviewStatus } from './ui/PreviewStatus';
import { type WizardStep, useWizard } from './ui/use-wizard';
import { WizardFooter, WizardView } from './ui/Wizard';
import { useJobPreview, usePickedCreature } from './use-job-preview';

/** The two steps of dismantling: who does it, then the confirmation. */
export type DismantleStep = 'who' | 'confirm';

function dismantleSteps(title: string): readonly WizardStep<DismantleStep>[] {
  return [
    { id: 'who', title: 'Who dismantles', backLabel: 'to the item', next: 'Next' },
    { id: 'confirm', title, backLabel: 'to who dismantles', next: 'Dismantle' },
  ];
}

/**
 * Dismantling as a wizard (2026-10-22) on the shared wizard (`ui/Wizard`), a drill-in of the item drawer in the
 * place of the item (never a second drawer): Who dismantles (the job wizard's list: free creatures first with
 * their time, busy ones greyed with the reason; dismantling has no Crafting level rule, so nothing is folded),
 * then the confirmation: who, the time, what the items can break into (count badges, ranges as "3-4"), the
 * chance to learn a blueprint or raise its quality, and the gold "Dismantle" with "Cannot be undone." above
 * it. The safe choices are Back and Escape (the item view, nothing changed); the focus goes to Back when the
 * confirmation opens, so a second Enter on the button that said "Next" cannot dismantle. The items go into the
 * Workshop when the job starts and the parts come when it is claimed. Every number is the server's
 * (`previewDismantle`). A refused start keeps the confirmation up and shows the server's error.
 */
export function DismantleWizard({
  items,
  wearers,
  gear,
  creatures,
  busy,
  error,
  loadPreview,
  onConfirm,
  onExit,
  start,
}: {
  /** The items to take apart: a bundle of up to 5 Commons, or one piece of anything else. */
  items: readonly GearItem[];
  /** The creatures that wear any of them (they come off first). */
  wearers: readonly Creature[];
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  /** The server's last error, shown above the button after a start that was refused. */
  error: string | null;
  loadPreview: (creatureId: string, itemIds: readonly string[]) => Promise<DismantlePreview>;
  /** Starts the job; resolves true when it started (the caller then drops the item). */
  onConfirm: (creatureId: string) => Promise<boolean>;
  /** Back from Who dismantles, and Escape there: the item view. */
  onExit: () => void;
  /** Where it starts (the workbench shows the confirmation); Who by default. */
  start?: DismantleStep | undefined;
}) {
  const first = items[0];
  const rarity = first?.rarity ?? 'common';
  const durationAt = (level: number): number => dismantleDurationFor(rarity, level);
  const title =
    first === undefined
      ? 'Dismantle'
      : items.length === 1
        ? `Dismantle ${gearName(first.baseId)}?`
        : `Dismantle ${String(items.length)} ${rarity} items?`;
  const wizard = useWizard(dismantleSteps(title), { onExit, initial: start });
  const options = pickerOptions(creatures, gear.skills, durationAt);
  const [creatureId, pick] = usePickedCreature(options);
  // No level rule: minimum 0 lists everybody as able or busy, and nothing is folded.
  const who = jobWho(creatures, gear.skills, durationAt, 0);
  const picked = options.find((o) => o.creature.id === creatureId);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const onConfirmStep = wizard.step === 'confirm';
  // The server is asked only when the confirmation is shown.
  const { status, preview } = useJobPreview(
    onConfirmStep ? creatureId : null,
    (who) =>
      loadPreview(
        who,
        items.map((i) => i.id),
      ),
    [items.map((i) => i.id).join(',')],
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
    void onConfirm(creatureId).then((started) => {
      if (!started) setFailed(true);
    });
  };

  if (first === undefined) return null;
  return (
    <div
      ref={root}
      class="dismantle-wizard"
      data-no-flip=""
      onKeyDown={(event) => {
        // Left and Right do not flip the item behind it.
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation();
      }}
    >
      <WizardView wizard={wizard} class="job-wizard" focus>
        <ul class="dismantle-items" aria-label="Items to take apart">
          {items.map((item) => (
            <li key={item.id}>
              <ItemThumb item={item} scale={4} />
            </li>
          ))}
        </ul>
        {wizard.step === 'who' ? (
          <JobWhoStep
            who={who}
            value={creatureId}
            onPick={pick}
            legend="Who dismantles"
            groupName={`dismantle-${first.id}-who`}
          />
        ) : (
          <div class="job-ready dismantle-ready">
            {picked !== undefined && (
              <div class="pick on job-ready-who">
                <Sprite sprite={creatureSpriteOrFallback(picked.creature.species)} scale={2} />
                <span class="pick-text">
                  <span class="pick-name pix">{creatureName(picked.creature)}</span>
                  <span class="pick-meta">Crafting level {picked.level}</span>
                </span>
                <span class="pick-side">
                  <CountBadge
                    {...durationCountItem(
                      preview === null ? picked.durationMs : preview.durationMs,
                    )}
                  />
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
              </>
            )}
            {wearers.length > 0 && (
              <p class="muted">
                Comes off {wearers.map((w) => creatureName(w)).join(' and ')} first.
              </p>
            )}
          </div>
        )}
      </WizardView>
      <div class="dismantle-footer">
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
      </div>
    </div>
  );
}
