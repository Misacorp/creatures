import { Tag, LandmarkChip } from './ui/Tag';
import { RoleChip } from './sprites/ElementChip';
/**
 * The small picture of each How to play section, built only from sprites, glyphs and tags the game
 * already has (nothing is drawn from scratch), and from the content and the rules, so a picture
 * can never disagree with the game. Words that appear in a picture come from the glossary.
 */
import { Fragment } from 'preact';
import {
  GLOSSARY_IDS,
  JOB_KINDS,
  PART_KINDS,
  RULES,
  content,
  entryView,
  howToPlay,
  itemLines,
  itemOf,
  itemStats,
  statText,
  unlockLadder,
  type GlossarySection,
} from '@creatures/game';
import { bossArt, markPalette } from './art';
import { ItemFrame, ItemSprite } from './GearArt';
import { ItemCard, type ItemCardItem } from './ItemCard';
import { partIcon } from './gear-sprites';
import { GlossaryTag } from './Glossary';
import { speciesName } from './game';
import { glyphOrUnknown } from './glyphs';
import { MedalSprite, PinSprite } from './games/GamesParts';
import { streakPips } from './dungeon-text';
import {
  dungeonRooms,
  BOARD_EXAMPLE_MOVE,
  evolutionExample,
  exampleSeason,
  exampleSpecies,
  expeditionTrips,
  markExample,
  rankTrack,
  starterSpecies,
  weekStrip,
  weekendStrip,
} from './howto';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { elementIcon } from './sprites/element-icons';
import { ElementChartGrid } from './ui/ElementChartGrid';
import { PipRow } from './ui/PipRow';

/** One item of each slot (a hat, a scarf and a charm), for the Workshop picture. */
const GEAR_EXAMPLES = ['trail-cap', 'patch-scarf', 'trail-charm'] as const;

/**
 * The Gear picture's item: a fixed Rare Ember Hat at item level 8 with one line of its own ("this item") and
 * one that acts in the fight, both at tier II (index 1), the best that level allows. Built from the content by the
 * same rules as any item (nothing is rolled), so its numbers are the game's.
 */
function gearExample(): ItemCardItem {
  const item = itemOf('forge-hood', 'rare', 8, [
    { id: 'attack-local-pct', tier: 1 },
    { id: 'ember-hunter', tier: 1 },
  ]);
  return {
    baseId: item.baseId,
    slot: item.slot,
    rarity: item.rarity,
    itemLevel: item.itemLevel,
    stats: itemStats(item).map((st) => ({ ...st, text: statText(st.stat, st.value) })),
    lines: itemLines(item).map((line) => ({ ...line, active: null })),
  };
}

/**
 * What a creature's level brings, in order, for the starter that evolves (its gear slots, ribbons,
 * finale ability, evolution and talent slots), grouped by level: "Lv 10: Bronze Ribbon, Finale ability". From the
 * rules, so it moves with them.
 */
function growthSteps(): { level: number; names: string[] }[] {
  const starter = content.creatures.find((c) => c.starter && c.evolvesTo !== undefined);
  const ladder = unlockLadder(starter?.rarity ?? 'common', starter?.evolvesTo?.level);
  const steps: { level: number; names: string[] }[] = [];
  // The ladder leaves out the finale ability when a ribbon shares its level; the picture names it.
  const ability = { level: RULES.abilities.unlockLevel, name: 'Finale ability' };
  const withAbility = ladder.some((step) => step.name === 'Ability')
    ? ladder
    : [...ladder, ability];
  for (const step of [...withAbility].sort((a, b) => a.level - b.level)) {
    const name = step.name === 'Ability' ? ability.name : step.name;
    const last = steps.at(-1);
    if (last?.level === step.level) last.names.push(name);
    else steps.push({ level: step.level, names: [name] });
  }
  return steps;
}

const titleOf = (id: string): string => entryView(id)?.title ?? id;

/** A creature sprite with its name under it. */
function Figure({ species, scale = 4 }: { species: string; scale?: number }) {
  return (
    <figure class="art-figure">
      <Sprite sprite={creatureSpriteOrFallback(species)} scale={scale} />
      <figcaption class="pix">{speciesName(species)}</figcaption>
    </figure>
  );
}

function Arrow({ turn }: { turn?: 'down' | 'up' | 'back' }) {
  const glyph = glyphOrUnknown(turn === 'back' ? 'right_to_left' : 'left_to_right');
  return (
    <Sprite
      sprite={glyph}
      scale={3}
      class={turn === 'down' || turn === 'up' ? `art-arrow ${turn}` : 'art-arrow'}
    />
  );
}

/** First week: the three starters to pick from. */
function StartersArt() {
  return (
    <ul class="art-row" aria-label="The starters">
      {starterSpecies().map((s) => (
        <li key={s.id}>
          <Figure species={s.id} scale={5} />
          <p class="tags art-tags">
            <ElementChip element={s.element} role={s.role} />
          </p>
        </li>
      ))}
    </ul>
  );
}

/** One example creature for each role, with the role's chip. */
function RolesRow() {
  const roles = ['setter', 'payoff', 'guard', 'support'] as const;
  return (
    <ul class="art-row" aria-label="Roles">
      {roles.map((role) => {
        const species = exampleSpecies(role);
        return (
          <li key={role}>
            {species !== undefined && (
              <Sprite sprite={creatureSpriteOrFallback(species.id)} scale={4} />
            )}
            <RoleChip role={role} />
          </li>
        );
      })}
    </ul>
  );
}

/** Creatures: the four elements, and one example creature for each role. */
function CreaturesArt() {
  return (
    <>
      <p class="tags art-tags" aria-label="Elements">
        {content.elements.map((e) => (
          <ElementChip key={e.id} element={e.id} />
        ))}
      </p>
      <RolesRow />
      <ol class="growth-art" aria-label="What the levels bring">
        {growthSteps().map((step) => (
          <li key={step.level}>
            <span class="lvl-tag pix">Lv {step.level}</span>
            <span class="pix">{step.names.join(', ')}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** The worked example: a real Setter marks, a real creature of the right element sets it off. */
function ComboExample() {
  const { setter, payoff, title, lines } = howToPlay.example;
  const setterSpecies = content.creatures.find((c) => c.id === setter);
  const payoffSpecies = content.creatures.find((c) => c.id === payoff);
  const reaction = content.reactions.find(
    (r) => r.markElement === setterSpecies?.element && r.triggerElement === payoffSpecies?.element,
  );
  if (setterSpecies === undefined || payoffSpecies === undefined || reaction === undefined) {
    return null;
  }
  const palette = markPalette(reaction.markElement);
  const markIcon = elementIcon(reaction.markElement);
  const triggerIcon = elementIcon(reaction.triggerElement);
  return (
    <section class="example" aria-label={title}>
      <h4 class="pix">{title}</h4>
      <div class="example-steps">
        <div class="example-step">
          <Figure species={setter} />
          <Arrow />
          <span class={`example-mark el-${reaction.markElement}`}>
            <Sprite
              sprite={glyphOrUnknown('mark')}
              scale={3}
              {...(palette === undefined ? {} : { palette })}
            />
            <GlossaryTag entry={GLOSSARY_IDS.mark(reaction.markId)} class="pix">
              {reaction.markName}
            </GlossaryTag>
          </span>
        </div>
        <div class="example-step">
          <Figure species={payoff} />
          <Arrow />
          <span class={`example-burst el-${reaction.triggerElement}`}>
            {markIcon !== undefined && <Sprite sprite={markIcon} scale={2} />}
            {triggerIcon !== undefined && <Sprite sprite={triggerIcon} scale={2} />}
            <GlossaryTag entry={GLOSSARY_IDS.reaction(reaction.id)} class="pix">
              {reaction.name}!
            </GlossaryTag>
          </span>
        </div>
      </div>
      <ol class="example-lines">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </section>
  );
}

function CombosArt() {
  return (
    <>
      <ElementChartGrid />
      <ComboExample />
    </>
  );
}

/** The raid week: Monday to Sunday as four steps. */
function RaidWeekArt() {
  const bossId = content.bosses[0]?.id ?? '';
  const art = bossArt(bossId);
  const glyphs: Record<string, string> = { phase1: 'mark', phase2: 'warning', finale: 'ability' };
  return (
    <ol class="art-row week-art" aria-label="The week">
      {weekStrip().map((step) => (
        <li key={step.event}>
          {step.event === 'weekStart' ? (
            <Sprite sprite={art.sprite} scale={2} />
          ) : (
            <Sprite sprite={glyphOrUnknown(glyphs[step.event] ?? 'unknown')} scale={4} />
          )}
          <span class="pix week-day">{step.day}</span>
          <span class="muted">{step.title}</span>
        </li>
      ))}
    </ol>
  );
}

/** The live finale: a boss, a row with an ability badge and a warning, and the Auto fire tag. */
function FinaleArt() {
  const bossId = content.bosses[1]?.id ?? content.bosses[0]?.id ?? '';
  const art = bossArt(bossId);
  const row = (['setter', 'payoff', 'guard'] as const)
    .map((role) => exampleSpecies(role))
    .flatMap((s) => (s === undefined ? [] : [s]));
  return (
    <div class="finale-art">
      <div class="finale-boss">
        <Sprite sprite={art.sprite} scale={3} />
        <p class="forecast pix">
          <Sprite sprite={glyphOrUnknown('warning')} scale={2} />
          <span>{titleOf(GLOSSARY_IDS.gimmick('hit_zone'))}</span>
        </p>
      </div>
      <ul class="art-row" aria-label="Your row">
        {row.map((s, i) => (
          <li key={s.id} class="finale-unit">
            <span class="finale-unit-art">
              <Sprite sprite={creatureSpriteOrFallback(s.id)} scale={4} />
              {i === 1 && (
                <Sprite sprite={glyphOrUnknown('ability')} scale={2} class="finale-badge" />
              )}
              {i === 2 && (
                <Sprite sprite={glyphOrUnknown('reticle')} scale={2} class="finale-badge" />
              )}
            </span>
          </li>
        ))}
      </ul>
      <p class="tags art-tags">
        <Tag entry="auto-fire">{titleOf('auto-fire')}</Tag>
        <Tag entry="crit">{titleOf('crit')}</Tag>
      </p>
    </div>
  );
}

/** Expeditions: an explorer, and the three trips with a pile that grows with the hours. */
function ExpeditionsArt() {
  const orb = glyphOrUnknown('orb');
  return (
    <div class="expedition-art">
      <Figure species={RULES.catching.firstExpeditionLine} />
      <ul class="art-row trips" aria-label="Trips">
        {expeditionTrips().map((trip) => (
          <li key={trip.hours}>
            <span class="pix">{trip.hours} h</span>
            <span class="trip-catches">
              {Array.from({ length: trip.size }, (_, i) => (
                <Sprite key={i} sprite={orb} scale={2} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p class="tags art-tags">
        <Tag kind="badge" tone="shiny" entry="shiny">
          {titleOf('shiny')}
        </Tag>
        <Tag entry="fusion">{titleOf('fusion')}</Tag>
      </p>
    </div>
  );
}

/**
 * The daily dungeon: the three rooms in a row (two foes, then a floor boss) with HP carrying on
 * between them, the depth step, a landmark and the streak pips with their two bonus days.
 */
function DungeonArt() {
  const rooms = dungeonRooms();
  const pips = streakPips(0);
  return (
    <div class="dungeon-art">
      <ol class="art-row dungeon-art-rooms" aria-label="The rooms">
        {rooms.map((room, i) => (
          <Fragment key={room.id}>
            {i > 0 && (
              <li class="dungeon-art-arrow" aria-hidden="true">
                <Arrow />
              </li>
            )}
            <li>
              <Sprite sprite={bossArt(room.id).sprite} scale={room.boss ? 2 : 3} />
              <span class="pix">{room.boss ? 'Floor boss' : `Room ${String(i + 1)}`}</span>
              <span class="muted">{room.name}</span>
            </li>
          </Fragment>
        ))}
      </ol>
      <p class="tags art-tags">
        <Tag kind="chip" entry="depth">
          Depth +1
        </Tag>
        <LandmarkChip />
      </p>
      <p class="art-streak">
        <GlossaryTag entry="streak">{titleOf('streak')}</GlossaryTag>
        <PipRow
          count={pips.length}
          lit={0}
          mark={(i) => (pips[i]?.bonus === true ? 'fest' : undefined)}
          label="A streak: the 3rd and 7th day of 7 pay a bonus"
        />
      </p>
    </div>
  );
}

/** Ranks and Festivals: the season pips and the tags. */
function RanksArt() {
  const pips = exampleSeason();
  return (
    <div class="ranks-art">
      <ol class="season-pips" aria-label="A season">
        {pips.map((pip) => (
          <li
            key={pip.week}
            class={`season-pip ${pip.state}${pip.festival ? ' festival' : ''}`}
            aria-hidden="true"
          />
        ))}
      </ol>
      <p class="tags art-tags">
        <Tag tone="rank" entry="boss-rank">
          {titleOf('boss-rank')}
        </Tag>
        <Tag kind="badge" tone="festival" entry="festival">
          {titleOf('festival')}
        </Tag>
        <Tag entry="season">{titleOf('season')}</Tag>
        <Tag entry="boon">{titleOf('boon')}</Tag>
        <Tag entry="omen">{titleOf('omen')}</Tag>
      </p>
    </div>
  );
}

/** Rewards: Essence turns a creature into its evolved form. */
function RewardsArt() {
  const evolution = evolutionExample();
  return (
    <div class="rewards-art">
      {evolution !== undefined && (
        <div class="evolve-art">
          <Figure species={evolution.from} />
          <span class="evolve-cost">
            <Sprite sprite={glyphOrUnknown('gem')} scale={3} />
            <span class="pix">{evolution.essence}</span>
            <Arrow />
          </span>
          <Figure species={evolution.to} />
        </div>
      )}
      <p class="tags art-tags">
        <Tag entry="essence">{titleOf('essence')}</Tag>
        <Tag entry="bait">{titleOf('bait')}</Tag>
      </p>
    </div>
  );
}

/** Gear: one real item card (image, level and slot, name, badges, own stats, then its lines with tiers). */
function GearSectionArt() {
  return (
    <div class="gear-art">
      <ItemCard item={gearExample()} spriteScale={5} />
    </div>
  );
}

/** The Workshop: one item of each kind, the parts, and the anvil with the three jobs. */
function WorkshopArt() {
  return (
    <div class="workshop-art">
      <ul class="art-row" aria-label="Gear">
        {GEAR_EXAMPLES.map((baseId) => (
          <li key={baseId}>
            <ItemFrame rarity="rare">
              <ItemSprite baseId={baseId} scale={4} />
            </ItemFrame>
          </li>
        ))}
      </ul>
      <ul class="art-row" aria-label="Parts">
        {PART_KINDS.map((kind) => (
          <li key={kind}>
            <Sprite sprite={partIcon(kind)} scale={3} />
          </li>
        ))}
      </ul>
      <p class="tags art-tags">
        <Sprite sprite={glyphOrUnknown('anvil')} scale={2} />
        {JOB_KINDS.map((kind) => (
          <Tag key={kind} entry={GLOSSARY_IDS.job(kind)}>
            {titleOf(GLOSSARY_IDS.job(kind))}
          </Tag>
        ))}
        <Tag entry="blueprint">{titleOf('blueprint')}</Tag>
      </p>
    </div>
  );
}

/** The Valley Games: the three medals and a pin, then the words the tab uses. */
function GamesArt() {
  return (
    <div class="games-art">
      <ul class="art-row" aria-label="Medals">
        {(['gold', 'silver', 'bronze'] as const).map((medal) => (
          <li key={medal}>
            <MedalSprite medal={medal} scale={4} />
          </li>
        ))}
        <li>
          <PinSprite scale={4} />
        </li>
      </ul>
      <p class="tags art-tags">
        <Sprite sprite={glyphOrUnknown('trophy')} scale={2} />
        {['games-medals', 'games-pins', 'games-good-fit', 'games-badges', 'games-prize-stall'].map(
          (id) => (
            <Tag key={id} entry={id}>
              {titleOf(id)}
            </Tag>
          ),
        )}
      </p>
    </div>
  );
}

/** Marks and reactions (combat v2): a Setter leaves marks, the mark strip shows them with their counts, a Payoff cashes. */
function V2MarksArt() {
  const example = markExample();
  if (example === undefined) return null;
  return (
    <div class="v2-marks-art">
      <div class="example-step">
        <Figure species={example.setter} />
        <Arrow />
        <ol class="v2-mark-strip" aria-label="The mark strip">
          {example.marks.map((mark) => {
            const palette = markPalette(mark.element);
            const icon = elementIcon(mark.element);
            return (
              <li key={mark.element} class={`example-mark el-${mark.element}`}>
                <Sprite
                  sprite={glyphOrUnknown('mark')}
                  scale={3}
                  {...(palette === undefined ? {} : { palette })}
                />
                {icon !== undefined && <Sprite sprite={icon} scale={2} />}
                <span class="pix">x{mark.count}</span>
              </li>
            );
          })}
        </ol>
        <Arrow />
        <Figure species={example.payoff} />
      </div>
      <p class="tags art-tags">
        <Tag entry={GLOSSARY_IDS.keyword('Mark')}>Mark</Tag>
        <Tag entry={GLOSSARY_IDS.keyword('Reaction')}>Reaction</Tag>
      </p>
    </div>
  );
}

/** Roles and Knacks (combat v2): the four roles, and a few of the keywords a Knack's text uses, each tappable. */
function V2KnacksArt() {
  const keywords = ['Spend', 'Store', 'Taunt', 'Intercept', 'Silenced'];
  return (
    <>
      <RolesRow />
      <p class="tags art-tags" aria-label="Keywords in a Knack's text">
        {keywords.map((name) => (
          <Tag key={name} entry={GLOSSARY_IDS.keyword(name)}>
            {name}
          </Tag>
        ))}
      </p>
    </>
  );
}

const BOARD_ROWS = 3;
const BOARD_COLUMNS = 4;
/** The column the example move's shape lights. */
const BOARD_LIT_COLUMN = 2;

/**
 * The board (combat v2): a small grid of rows and columns, the boss's turn after each row, and one move's shape lit
 * with its label ("Nemesis Lance": whom it picks, then which slots it hits). A decoration; the words say the rest.
 */
function V2BoardArt() {
  const roles = ['setter', 'payoff', 'guard', 'support'] as const;
  return (
    <div class="v2-board-art">
      <ol class="v2-board" aria-label="Three rows of four slots, the boss's turn after each row">
        {Array.from({ length: BOARD_ROWS }, (_, row) => (
          <li key={row} class="v2-board-step">
            <ol class="v2-board-row" aria-label={`Row ${String(row + 1)}`}>
              {Array.from({ length: BOARD_COLUMNS }, (_, column) => {
                const species = row === 0 ? exampleSpecies(roles[column] ?? 'setter') : undefined;
                return (
                  <li
                    key={column}
                    class={`v2-slot${column === BOARD_LIT_COLUMN ? ' lit' : ''}`}
                    aria-hidden="true"
                  >
                    {species !== undefined && (
                      <Sprite sprite={creatureSpriteOrFallback(species.id)} scale={1} />
                    )}
                  </li>
                );
              })}
            </ol>
            <p class="v2-boss-turn pix">Boss</p>
          </li>
        ))}
      </ol>
      <p class="tags art-tags">
        <span class="tag pix">
          {BOARD_EXAMPLE_MOVE.target} {BOARD_EXAMPLE_MOVE.shape}
        </span>
      </p>
    </div>
  );
}

/** Armour and crits (combat v2): a hit stopped by armour (Blocked, 0), and a lucky hit (Crit). */
function V2ArmourArt() {
  return (
    <ul class="art-row v2-armour-art" aria-label="Armour and crits">
      <li>
        <Sprite sprite={glyphOrUnknown('shield')} scale={4} />
        <Tag entry={GLOSSARY_IDS.keyword('Blocked')}>Blocked</Tag>
        <span class="pix v2-hit">0</span>
      </li>
      <li>
        <Sprite sprite={glyphOrUnknown('sparkle')} scale={4} />
        <Tag entry={GLOSSARY_IDS.keyword('Crit')}>Crit</Tag>
        <span class="pix v2-hit crit">!</span>
      </li>
    </ul>
  );
}

/** The raid weekend (combat v2): stage 1, stage 2 and the live finale with their days, from the schedule. */
function V2WeekendArt() {
  const glyphs: Record<string, string> = { phase1: 'mark', phase2: 'warning', finale: 'ability' };
  return (
    <ol class="art-row week-art" aria-label="The weekend">
      {weekendStrip().map((step) => (
        <li key={step.event}>
          <Sprite sprite={glyphOrUnknown(glyphs[step.event] ?? 'unknown')} scale={4} />
          <span class="pix week-day">{step.day}</span>
          <span class="muted">{step.title}</span>
        </li>
      ))}
    </ol>
  );
}

/** The Boss Rank (combat v2): bosses in a row, the beaten ones ticked, the current one lit. */
function V2RankArt() {
  const bosses = content.bosses.slice(0, 5);
  const states = rankTrack(bosses.length);
  return (
    <ol class="art-row v2-rank-art" aria-label="The bosses in order">
      {bosses.map((boss, i) => {
        const state = states[i]?.state ?? 'later';
        const art = bossArt(boss.id);
        return (
          <li key={boss.id} class={`v2-rank-boss ${state}`}>
            <Sprite sprite={art.sprite} scale={2} />
            {state === 'beaten' && (
              <>
                <Sprite sprite={glyphOrUnknown('tick')} scale={2} class="v2-rank-tick" />
                <span class="visually-hidden">Beaten</span>
              </>
            )}
            {state === 'current' && <span class="visually-hidden">This week</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** The picture of one section. */
export function SectionArt({ id }: { id: GlossarySection }) {
  switch (id) {
    case 'first-week':
      return <StartersArt />;
    case 'creatures':
      return <CreaturesArt />;
    case 'combos':
      return <CombosArt />;
    case 'raid-week':
      return <RaidWeekArt />;
    case 'finale':
      return <FinaleArt />;
    case 'expeditions':
      return <ExpeditionsArt />;
    case 'dungeon':
      return <DungeonArt />;
    case 'ranks':
      return <RanksArt />;
    case 'rewards':
      return <RewardsArt />;
    case 'gear':
      return <GearSectionArt />;
    case 'v2-marks':
      return <V2MarksArt />;
    case 'v2-knacks':
      return <V2KnacksArt />;
    case 'v2-board':
      return <V2BoardArt />;
    case 'v2-armour':
      return <V2ArmourArt />;
    case 'v2-weekend':
      return <V2WeekendArt />;
    case 'v2-rank':
      return <V2RankArt />;
    case 'workshop':
      return <WorkshopArt />;
    case 'games':
      return <GamesArt />;
  }
}
