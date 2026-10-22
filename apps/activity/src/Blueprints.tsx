import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { craftJob } from './craft-job';
import { CostList, ItemFrame, ItemSprite } from './GearArt';
import { GlossaryTag } from './Glossary';
import { JobDrawer } from './JobWizard';
import type { CraftPreview, GearState, ReachId } from './gear-types';
import {
  blueprintViews,
  marksText,
  nominalDurationCountItem,
  nominalHours,
  slotName,
} from './gear-view';
import { ElementChip } from './sprites/ElementChip';
import { CountBadge } from './ui/CountBadge';

/**
 * The blueprints a player has learned, each with its quality, the parts a plain craft costs
 * and a Craft button that opens the job drawer (who does it, how hard to reach with the exact odds, ready). A craft
 * takes hours; the parts and Essence are paid when it starts and the item is rolled when the job is
 * claimed.
 */
export function Blueprints({
  gear,
  creatures,
  busy,
  error = null,
  loadPreview,
  onCraft,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  /** The server's last error; the open craft's drawer shows it after a start that failed. */
  error?: string | null;
  loadPreview: (creatureId: string, blueprintId: string) => Promise<CraftPreview>;
  /** Starts the craft; resolves true when it started (the drawer then closes). */
  onCraft: (baseId: string, creatureId: string, reach: ReachId, treat: boolean) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<{ baseId: string; opener: HTMLElement | null } | null>(null);
  const views = blueprintViews(gear.blueprints, gear.skills);
  const opened = views.find((v) => v.baseId === open?.baseId);
  const job = opened === undefined ? null : craftJob(opened, gear, { load: loadPreview }, onCraft);
  return (
    <section class="ws-section" aria-labelledby="ws-blueprints">
      <h3 id="ws-blueprints">
        Blueprints <GlossaryTag entry="blueprint" look="help" />
      </h3>
      {views.length === 0 ? (
        <p class="empty muted">No blueprints yet.</p>
      ) : (
        <ul class="stack-list">
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
                    {bp.element !== null && <ElementChip element={bp.element} context="gear" />}
                  </p>
                  {bp.needsCraftingLevel > 1 && (
                    <p class="muted">Needs Crafting level {bp.needsCraftingLevel}</p>
                  )}
                  <p class="bp-meta muted">
                    <CountBadge {...nominalDurationCountItem(nominalHours() * 3_600_000)} />
                    <span>
                      <GlossaryTag entry="blueprint-quality">Quality</GlossaryTag>{' '}
                      {marksText(bp.marks)}
                    </span>
                  </p>
                </div>
              </div>
              <CostList cost={bp.cost} have={gear.parts} />
              <p>
                <button
                  type="button"
                  onClick={(event) => {
                    setOpen({ baseId: bp.baseId, opener: event.currentTarget });
                  }}
                >
                  Craft
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}
      {job !== null && open !== null && (
        <JobDrawer
          {...job}
          gear={gear}
          creatures={creatures}
          busy={busy}
          error={error}
          returnFocusTo={open.opener}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}
