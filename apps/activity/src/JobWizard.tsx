import { GLOSSARY_IDS } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { PickRow } from './CreaturePicker';
import { baitCount } from './count-items';
import { creatureName } from './game';
import type { GearState } from './gear-types';
import { durationCountItem } from './gear-view';
import { GlossaryTag } from './Glossary';
import type { JobWho } from './job-who';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { TreatBox } from './TreatBox';
import { Alert } from './ui/Alert';
import { Chevron } from './ui/Accordion';
import { CountBadge, type CountItem } from './ui/CountBadge';
import { Drawer } from './ui/Drawer';
import { RecipeCard, type RecipeInput } from './ui/RecipeCard';
import { WizardFooter, WizardView } from './ui/Wizard';
import { useJobWizard, type JobSpec, type JobStep, type JobWizard } from './use-job-wizard';

/** The recipe shown once at the top of the drawer (not a step): what goes in, what comes out, how long it takes. */
export interface JobRecipe {
  inputs: RecipeInput[];
  outputs: CountItem[];
  duration: CountItem;
  /** The recipe card's own words for its (unused) button: "Refine". */
  verb: string;
}

export interface JobDrawerProps {
  /** The drawer's title: "Refine Plain Lure". */
  title: string;
  /** The job's glossary kind, for the "?" beside the title. */
  helpKind: 'supply' | 'convert';
  recipe: JobRecipe;
  spec: JobSpec;
  gear: GearState;
  creatures: readonly Creature[];
  /** True while any action runs. */
  busy: boolean;
  /** The server's last error, shown in the footer after a start that failed (the page's own copy is behind the drawer). */
  error: string | null;
  /** The control that opened the drawer, which gets the focus back on close. */
  returnFocusTo?: HTMLElement | null | undefined;
  /** Starts the job; resolves true when it started (the drawer then closes). */
  onStart: (creatureId: string, treat: boolean) => Promise<boolean>;
  onClose: () => void;
  /** Where it starts: the step, a packed treat, the folded row open. The game starts on Who, folded, no treat; the workbench shows the others. */
  start?: { step?: JobStep; treat?: boolean; foldOpen?: boolean } | undefined;
}

/**
 * The Workshop's supply jobs (Craft, Refine, Recycle) as one wizard in a drawer, on the shared wizard
 * (`ui/Wizard`): the recipe once at the top, then Who crafts and Ready, with the gold start button pinned at
 * the bottom with the reason it is disabled. Back on the first step and Escape there close the drawer. A start
 * that failed keeps the drawer up and shows the server's error in the footer.
 */
export function JobDrawer(props: JobDrawerProps) {
  const { recipe, spec, gear, creatures, busy } = props;
  const [failed, setFailed] = useState(false);
  const job = useJobWizard({ spec, gear, creatures, onExit: props.onClose, start: props.start });
  const { wizard } = job;

  const finish = (): void => {
    if (job.request === null) return;
    setFailed(false);
    void props.onStart(job.request.creatureId, job.request.treat).then((started) => {
      if (started) props.onClose();
      else setFailed(true);
    });
  };

  return (
    <Drawer
      open
      onClose={props.onClose}
      title={props.title}
      titleHelp={<GlossaryTag entry={GLOSSARY_IDS.job(props.helpKind)} look="help" />}
      returnFocusTo={props.returnFocusTo}
      class="job-drawer"
      toolbar={
        <RecipeCard
          compact
          inputs={recipe.inputs}
          outputs={recipe.outputs}
          duration={recipe.duration}
          actionLabel={recipe.verb}
          onStart={() => undefined}
        />
      }
      footer={
        <WizardFooter
          wizard={wizard}
          blocked={job.blocker}
          busy={busy}
          disabled={wizard.last && job.request === null}
          onFinish={finish}
          extra={failed && props.error !== null && <Alert level="alert">{props.error}</Alert>}
          badge={
            wizard.last &&
            job.treat &&
            job.picked !== undefined && (
              <CountBadge {...baitCount(job.picked.creature.treatCost)} label="Bait" />
            )
          }
        />
      }
    >
      <WizardView wizard={wizard} class="job-wizard" focus>
        {wizard.step === 'who' ? (
          <JobWhoStep
            who={job.who}
            value={job.picked?.creature.id ?? null}
            onPick={job.pick}
            startOpen={props.start?.foldOpen === true}
          />
        ) : (
          <JobReadyStep job={job} busy={busy} />
        )}
      </WizardView>
    </Drawer>
  );
}

const WHO_GROUP = 'job-who';

/**
 * Step 1: the creatures that can do the job first (each with its time), then the busy ones at the level,
 * greyed with their reason, then one greyed row that folds the creatures under the level ("4 more need
 * Crafting level 3"). Tapping it lists them, greyed with their reason; it starts folded.
 */
export function JobWhoStep({
  who,
  value,
  onPick,
  startOpen = false,
}: {
  who: JobWho;
  value: string | null;
  onPick: (creatureId: string) => void;
  /** The folded row starts open (the workbench; the game starts it folded). */
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const row = (option: JobWho['able'][number]) => (
    <PickRow
      key={option.creature.id}
      name={WHO_GROUP}
      option={option}
      selected={value === option.creature.id}
      onChange={onPick}
    />
  );
  return (
    <fieldset class="picker job-who">
      <legend class="visually-hidden">Who crafts</legend>
      {who.able.map(row)}
      {who.busy.map(row)}
      {who.summary !== null && (
        <>
          <button
            type="button"
            class={`pick pick-fold${open ? ' open' : ''}`}
            aria-expanded={open}
            aria-controls="job-who-folded"
            onClick={() => {
              setOpen(!open);
            }}
          >
            <span class="pick-fold-chev">
              <Chevron />
            </span>
            <span class="pick-fold-text">{who.summary}</span>
          </button>
          {open && <div id="job-who-folded">{who.tooLow.map(row)}</div>}
        </>
      )}
    </fieldset>
  );
}

/**
 * Step 2: who does it and for how long, and the treat. What the job uses is in the recipe at the top, so
 * there is no cost list here; the reason it cannot start, if any, is the footer's.
 */
export function JobReadyStep({ job, busy }: { job: JobWizard; busy: boolean }) {
  const { picked } = job;
  if (picked === undefined) return null;
  const { creature, level, durationMs } = picked;
  return (
    <div class="job-ready">
      <div class="pick on job-ready-who">
        <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={2} />
        <span class="pick-text">
          <span class="pick-name pix">{creatureName(creature)}</span>
          <span class="pick-meta">Crafting level {level}</span>
        </span>
        <span class="pick-side">
          <CountBadge {...durationCountItem(durationMs)} />
        </span>
      </div>
      <TreatBox
        cost={creature.treatCost}
        bait={job.treatBait}
        checked={job.treat}
        disabled={busy}
        who={creatureName(creature)}
        onChange={job.setTreat}
      />
    </div>
  );
}
