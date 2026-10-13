import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { CostList, ItemFrame, ItemSprite, RarityTag } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { GearState } from './gear-types';
import { blueprintViews, nominalHours } from './gear-view';
import { JobStarter } from './JobStarter';
import { ElementChip } from './sprites/ElementChip';

/**
 * The blueprints a player has learned, each with the parts a craft costs and a Craft button that
 * opens the creature picker. A craft takes hours; the parts are paid when it starts and the item
 * is rolled when the job is claimed.
 */
export function Blueprints({
  gear,
  creatures,
  busy,
  onCraft,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  /** Starts the craft; resolves true when it started (the picker then closes). */
  onCraft: (baseId: string, creatureId: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const views = blueprintViews(gear.blueprints);
  return (
    <section class="ws-section" aria-labelledby="ws-blueprints">
      <h3 id="ws-blueprints">
        Blueprints <GlossaryTag entry="blueprint" look="help" />
      </h3>
      {views.length === 0 ? (
        <p class="empty muted">
          You do not know any blueprints yet. Expeditions and raids can bring one home.
        </p>
      ) : (
        <ul class="blueprints">
          {views.map((bp) => (
            <li key={bp.baseId} class="blueprint card-item">
              <div class="bp-row">
                <ItemFrame rarity={bp.rarity}>
                  <ItemSprite baseId={bp.baseId} scale={3} />
                </ItemFrame>
                <div class="bp-text">
                  <p class="pix bp-name">{bp.name}</p>
                  <p class="tags">
                    <RarityTag rarity={bp.rarity} />
                    {bp.tint !== null && <ElementChip element={bp.tint} />}
                  </p>
                  <p class="muted">Takes about {nominalHours('craft', bp.rarity)} h</p>
                </div>
              </div>
              <CostList cost={bp.cost} have={gear.parts} />
              {open === bp.baseId ? (
                <JobStarter
                  id={`craft-${bp.baseId}`}
                  kind="craft"
                  title={`Craft ${bp.name}`}
                  rarity={bp.rarity}
                  cost={bp.cost}
                  gear={gear}
                  creatures={creatures}
                  busy={busy}
                  startLabel="Start crafting"
                  onStart={(creatureId) => {
                    void onCraft(bp.baseId, creatureId).then((started) => {
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
                    onClick={() => {
                      setOpen(bp.baseId);
                    }}
                  >
                    Craft
                  </button>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
