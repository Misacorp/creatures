import type { Creature } from './api';
import { ribbonBlocker, ribbonCostText, ribbonName } from './experience';
import { GlossaryTag } from './Glossary';
import { Bar } from './ui/Bar';

/** The words of the experience bar for screen readers. */
export function experienceLabel(creature: Creature): string {
  return creature.expNeeded === null
    ? `Experience: level ${String(creature.level)}, the top level`
    : `Experience: ${String(creature.exp)} / ${String(creature.expNeeded)} towards level ${String(creature.level + 1)}`;
}

/**
 * One short line under the bar: the experience, and what comes next ("Scarf at 7"). A creature that
 * waits says what it waits for; the top level says so.
 */
export function experienceLine(creature: Creature): string {
  if (creature.expNeeded === null) return 'Top level reached';
  const bar = `${String(creature.exp)} / ${String(creature.expNeeded)} experience`;
  if (creature.waiting) {
    const why =
      creature.ribbon !== null
        ? `${ribbonName(creature.ribbon.id)} first`
        : creature.evolution !== undefined
          ? 'evolve first'
          : 'waiting';
    return `${bar}, ${why}`;
  }
  return creature.nextUnlock === null
    ? bar
    : `${bar} · ${creature.nextUnlock.name} at ${String(creature.nextUnlock.level)}`;
}

/**
 * A creature's growth on its card: the experience bar towards the next level, one line under it (the
 * experience, and what the next level brings, "Scarf at 7"; a creature that waits says what for) and,
 * at level 10 or 20 without the ribbon, the ribbon button with its cost in materials and what is
 * missing. Everything shown is the server's: the screen computes nothing.
 */
export function CreatureProgress({
  creature,
  busy,
  onRibbon,
}: {
  creature: Creature;
  busy: boolean;
  /** Earns the ribbon the creature waits for. */
  onRibbon: (creature: Creature) => void;
}) {
  return (
    <>
      <Bar
        value={creature.expNeeded === null ? 1 : creature.exp}
        max={creature.expNeeded ?? 1}
        label={experienceLabel(creature)}
      />
      <p class="muted exp-line">
        <GlossaryTag entry="experience">{experienceLine(creature)}</GlossaryTag>
      </p>
      <RibbonLine creature={creature} busy={busy} onRibbon={onRibbon} />
    </>
  );
}

/**
 * The ribbon a creature waits for at level 10 or 20: the button with its cost in materials, a help tag
 * and what is missing. Nothing when the creature is not at a gate. The button only works when the
 * server says the ribbon is ready.
 */
export function RibbonLine({
  creature,
  busy,
  onRibbon,
}: {
  creature: Creature;
  busy: boolean;
  onRibbon: (creature: Creature) => void;
}) {
  const ribbon = creature.ribbon;
  if (ribbon === null) return null;
  const missing = ribbonBlocker(ribbon);
  return (
    <div class="ribbon-line">
      <p>
        <button
          type="button"
          class="primary"
          disabled={busy || !ribbon.ready}
          onClick={() => {
            onRibbon(creature);
          }}
        >
          {`${ribbonName(ribbon.id)} (${ribbonCostText(ribbon)})`}
        </button>
        <GlossaryTag entry="ribbon" look="help" class="ribbon-help" />
      </p>
      {missing !== null && <p class="muted">{missing}</p>}
    </div>
  );
}
