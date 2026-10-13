import { GLOSSARY_IDS } from '@creatures/game';
import { useRef, useState } from 'preact/hooks';
import { bossArt } from './art';
import { bossIcons, type BossIconInfo } from './boss-icons';
import { GlossaryTag, useGlossary } from './Glossary';
import { gimmickGlyph, turnOrderGlyph } from './glyphs';
import type { RaidView } from './raid-api';
import {
  bestRankText,
  festivalBanner,
  festivalTeaser,
  rankLabel,
  readinessMeter,
  seasonPips,
  seasonText,
} from './raid-progress';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { StagePopover } from './StagePopover';
import { HpBar } from './Stage';

/** The five weeks of the season as pips: the Festival is the last one. */
function SeasonPips({ season }: { season: RaidView['season'] }) {
  const pips = seasonPips(season);
  const text = seasonText(season);
  if (pips.length === 0 || text === null) return null;
  return (
    <div class="season">
      <ol class="season-pips" aria-label={text}>
        {pips.map((pip) => (
          <li
            key={pip.week}
            class={`season-pip ${pip.state}${pip.festival ? ' festival' : ''}`}
            aria-current={pip.state === 'now' ? 'step' : undefined}
          >
            <span class="visually-hidden">{pip.label}</span>
          </li>
        ))}
      </ol>
      <p class="muted">
        <GlossaryTag entry="season">{text}</GlossaryTag>
      </p>
    </div>
  );
}

/**
 * One icon of the boss card (the turn order or a trick): a small button that opens a popover with
 * what this boss does. It looks and behaves like the glossary's popovers (same panel, same
 * dismissal) but carries the boss-specific sentence the glossary entry cannot know.
 */
function BossIcon({ icon }: { icon: BossIconInfo }) {
  const glossary = useGlossary();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const sprite = icon.kind === 'turn' ? turnOrderGlyph(icon.glyph) : gimmickGlyph(icon.glyph);
  return (
    <li class="boss-icon-item">
      <button
        ref={ref}
        type="button"
        class={open ? 'boss-icon open' : 'boss-icon'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={icon.label}
        onClick={() => {
          // One popover at a time: this closes an open glossary tag.
          glossary?.close();
          setOpen((current) => !current);
        }}
      >
        <Sprite sprite={sprite} scale={3} />
        <span class="boss-icon-caption">{icon.caption}</span>
      </button>
      {open && (
        <div class="glossary-layer">
          <StagePopover
            class="gloss-pop"
            anchor={() => ref.current}
            label={icon.title}
            onClose={() => {
              setOpen(false);
            }}
          >
            <div class="gp-body">
              <div class="gp-visual" aria-hidden="true">
                <Sprite sprite={sprite} scale={4} />
              </div>
              <p class="gp-title pix">{icon.title}</p>
              {icon.detail !== '' && <p class="gp-short">{icon.detail}</p>}
              {icon.general !== null && <p class="gp-general muted">{icon.general}</p>}
            </div>
          </StagePopover>
        </div>
      )}
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

/**
 * The boss card: the art at its full size, and beside it (below it on a phone) the name, Rank and
 * readiness, element, HP, and icons for the turn order and tricks. Details live in the popovers.
 */
export function BossCard({ view }: { view: RaidView }) {
  const { boss } = view;
  const icons = bossIcons(boss);
  const adaptation = view.party?.adaptation ?? null;
  const hp = view.party?.bossHp ?? null;
  const rank = rankLabel(view.rank);
  const banner = festivalBanner(view);
  const teaser = festivalTeaser(view);
  const readiness = view.party?.readiness ?? null;
  const best = bestRankText(view.bestRank);
  const art = bossArt(boss.id);
  const element = /^[a-z-]+$/.test(boss.element) ? boss.element : 'unknown';
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
          <h3 id="raid-boss-name" class="boss-name">
            {boss.name}
          </h3>
          <div class="boss-status">
            {rank !== null && (
              <GlossaryTag entry="boss-rank" look="chip" class="tag rank">
                {rank}
              </GlossaryTag>
            )}
            {readiness !== null && <ReadinessMeter band={readiness} />}
            <ElementChip element={boss.element} />
            {view.festival && (
              <GlossaryTag entry="festival" look="chip" class="badge festival">
                Festival week
              </GlossaryTag>
            )}
          </div>
          {hp !== null && (
            <div class="boss-hp">
              <HpBar
                current={hp.current}
                max={hp.max}
                label={`Boss HP this week: ${String(hp.current)} of ${String(hp.max)}`}
              />
              <p class="muted small">
                Boss HP this week: {hp.current} / {hp.max}
              </p>
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
      <div class="boss-foot">
        <SeasonPips season={view.season} />
        {best !== null && <p class="muted">{best}</p>}
      </div>
    </section>
  );
}
