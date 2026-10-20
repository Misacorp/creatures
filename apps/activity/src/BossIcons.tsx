import { bossIcons, type BossIconInfo } from './boss-icons';
import { gimmickGlyph, turnOrderGlyph } from './glyphs';
import { usePopoverTrigger } from './PopoverHost';
import type { RaidView } from './raid-api';
import { Sprite } from './sprites/Sprite';
import { PopoverCard, popupProps } from './ui/Popover';

/**
 * One icon of a boss (the turn order or a trick): a small button that opens a popover with what this
 * boss does. It is one of the app's popovers (`PopoverHost`: the same panel, the same dismissal, one
 * open at a time) but carries the boss-specific sentence the glossary entry cannot know.
 */
function BossIcon({ icon, compact }: { icon: BossIconInfo; compact: boolean }) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  const sprite = icon.kind === 'turn' ? turnOrderGlyph(icon.glyph) : gimmickGlyph(icon.glyph);
  return (
    <li class="boss-icon-item">
      <button
        ref={ref}
        type="button"
        class={open ? 'boss-icon open' : 'boss-icon'}
        {...popupProps(open)}
        aria-label={icon.label}
        onClick={() => {
          if (ref.current === null) return;
          host?.openCustom(icon.key, ref.current, {
            label: icon.title,
            body: (
              <PopoverCard
                visual={<Sprite sprite={sprite} scale={4} />}
                title={icon.title}
                short={icon.detail}
                note={icon.general}
              />
            ),
          });
        }}
      >
        <Sprite sprite={sprite} scale={compact ? 2 : 3} />
        <span class="boss-icon-caption">{icon.caption}</span>
        {!compact && icon.newAtRank !== null && (
          <span class="boss-icon-new">New at rank {icon.newAtRank}</span>
        )}
      </button>
    </li>
  );
}

/**
 * The boss's turn order and tricks as a row of icons, each one opening its popover. The boss card and
 * the raid summary both draw them, so a move looks and explains itself the same way everywhere.
 */
export function BossIconList({
  boss,
  effectiveRank = null,
  compact = false,
}: {
  boss: Pick<RaidView['boss'], 'id' | 'turnOrder' | 'gimmicks'>;
  /** The week's rank the boss fights at, for the "New at rank" mark. */
  effectiveRank?: number | null;
  /**
   * Small tiles of one size, with no "New at rank" line (the popover leaves it out too): for a result screen,
   * where which move is new matters less than seeing the whole list at a glance. The boss card keeps the
   * line, because planning a team is where a new move matters.
   */
  compact?: boolean;
}) {
  return (
    <ul class={compact ? 'boss-icons compact' : 'boss-icons'} aria-label="How the boss fights">
      {bossIcons(boss, compact ? null : effectiveRank).map((icon) => (
        <BossIcon key={icon.key} icon={icon} compact={compact} />
      ))}
    </ul>
  );
}
