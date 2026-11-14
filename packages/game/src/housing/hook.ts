/** The hook the reward paths call (`docs/design/housing.md` 2.2 and 3.6). Types only: the worker implements it. */
import type { Element } from '../content/schema';

export type HousingMoment =
  | { kind: 'trip'; key: string; place: string; element: Element | null; ticks: number }
  | { kind: 'scout'; key: string; place: string; element: Element | null; finds: number }
  | { kind: 'dungeon'; key: string; depth: number; cleared: boolean }
  | {
      kind: 'raid';
      key: string;
      weekId: string;
      bossId: string;
      rank: number;
      cleared: boolean;
      festival: string | null;
      /** The boss's element, when the caller knows it: picks the material table. Absent: any raid material. */
      element?: Element | null;
    }
  | { kind: 'games'; key: string; medal: 'gold' | 'silver' | 'bronze' | null };

export interface HousingHook {
  drop(userId: string, moment: HousingMoment): void;
}

export interface HouseDrop {
  materials: Record<string, number>;
  blueprint: string | null;
  stamp: string | null;
}

export interface HouseFeats {
  /** Journal entry ids found. */
  journalPages: ReadonlySet<string>;
  /** `account_stats`. */
  stats: Readonly<Record<string, number>>;
  /** Raid bosses beaten (from `house_trophies`). */
  bossesBeaten: ReadonlySet<string>;
  dungeonDepth: number;
  medals: { gold: number; silver: number; bronze: number; pins: number };
  built: ReadonlySet<string>;
  setsComplete: number;
}
