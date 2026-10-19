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

/** One form to pick: its picture, name, element and role, its ability and the numbers it would have. */
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
  const palette = shiny ? shinyPalette(form.species) : undefined;
  return (
    <li>
      <button
        type="button"
        class={`evolve-form${picked ? ' on' : ''}`}
        aria-pressed={picked}
        disabled={disabled}
        onClick={onPick}
      >
        <Sprite
          sprite={creatureSpriteOrFallback(form.species)}
          scale={4}
          bob={picked}
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
      </button>
    </li>
  );
}

/**
 * The evolve screen of a line that grows two ways (every evolving line does: Sproutle is Thornbuck or
 * Sunfawn, Mossback is Ancientshell or Bloomback), in a Drawer: both forms side by side, then one button for the form that is picked, with one
 * line that the choice is permanent. Nothing is picked at first: there is no default for a choice that
 * cannot be undone. A line with one form never opens this (it evolves at once). The server checks the
 * form, the level and the Essence; this only asks.
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
  const chosen = forms.find((f) => f.species === picked);
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
      <ul class="evolve-forms">
        {forms.map((form) => (
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
        ))}
      </ul>
    </Drawer>
  );
}
