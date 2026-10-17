import { Tag } from './ui/Tag';
import { GLOSSARY_IDS } from '@creatures/game';
import { bossArt, elementSlug } from './art';
import { bossIcons, type BossIconInfo } from './boss-icons';
import { GlossaryTag } from './Glossary';
import { usePopoverTrigger } from './PopoverHost';
import { gimmickGlyph, turnOrderGlyph } from './glyphs';
import type { RaidView } from './raid-api';
import {
  bestRankText,
  festivalBanner,
  bossHpWords,
  festivalTeaser,
  rankLabel,
  readinessMeter,
  winPaysText,
} from './raid-progress';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { PopoverCard, popupProps } from './ui/Popover';
import { PixelHeading } from './ui/PixelHeading';
import { SkyLine } from './SkyLine';
import type { Forecast } from './weather-types';
import { eventTitle } from './raid-time';
import { SegmentBar } from './ui/SegmentBar';

/**
 * One icon of the boss card (the turn order or a trick): a small button that opens a popover with
 * what this boss does. It is one of the app's popovers (`PopoverHost`: the same panel, the same
 * dismissal, one open at a time) but carries the boss-specific sentence the glossary entry cannot
 * know.
 */
function BossIcon({ icon }: { icon: BossIconInfo }) {
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
        <Sprite sprite={sprite} scale={3} />
        <span class="boss-icon-caption">{icon.caption}</span>
        {icon.newAtRank !== null && <span class="boss-icon-new">New at rank {icon.newAtRank}</span>}
      </button>
    </li>
  );
}

/** The readiness band next to the Rank: four small steps and the word, never a number. */
function ReadinessMeter({
  band,
}: {
  band: NonNullable<NonNullable<RaidView['party']>['readiness']>;
}) {
  const meter = readinessMeter(band);
  if (meter === null) return null;
  return (
    <GlossaryTag
      entry={GLOSSARY_IDS.readiness(meter.band)}
      look="chip"
      class={`readiness-meter ${meter.band}`}
      label={`How ready your team looks: ${meter.word}. What does this mean?`}
    >
      <span class="rm-pips" aria-hidden="true">
        {Array.from({ length: meter.total }, (_, i) => (
          <i key={i} class={i < meter.filled ? 'on' : undefined} />
        ))}
      </span>
      <span class="rm-word">{meter.word}</span>
    </GlossaryTag>
  );
}

/** The next stage of the week (a Phase or the Finale): its time and name, for the sky line. Null before Phase 1 and after the Finale. */
function nextStage(view: RaidView): { at: number; name: string } | null {
  const next = view.next;
  if (next === null || next.event === 'weekStart') return null;
  return { at: next.at, name: eventTitle(next.event) };
}

/**
 * The boss card: the art at its full size, and beside it (below it on a phone) the name, Rank and
 * readiness, element, this week's HP (a bar with the numbers on it), and icons for the turn order
 * and tricks. Details live in the popovers. What is not about the boss lives elsewhere: the season
 * in the "This week" section, the player count in the Raid Roster.
 */
export function BossCard({
  view,
  forecast = null,
}: {
  view: RaidView;
  /** The valley's sky, for the one line under the win text (absent or null: none). */
  forecast?: Forecast | null;
}) {
  const { boss } = view;
  const icons = bossIcons(boss, view.effectiveRank);
  const adaptation = view.party?.adaptation ?? null;
  const hp = view.party?.bossHp ?? null;
  const rank = rankLabel(view.rank);
  const banner = festivalBanner(view);
  const teaser = festivalTeaser(view);
  const readiness = view.party?.readiness ?? null;
  const best = bestRankText(view.bestRank);
  const art = bossArt(boss.id);
  const element = elementSlug(boss.element);
  return (
    <section
      class={`raid-section boss-card el-${element}${view.festival ? ' festival' : ''}`}
      aria-labelledby="raid-boss-name"
    >
      <div class="boss">
        <div class="portrait boss-portrait">
          <Sprite sprite={art.sprite} scale={art.scale} alt={boss.name} bob />
        </div>
        <div class="boss-meta">
          <PixelHeading
            as="h3"
            outline="element-drop"
            size="m"
            id="raid-boss-name"
            class="boss-name"
          >
            {boss.name}
          </PixelHeading>
          <div class="boss-status">
            {rank !== null && (
              <Tag tone="rank" entry="boss-rank">
                {rank}
              </Tag>
            )}
            {readiness !== null && <ReadinessMeter band={readiness} />}
            <ElementChip element={boss.element} />
            {view.festival && (
              <Tag kind="badge" tone="festival" entry="festival">
                Festival week
              </Tag>
            )}
          </div>
          {hp !== null && (
            <div class="boss-hp">
              <SegmentBar
                size="boss"
                current={hp.current}
                max={hp.max}
                {...bossHpWords(hp.current, hp.max)}
              />
            </div>
          )}
          <ul class="boss-icons" aria-label="How the boss fights">
            {icons.map((icon) => (
              <BossIcon key={icon.key} icon={icon} />
            ))}
          </ul>
        </div>
      </div>
      {banner !== null && <p class="festival-banner">{banner}</p>}
      {teaser !== null && <p class="muted">{teaser}</p>}
      <p class="boss-pays">{winPaysText(view)}</p>
      <SkyLine forecast={forecast} stage={nextStage(view)} />
      <p class="counter-move">
        <GlossaryTag entry="adaptation">
          <strong class="pix">Phase 2 counter-move</strong>
        </GlossaryTag>
        {': '}
        {adaptation === null ? (
          <span class="muted">shown after Phase 1.</span>
        ) : (
          <span>{adaptation.description}</span>
        )}
      </p>
      {best !== null && <p class="muted boss-foot">{best}</p>}
    </section>
  );
}
