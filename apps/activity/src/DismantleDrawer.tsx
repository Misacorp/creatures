import { GLOSSARY_IDS } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { JobWhoStep } from './JobWizard';
import { creatureName } from './game';
import { ItemThumb } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { DismantleCheck, DismantlePreview, GearItem, GearState } from './gear-types';
import {
  dismantleCountItems,
  oddsPercent,
  pickerOptions,
  pileQuestion,
  wornAmong,
} from './gear-view';
import { jobWho } from './job-who';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Alert } from './ui/Alert';
import { CreatureList } from './ui/CreatureList';
import { baseOption, type PickerOption } from './roster-picker';
import { CountBadgeList } from './ui/CountBadge';
import { Drawer } from './ui/Drawer';
import { PreviewStatus } from './ui/PreviewStatus';
import { type WizardStep, useWizard } from './ui/use-wizard';
import { WizardFooter, WizardView } from './ui/Wizard';
import { useJobPreview, usePickedCreature } from './use-job-preview';

/** The steps of dismantling: the warning about worn items (only when some are worn), who does it, the confirmation. */
export type DismantleStep = 'worn' | 'who' | 'confirm';

function dismantleSteps(
  title: string,
  hasWorn: boolean,
  exitLabel: string,
): readonly WizardStep<DismantleStep>[] {
  const who: WizardStep<DismantleStep> = {
    id: 'who',
    title: 'Who dismantles',
    backLabel: hasWorn ? 'to the worn items' : exitLabel,
    next: 'Next',
  };
  const confirm: WizardStep<DismantleStep> = {
    id: 'confirm',
    title,
    backLabel: 'to who dismantles',
    next: 'Dismantle',
  };
  if (!hasWorn) return [who, confirm];
  return [
    { id: 'worn', title: 'Worn items', backLabel: exitLabel, next: 'Dismantle anyway' },
    who,
    confirm,
  ];
}

/** What the flow needs, whether it is drawn in a drawer from the bag or inside one item's card. */
export interface DismantleFlowProps {
  /** The items the player picked (the exact pile the request names). */
  items: readonly GearItem[];
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  /** The server's last error, shown above the button after a dismantle that was refused. */
  error: string | null;
  loadPreview: (creatureId: string, itemIds: readonly string[]) => Promise<DismantlePreview>;
  /** Which worn items cannot go now (a creature that is away or on a job still needs them). */
  checkLocks: (itemIds: readonly string[]) => Promise<DismantleCheck>;
  /** Dismantles with the creature; resolves true when it was done (the caller then closes). */
  onConfirm: (creatureId: string) => Promise<boolean>;
  /** Back from the first step: leave the flow, nothing changed. */
  onExit: () => void;
  /** What the first step's Back goes back to, said to screen readers ("to the bag", "to the item"). */
  exitLabel: string;
  /** Where it starts (the workbench shows the other steps); the first by default. */
  start?: DismantleStep | undefined;
}

type Locks = 'loading' | 'failed' | DismantleCheck['locked'];

/** The held reason of a worn item, in words ("Away on a trip: ...", "On a job: ..."). */
function lockText(reason: 'trip' | 'job'): string {
  return reason === 'trip'
    ? 'Away on a trip: it still counts when the trip is claimed.'
    : 'On a job: it still counts when the job is claimed.';
}

/**
 * The worn step: one row per creature that wears something from the pile, in the established creature row
 * (`ui/CreatureList`, as "Equip on" draws it: picture, name, level, element and role, and what it wears as small item
 * tiles on the right). An item that is held (its wearer is away or on a job) keeps a reason line in its row.
 */
function WornStep({
  worn,
  creatures,
  locks,
}: {
  worn: readonly GearItem[];
  creatures: readonly Creature[];
  locks: Locks;
}) {
  const options = creatures.flatMap((creature): PickerOption[] => {
    const mine = worn.filter((item) => item.equippedOn === creature.id);
    if (mine.length === 0) return [];
    const held = Array.isArray(locks)
      ? locks.find((l) => mine.some((item) => item.id === l.itemId))
      : undefined;
    return [
      {
        ...baseOption(creature),
        worn: mine.map(({ baseId, rarity, itemLevel }) => ({ baseId, rarity, itemLevel })),
        ...(held === undefined ? {} : { note: lockText(held.reason) }),
      },
    ];
  });
  return (
    <div class="dismantle-worn dr-stack">
      <p class="muted">
        {worn.length === 1 ? 'This one is' : 'These are'} worn. Dismantling takes{' '}
        {worn.length === 1 ? 'it' : 'them'} off.
      </p>
      <CreatureList
        options={options}
        selection={{ mode: 'show', label: 'Worn items' }}
        class="flat worn-list"
      />
      {locks === 'loading' && <p class="muted">Checking...</p>}
    </div>
  );
}

/**
 * Dismantling as the shared wizard (`ui/Wizard`), made once and drawn where the caller wants (`body` in a drawer's
 * content, `footer` in its pinned footer; or both in a card). Steps: a warning about the picked items that are
 * worn (who wears each, and "Dismantle anyway"; left out when none is), Who dismantles (the job wizard's list:
 * free creatures first, busy ones greyed with the reason; no Crafting level rule and no time, so nothing is folded
 * and no clock), then the confirmation. The confirmation asks "Dismantle 23 items (20 Common, 3 Rare)?", shows the
 * items that go, the chosen creature and the server's numbers (what they can break into as count badges and
 * ranges, the chance to learn a blueprint or raise its quality, Market Day and Tinker's luck when they apply),
 * with "Cannot be undone." above the gold "Dismantle" at the bottom (the destructive action last). The safe
 * choices are Back and Escape (nothing changes); the focus goes to Back when the confirmation opens, so a second
 * Enter on the button that said "Next" cannot dismantle.
 *
 * A worn item that a creature on a trip or a job still needs (the server says which, before anything is asked)
 * holds the first step: "Dismantle anyway" stays off and each such row says why.
 */
export function useDismantleFlow(props: DismantleFlowProps): {
  body: ComponentChildren;
  footer: ComponentChildren;
} {
  const { items, gear, creatures, busy, error, loadPreview, checkLocks, onConfirm, onExit } = props;
  const worn = wornAmong(items);
  const hasWorn = worn.length > 0;
  const title = pileQuestion(items);
  const wizard = useWizard(dismantleSteps(title, hasWorn, props.exitLabel), {
    onExit,
    initial: props.start,
  });
  const noTime = (): number => 0;
  const options = pickerOptions(creatures, gear.skills, noTime);
  const [creatureId, pick] = usePickedCreature(options);
  // No level rule: minimum 0 lists everybody as able or busy, and nothing is folded.
  const who = jobWho(creatures, gear.skills, noTime, 0);
  const picked = options.find((o) => o.creature.id === creatureId);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const ids = items.map((i) => i.id);
  const wornIds = worn.map((i) => i.id);

  // Which worn items a running trip or job still needs: asked once, when the flow opens.
  const [locks, setLocks] = useState<Locks>(hasWorn ? 'loading' : []);
  useEffect(() => {
    if (!hasWorn) return undefined;
    let current = true;
    checkLocks(wornIds).then(
      (check) => {
        if (current) setLocks(check.locked);
      },
      () => {
        // The server decides again when the items go: an unanswered check does not hold the player back.
        if (current) setLocks('failed');
      },
    );
    return () => {
      current = false;
    };
  }, [wornIds.join(',')]);

  const onConfirmStep = wizard.step === 'confirm';
  // The server is asked only when the confirmation is shown.
  const { status, preview } = useJobPreview(
    onConfirmStep ? creatureId : null,
    (id) => loadPreview(id, ids),
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

  const lockedNow = Array.isArray(locks) && locks.length > 0;
  let blocked: string | null = null;
  if (wizard.step === 'worn') {
    if (lockedNow)
      blocked = 'Go back and leave those out, or wait until their trip or job is done.';
    else if (locks === 'loading') blocked = 'Checking what they wear...';
  } else if (nobody) blocked = 'Nobody is free to dismantle.';
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

  const body = (
    <div ref={root} class="dismantle-wizard dr-stack pix-panel">
      <WizardView wizard={wizard} class="job-wizard" focus>
        {wizard.step === 'worn' ? (
          <WornStep worn={worn} creatures={creatures} locks={locks} />
        ) : wizard.step === 'who' ? (
          <JobWhoStep
            who={who}
            value={creatureId}
            onPick={pick}
            legend="Who dismantles"
            groupName="dismantle-pile-who"
            time={false}
          />
        ) : (
          <div class="job-ready dismantle-ready dr-stack">
            <ul class="dismantle-items" aria-label={`${String(items.length)} items to take apart`}>
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
  );
  const footer = (
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
  );
  return { body, footer };
}

/**
 * The one frame of dismantling, wherever it starts (the bag's bulk bar, or an item's red Dismantle): the flow in a
 * drawer, the head ("Back", then the step's title) in its content and the gold button pinned in the drawer's
 * footer. An entry point only says what Back from the first step returns to (`exitLabel`) and may add `swap`; it
 * never wraps the flow itself (ux-patterns.md, "A flow reachable from several places").
 */
export function DismantleDrawer({
  onClose,
  onDismiss,
  returnFocusTo,
  exitLabel = 'to the bag',
  swap = false,
  ...flow
}: Omit<DismantleFlowProps, 'onExit' | 'exitLabel'> & {
  /** Back from the first step: leave the flow. */
  onClose: () => void;
  /** A tap outside, the handle or Escape on the sheet itself: leave everything (default: same as `onClose`). */
  onDismiss?: (() => void) | undefined;
  returnFocusTo?: HTMLElement | null | undefined;
  exitLabel?: string | undefined;
  /** Replaces another drawer of the same screen (the item card's): no slide-in, one drawer changing view. */
  swap?: boolean | undefined;
}) {
  const { body, footer } = useDismantleFlow({ ...flow, onExit: onClose, exitLabel });
  return (
    <Drawer
      open
      onClose={onDismiss ?? onClose}
      title="Dismantle"
      returnFocusTo={returnFocusTo}
      class={swap ? 'dismantle-drawer drawer-swap' : 'dismantle-drawer'}
      footer={footer}
    >
      {body}
    </Drawer>
  );
}
