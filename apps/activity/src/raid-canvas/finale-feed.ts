/**
 * What the raid canvas needs of the live finale: its newest snapshot and its one input (`fire`, `hold`, `unhold`). The screen gives its own
 * (`useLiveFinaleV2`, the same data the full-screen finale reads) or the workbench gives a fixture.
 */
import type { LiveSnapshotV2 } from '../fight-v2-api';

export interface FinaleFeed {
  snapshot: LiveSnapshotV2 | null;
  busy: boolean;
  actionError: string | null;
  act: (key: string, action: 'fire' | 'hold' | 'unhold', row?: number) => void;
}
