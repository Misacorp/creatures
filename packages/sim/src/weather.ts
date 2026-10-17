import {
  RULES,
  createSeededRng,
  drawWeather,
  seasonOf,
  weatherDef,
  weatherStrength,
  type RaidStage,
  type Rng,
  type WeatherDay,
} from '@creatures/game';

/*
 * The valley's weather in the simulator (docs/design/gear-and-creatures-v2.md section 10). Drawing and
 * every effect are the game's own pure functions (`@creatures/game`: `drawWeather`, `weatherSheet`,
 * `tripWeather`, ...); this file only holds the sim's calendar: the days are drawn from a seeded stream
 * of their own (so a run with weather off draws what it always did, and a run with it on is exact for a
 * seed), in the order the days come, at the server's Boss Rank of the moment.
 */

/** The weather a raid week's three stages fight under; a stage left out has none. */
export type RaidWeather = Partial<Record<RaidStage, WeatherDay | null>>;

const WEEK_DAYS = 7;

/**
 * The sim's calendar of weather: one `WeatherDay` per sim day, drawn the first time it is asked for.
 * Day 0 is a Monday (the raid week starts then), and the global week index decides the Festival weeks.
 * Days must be asked for in order; the first day of a run is drawn as it starts, so it can never be a
 * wild Omen (a wild Omen is always known a day ahead), and at most one wild Omen comes in a week.
 */
export class Sky {
  private readonly rng: Rng;
  private readonly days: WeatherDay[] = [];
  private previousOmen: string | null = null;
  private wildWeek: number | null = null;

  constructor(
    seed: string,
    private readonly firstWeekIndex: number,
  ) {
    this.rng = createSeededRng(`${seed}:weather`);
  }

  /** The weather of sim day `day` at the server's rank (null: it has none yet, which counts as rank 1). */
  day(day: number, rank: number | null): WeatherDay {
    const known = this.days[day];
    if (known !== undefined) return known;
    if (day !== this.days.length) throw new RangeError('weather days are drawn in order');
    const weekIndex = this.firstWeekIndex + Math.floor(day / WEEK_DAYS);
    const draw = drawWeather(this.rng, {
      rank: rank ?? 1,
      festival: seasonOf(weekIndex).festival,
      previousOmen: this.previousOmen,
      wildAllowed: day > 0 && this.wildWeek !== weekIndex,
    });
    if (draw.wild) this.wildWeek = weekIndex;
    this.previousOmen = draw.omen;
    const drawn: WeatherDay = { day: String(day), ...draw };
    this.days.push(drawn);
    return drawn;
  }
}

/**
 * The weather of a raid week's Friday, Saturday and Sunday, drawn on their own (for the raid sweep, which
 * plays weeks without a calendar): three days in a row, no Omen twice running, at most one wild Omen, none
 * in a Festival week. Every one of them is known a day ahead, so a wild Omen may be drawn.
 */
export function weekSky(rng: Rng, rank: number, festival: boolean): Record<RaidStage, WeatherDay> {
  let previousOmen: string | null = null;
  let wild = false;
  const out: WeatherDay[] = [];
  for (const [i, stage] of (['phase1', 'phase2', 'finale'] as const).entries()) {
    const draw = drawWeather(rng, { rank, festival, previousOmen, wildAllowed: !wild });
    if (draw.wild) wild = true;
    previousOmen = draw.omen;
    out.push({ day: `${stage}:${String(i)}`, ...draw });
  }
  return {
    phase1: out[0] as WeatherDay,
    phase2: out[1] as WeatherDay,
    finale: out[2] as WeatherDay,
  };
}

/** A day with this Boon and Omen at the strength of `rank` (for studies that put a sky on a fight). */
export function forcedDay(boon: string, omen: string | null, rank: number): WeatherDay {
  const strength = weatherStrength(rank);
  const wild = omen !== null && weatherDef(omen)?.wild === true;
  return {
    day: `forced:${boon}:${omen ?? 'none'}`,
    boon,
    omen,
    wild,
    boonBp: strength.boonBp,
    // A study may name an Omen below the ranks that draw one: it counts at the first tier that has Omens.
    omenBp: strength.omenBp > 0 ? strength.omenBp : (RULES.weather.tiers[1]?.omenBp ?? 10_000),
  };
}
