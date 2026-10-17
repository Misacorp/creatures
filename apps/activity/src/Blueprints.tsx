import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { CraftStarter } from './CraftStarter';
import { CostList, ItemFrame, ItemSprite } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { CraftPreview, GearState, ReachId } from './gear-types';
import { blueprintViews, marksText, nominalHours, slotName } from './gear-view';
import { ElementChip } from './sprites/ElementChip';

/**
 * The blueprints a player has learned, each with its well-thumbed marks, the parts a plain craft costs
 * and a Craft button that opens the craft panel (who does it, how hard to reach, the exact odds). A craft
 * takes hours; the parts and Essence are paid when it starts and the item is rolled when the job is
 * claimed.
 */
export function Blueprints({
  gear,
  creatures,
  busy,
  loadPreview,
  onCraft,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  loadPreview: (creatureId: string, blueprintId: string) => Promise<CraftPreview>;
  /** Starts the craft; resolves true when it started (the panel then closes). */
  onCraft: (baseId: string, creatureId: string, reach: ReachId, treat: boolean) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const views = blueprintViews(gear.blueprints, gear.skills);
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
                <ItemFrame rarity="common">
                  <ItemSprite baseId={bp.baseId} scale={3} />
                </ItemFrame>
                <div class="bp-text">
                  <p class="pix bp-name">{bp.name}</p>
                  <p class="tags">
                    <span class="slot-tag">{slotName(bp.slot)}</span>
                    {bp.element !== null && <ElementChip element={bp.element} />}
                  </p>
                  {bp.needsCraftingLevel > 1 && (
                    <p class="muted">Needs Crafting level {bp.needsCraftingLevel}</p>
                  )}
                  <p class="muted">
                    Takes about {nominalHours()} h ·{' '}
                    <GlossaryTag entry="well-thumbed">Well-thumbed</GlossaryTag>{' '}
                    {marksText(bp.marks)}
                  </p>
                </div>
              </div>
              <CostList cost={bp.cost} have={gear.parts} />
              {open === bp.baseId ? (
                <CraftStarter
                  id={`craft-${bp.baseId}`}
                  name={bp.name}
                  baseId={bp.baseId}
                  gear={gear}
                  creatures={creatures}
                  busy={busy}
                  loadPreview={loadPreview}
                  onStart={(creatureId, reach, treat) => {
                    void onCraft(bp.baseId, creatureId, reach, treat).then((started) => {
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
