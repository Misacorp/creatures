import { useState } from 'preact/hooks';
import type { Creature } from './api';
import {
  conversionDurationFor,
  conversionViews,
  shortText,
  type ConversionView,
} from './conversion-view';
import { GlossaryTag } from './Glossary';
import type { GearState } from './gear-types';
import { nominalDurationCountItem, supplyLevelBlocker } from './gear-view';
import { JobStarter } from './JobStarter';
import { RecipeCard } from './ui/RecipeCard';

/**
 * Refine and Recycle in the Workshop's supply section: a card for every recipe whose supply the player
 * holds, built from the shared `RecipeCard`. Start opens the same creature picker as every Workshop job;
 * the supplies are taken when the job starts and the result is yours when it is claimed. Refine makes a
 * better supply from three; Recycle gives back a few parts and never Bait.
 */
export function ConversionCrafting({
  gear,
  creatures,
  stock,
  busy,
  onStart,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  /** Supplies in stock (the state's `supplies`). */
  stock: Readonly<Record<string, number>>;
  busy: boolean;
  /** Starts the job; resolves true when it started (the picker then closes). */
  onStart: (recipeId: string, creatureId: string, treat: boolean) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = [
    { title: 'Refine', views: conversionViews('refine', stock, gear.parts) },
    { title: 'Recycle', views: conversionViews('recycle', stock, gear.parts) },
  ];
  const nothing = groups.every((g) => g.views.length === 0);
  const card = (view: ConversionView) => {
    const blocker = supplyLevelBlocker(view.level, gear.skills, creatures);
    const reason = shortText(view.inputs) ?? blocker;
    return (
      <li key={view.id} class="card-item">
        <RecipeCard
          inputs={view.inputs}
          outputs={view.outputs}
          duration={nominalDurationCountItem(conversionDurationFor(view.id, 1))}
          disabledReason={reason}
          actionLabel={view.verb}
          busy={busy}
          onStart={() => {
            setOpen(view.id);
          }}
        />
        {open === view.id && (
          <JobStarter
            id={`convert-${view.id}`}
            kind="convert"
            title={view.verb}
            cost={{}}
            gear={gear}
            creatures={creatures}
            busy={busy}
            startLabel={`Start ${view.verb.toLowerCase()}`}
            minLevel={view.level}
            durationAtLevel={(level) => conversionDurationFor(view.id, level)}
            extraBlocker={reason}
            onStart={(creatureId, treat) => {
              void onStart(view.id, creatureId, treat).then((started) => {
                if (started) setOpen(null);
              });
            }}
            onCancel={() => {
              setOpen(null);
            }}
          />
        )}
      </li>
    );
  };
  return (
    <section class="ws-section" aria-labelledby="ws-convert">
      <h3 id="ws-convert">
        Refine and recycle <GlossaryTag entry="job-convert" look="help" />
      </h3>
      {nothing ? (
        <p class="muted">Supplies you find or craft can be refined or recycled here.</p>
      ) : (
        groups
          .filter((g) => g.views.length > 0)
          .map((g) => (
            <div key={g.title}>
              <h4 class="pix">{g.title}</h4>
              <ul class="stack-list">{g.views.map(card)}</ul>
            </div>
          ))
      )}
    </section>
  );
}
