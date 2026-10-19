import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { shinyPalette } from './art';
import { essenceCount } from './count-items';
import { evolveButtonLabel, evolveForms, type EvolveForm } from './evolve-view';
import { GlossaryTag } from './Glossary';
import { creatureName } from './game';
import { busyReason } from './gear-view';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { CountBadge } from './ui/CountBadge';
import { Drawer } from './ui/Drawer';

/** What is on a form's card: its picture, name, element and role, its ability and the numbers it would have. */
function FormCard({ form, shiny, bob }: { form: EvolveForm; shiny: boolean; bob: boolean }) {
  const palette = shiny ? shinyPalette(form.species) : undefined;
  return (
    <>
      <Sprite
        sprite={creatureSpriteOrFallback(form.species)}
        scale={4}
        bob={bob}
        {...(palette === undefined ? {} : { palette })}
      />
      <strong class="pix evolve-name">{form.name}</strong>
      <span class="evolve-tags">
        <ElementChip element={form.element} role={form.role} as="plain" />
      </span>
      {form.ability !== null && (
        <span class="evolve-ability">
          <strong class="pix">{form.ability.name}</strong>
          <span>{form.ability.text}</span>
        </span>
      )}
      <dl class="evolve-stats">
        <div>
          <dt>HP</dt>
          <dd>{form.stats.hp}</dd>
        </div>
        <div>
          <dt>Atk</dt>
          <dd>{form.stats.atk}</dd>
        </div>
        <div>
          <dt>Spd</dt>
          <dd>{form.stats.spd}</dd>
        </div>
      </dl>
    </>
  );
}

/** One form to pick: a button holding its card; the picked one has a gold frame. */
function FormChoice({
  form,
  shiny,
  picked,
  disabled,
  onPick,
}: {
  form: EvolveForm;
  shiny: boolean;
  picked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        class={`evolve-form${picked ? ' on' : ''}`}
        aria-pressed={picked}
        disabled={disabled}
        onClick={onPick}
      >
        <FormCard form={form} shiny={shiny} bob={picked} />
      </button>
    </li>
  );
}

/**
 * The evolve screen, in a Drawer, for every evolve. A line that grows two ways (every evolving line does:
 * Sproutle is Thornbuck or Sunfawn, Mossback is Ancientshell or Bloomback) shows both forms side by side,
 * then one button for the form that is picked, with one line that the choice is permanent. Nothing is
 * picked at first: there is no default for a choice that cannot be undone. A line with one form shows that
 * form on one card and has it picked already (there is no choice to make, and no sentence about it: the
 * card shows it), so the button works at once. The server checks the form, the level and the Essence; this only asks.
 */
export function EvolveDrawer({
  open,
  onClose,
  creature,
  busy,
  onEvolve,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  creature: Creature;
  busy: boolean;
  /** Evolves the creature into the form (the screen closes first). */
  onEvolve: (creature: Creature, species: string) => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const forms = evolveForms(creature);
  // With a single form there is nothing to choose, so that form is the one picked.
  const only = forms.length === 1 ? forms[0] : undefined;
  const chosen = only ?? forms.find((f) => f.species === picked);
  const evolution = creature.evolution;
  // The server refuses a creature that is away or on a job: the button says why it cannot yet.
  const away = busyReason(creature);
  const ready = evolution?.available === true && away === null;
  const essence = evolution?.essence ?? 0;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Evolve ${creatureName(creature)}`}
      class="evolve-drawer"
      {...(returnFocusTo === undefined ? {} : { returnFocusTo })}
      footer={
        <div class="evolve-confirm">
          <p class="evolve-permanent evolve-cost">
            <CountBadge {...essenceCount(essence, { entry: true })} />
            <span>
              This choice is{' '}
              <GlossaryTag entry="evolution" look="text">
                permanent
              </GlossaryTag>
              .
            </span>
          </p>
          {away !== null && <p class="evolve-permanent muted">{away}</p>}
          <button
            type="button"
            class="primary"
            disabled={busy || !ready || chosen === undefined}
            onClick={() => {
              if (chosen === undefined) return;
              setPicked(null);
              onEvolve(creature, chosen.species);
            }}
          >
            {evolveButtonLabel(chosen)}
          </button>
        </div>
      }
    >
      <ul class={only === undefined ? 'evolve-forms' : 'evolve-forms single'}>
        {only === undefined ? (
          forms.map((form) => (
            <FormChoice
              key={form.species}
              form={form}
              shiny={creature.shiny}
              picked={form.species === picked}
              disabled={busy}
              onPick={() => {
                setPicked(form.species);
              }}
            />
          ))
        ) : (
          <li>
            <div class="evolve-form on">
              <FormCard form={only} shiny={creature.shiny} bob />
            </div>
          </li>
        )}
      </ul>
    </Drawer>
  );
}
