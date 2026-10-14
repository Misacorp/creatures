import { Tag } from './ui/Tag';
import { supplyDef } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { supplyEntry } from './ExpeditionIcons';
import { CostList } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { GearState } from './gear-types';
import { supplyCraftViews, supplyDurationFor, supplyLevelBlocker } from './gear-view';
import { capitalize } from './game';
import { glyphOrUnknown } from './glyphs';
import { JobStarter } from './JobStarter';
import { Sprite } from './sprites/Sprite';
import { formatDuration } from './time-format';
import { kindName, supplyEffect } from './trip-view';

/**
 * Supply crafting in the Workshop: every supply of the game with what it does, what a craft costs, the
 * Crafting level a creature needs (and the reason shown when none of yours has it yet) and how many are
 * in stock. Crafting opens the same creature picker as gear jobs; the supplies go into the stock when the
 * job is claimed.
 */
export function SupplyCrafting({
  gear,
  creatures,
  stock,
  busy,
  onCraft,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  /** Supplies in stock (the state's `supplies`). */
  stock: Readonly<Record<string, number>>;
  busy: boolean;
  /** Starts the craft; resolves true when it started (the picker then closes). */
  onCraft: (supplyId: string, creatureId: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const views = supplyCraftViews(stock);
  return (
    <section class="ws-section" aria-labelledby="ws-supplies">
      <h3 id="ws-supplies">
        Supplies <GlossaryTag entry="supplies" look="help" />
      </h3>
      <p class="muted">
        Supplies boost one expedition. Craft them here from parts, or buy them with Bait when you
        send a trip.
      </p>
      <ul class="supply-crafts">
        {views.map((view) => {
          const blocker = supplyLevelBlocker(view.level, gear.skills, creatures);
          const def = supplyDef(view.id);
          return (
            <li key={view.id} class="supply-craft card-item">
              <div class="bp-row">
                <span class="supply-icon">
                  <Sprite sprite={glyphOrUnknown(view.kind)} scale={4} />
                </span>
                <div class="bp-text">
                  <p class="pix bp-name">{view.name}</p>
                  <p class="tags">
                    <Tag entry={supplyEntry(view.kind)}>{kindName(view.kind)}</Tag>
                    <Tag>{capitalize(view.tier)}</Tag>
                  </p>
                  {def !== undefined && <p class="muted">{supplyEffect(def)}</p>}
                  <p class="muted">
                    In stock: {view.owned} · makes {view.yieldCount} · about{' '}
                    {formatDuration(supplyDurationFor(view.id, 1))}
                  </p>
                </div>
              </div>
              <CostList cost={view.cost} have={gear.parts} />
              {blocker !== null && <p class="reason">{blocker}</p>}
              {open === view.id ? (
                <JobStarter
                  id={`supply-${view.id}`}
                  kind="supply"
                  title={`Craft ${view.name}`}
                  rarity="common"
                  cost={view.cost}
                  gear={gear}
                  creatures={creatures}
                  busy={busy}
                  startLabel="Start crafting"
                  minLevel={view.level}
                  durationAtLevel={(level) => supplyDurationFor(view.id, level)}
                  extraBlocker={blocker}
                  onStart={(creatureId) => {
                    void onCraft(view.id, creatureId).then((started) => {
                      if (started) setOpen(null);
                    });
                  }}
                  onCancel={() => {
                    setOpen(null);
                  }}
                />
              ) : (
                <p>
                  <button
                    type="button"
                    disabled={blocker !== null}
                    onClick={() => {
                      setOpen(view.id);
                    }}
                  >
                    Craft
                  </button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
