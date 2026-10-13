import { GLOSSARY_IDS } from '@creatures/game';
import { bossArt } from './art';
import { GlossaryTag } from './Glossary';
import { gimmickGlyph, turnOrderGlyph } from './glyphs';
import type { RaidView } from './raid-api';
import {
  READINESS_HINT,
  bestRankText,
  festivalBanner,
  festivalTeaser,
  rankLabel,
  readinessLabel,
  seasonPips,
  seasonText,
} from './raid-progress';
import { countdownText, scheduleSteps } from './raid-time';
import { HpBar } from './Stage';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { gimmickLines, turnOrderShort, turnOrderText } from './raid-text';

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

export function BossCard({ view }: { view: RaidView }) {
  const { boss } = view;
  const gimmicks = gimmickLines(boss.id, boss.gimmicks);
  const adaptation = view.party?.adaptation ?? null;
  const hp = view.party?.bossHp ?? null;
  const rank = rankLabel(view.rank);
  const banner = festivalBanner(view);
  const teaser = festivalTeaser(view);
  const band = readinessLabel(view.party?.readiness ?? null);
  const best = bestRankText(view.bestRank);
  const art = bossArt(boss.id);
  return (
    <section
      class={view.festival ? 'raid-section festival' : 'raid-section'}
      aria-labelledby="raid-boss-name"
    >
      <div class="boss">
        <div class="portrait boss-portrait">
          <Sprite sprite={art.sprite} scale={art.scale} alt={boss.name} bob />
        </div>
        <div class="boss-meta">
          <h3 id="raid-boss-name">{boss.name}</h3>
          <p class="tags">
            {rank !== null && (
              <GlossaryTag entry="boss-rank" look="chip" class="tag rank">
                {rank}
              </GlossaryTag>
            )}
            {view.festival && (
              <GlossaryTag entry="festival" look="chip" class="badge festival">
                Festival week
              </GlossaryTag>
            )}
            <ElementChip element={boss.element} />
            <GlossaryTag
              entry={GLOSSARY_IDS.turnOrder(boss.turnOrder)}
              look="chip"
              class="chip"
              label={turnOrderText(boss.turnOrder)}
            >
              <Sprite sprite={turnOrderGlyph(boss.turnOrder)} scale={2} />
              <span class="chip-text">{turnOrderShort(boss.turnOrder)}</span>
            </GlossaryTag>
          </p>
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
        </div>
      </div>
      {banner !== null && <p class="festival-banner">{banner}</p>}
      {teaser !== null && <p class="muted">{teaser}</p>}
      <SeasonPips season={view.season} />
      {band !== null && view.party?.readiness != null && (
        <p class="readiness">
          <GlossaryTag
            entry={GLOSSARY_IDS.readiness(view.party.readiness)}
            look="chip"
            class={`readiness-band ${view.party.readiness}`}
          >
            {band}
          </GlossaryTag>{' '}
          <span class="muted">{READINESS_HINT}</span>
        </p>
      )}
      {best !== null && <p class="muted">{best}</p>}
      {gimmicks.length > 0 && (
        <>
          <h4>Tricks</h4>
          <ul class="gimmicks">
            {gimmicks.map((g) => (
              <li key={g.id} class="gimmick">
                {g.op === null ? (
                  <Sprite sprite={gimmickGlyph('')} scale={3} />
                ) : (
                  <GlossaryTag
                    entry={GLOSSARY_IDS.gimmick(g.op)}
                    look="chip"
                    class="gimmick-tag"
                    label={`${g.name}: what does this trick do?`}
                  >
                    <Sprite sprite={gimmickGlyph(g.op)} scale={3} />
                  </GlossaryTag>
                )}
                <span class="gimmick-text">
                  {g.op === null ? (
                    <strong class="pix">{g.name}</strong>
                  ) : (
                    <GlossaryTag entry={GLOSSARY_IDS.gimmick(g.op)}>
                      <strong class="pix">{g.name}</strong>
                    </GlossaryTag>
                  )}
                  {g.short !== '' && <span class="muted"> {g.short}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <details class="about">
        <summary>How the boss fights</summary>
        <p>{turnOrderText(boss.turnOrder)}</p>
        {gimmicks.length > 0 && (
          <ul class="plain-list">
            {gimmicks.map((g) => (
              <li key={g.id}>
                <strong>{g.name}</strong>
                {g.text !== '' && <> {g.text}</>}
              </li>
            ))}
          </ul>
        )}
      </details>
      <h4>
        <GlossaryTag entry="adaptation">Phase 2 counter-move</GlossaryTag>
      </h4>
      {adaptation === null ? (
        <p class="muted">The boss shows its counter-move after Phase 1.</p>
      ) : (
        <p>{adaptation.description}</p>
      )}
    </section>
  );
}

export function ScheduleStrip({ view, serverNow }: { view: RaidView; serverNow: number }) {
  const steps = scheduleSteps(view.schedule, view.next, view.timezone);
  return (
    <section class="raid-section" aria-labelledby="raid-schedule-heading">
      <h3 id="raid-schedule-heading">This week</h3>
      <ol class="schedule">
        {steps.map((step) => (
          <li
            key={step.event}
            class={`schedule-step ${step.state}`}
            aria-current={step.state === 'next' ? 'step' : undefined}
          >
            <span class="schedule-title">{step.title}</span>
            <span class="schedule-when">{step.when}</span>
          </li>
        ))}
      </ol>
      <p aria-live="off">{countdownText(view.next, serverNow)}</p>
      <p class="muted">Times are in {view.timezone}.</p>
    </section>
  );
}

export function Roster({
  view,
  busy,
  onOptOut,
}: {
  view: RaidView;
  busy: boolean;
  onOptOut: (optOut: boolean) => void;
}) {
  const { you } = view;
  return (
    <section class="raid-section" aria-labelledby="raid-roster-heading">
      <h3 id="raid-roster-heading">Who is in this week ({view.roster.length})</h3>
      {view.roster.length === 0 ? (
        <p class="muted">Nobody yet.</p>
      ) : (
        <ul class="roster">
          {view.roster.map((entry, index) => (
            <li key={index} class={entry.you ? 'roster-entry you' : 'roster-entry'}>
              {entry.displayName}
              {entry.you && <span class="badge you-badge">you</span>}
              {view.parties.length > 1 && <span class="muted"> party {entry.party}</span>}
            </li>
          ))}
        </ul>
      )}
      {!you.inRoster && !you.optOut && (
        <p class="muted">
          You are not on this week&apos;s roster. Pick a starter and open the game to join.
        </p>
      )}
      {you.canOptOut && (
        <p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onOptOut(!you.optOut);
            }}
          >
            {you.optOut ? "Join this week's raid" : 'Sit this week out'}
          </button>
        </p>
      )}
      {you.optOut && <p class="muted">You are sitting this week out.</p>}
    </section>
  );
}
