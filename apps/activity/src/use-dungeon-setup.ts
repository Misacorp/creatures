import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Creature } from './api';
import { fetchDungeonPreview } from './dungeon-api';
import { pruneSlots, sameSlots, setupTeam, type Slots } from './dungeon-team';
import type { DungeonPreview, DungeonToday } from './dungeon-types';
import { toPickerCreature } from './roster-picker';
import type { PreviewStatusName } from './use-job-preview';
import { useDungeonDraft } from './use-dungeon-draft';

/**
 * The state of the pre-run card that does not depend on how it is drawn, shared by the page (`DungeonSetup`) and the Cave canvas
 * (`cave-canvas/CaveCanvas`): the team row (the session's draft, else the server's, else the last team, else the strongest three; every
 * change kept, reported and saved a moment later; creatures that left the collection dropped), and on combat v2 the depth to play
 * with the map of a depth below the player's own.
 */
export function useDungeonSetup({
  today,
  creatures,
  draft,
  onDraftChange,
  saveDraft,
  loadPreview,
  initialDepth,
}: {
  today: DungeonToday;
  creatures: readonly Creature[];
  /** The row of this session, kept by the game while the player was on another tab (null: none yet). */
  draft: Slots | null;
  onDraftChange: (slots: Slots) => void;
  saveDraft?: ((team: Slots) => Promise<unknown>) | undefined;
  /** Combat v2: the pre-run map at a depth below the player's own. Absent: the real request. */
  loadPreview?: ((depth: number) => Promise<DungeonPreview>) | undefined;
  /** The depth the picker starts on (the workbench's); absent: the player's own. */
  initialDepth?: number | undefined;
}) {
  const pickable = useMemo(() => creatures.map(toPickerCreature), [creatures]);
  const saver = useDungeonDraft(saveDraft);
  // Combat v2: the depth to play, any the player has unlocked (1 to their own, `today.depth`); their own to begin with.
  const own = today.depth;
  const pickDepth = today.rules === 2 && own >= 2;
  // `null` is "my own depth", whatever it is when the card is used: a card left open while the depth moves on then
  // starts the new own depth, never a lower run by surprise.
  const [pick, setPick] = useState<number | null>(initialDepth ?? null);
  const depth = pickDepth && pick !== null ? Math.min(Math.max(1, pick), own) : own;
  const [preview, setPreview] = useState<DungeonPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatusName>('idle');
  // A depth below their own shows that depth's map and floor boss. Until the answer is in (or if it fails) the card
  // says so under the picker and does not show the own depth's map as if it were the picked depth's.
  useEffect(() => {
    if (!pickDepth || depth >= own) {
      setPreview(null);
      setPreviewStatus('idle');
      return undefined;
    }
    let live = true;
    setPreview(null);
    setPreviewStatus('loading');
    (loadPreview ?? ((d: number) => fetchDungeonPreview(d)))(depth).then(
      (answer) => {
        if (!live) return;
        setPreview(answer);
        setPreviewStatus('ready');
      },
      () => {
        if (!live) return;
        setPreview(null);
        setPreviewStatus('failed');
      },
    );
    return () => {
      live = false;
    };
  }, [pickDepth, depth, own]);
  const shownToday: DungeonToday =
    preview !== null && preview.depth === depth && depth < own
      ? {
          ...today,
          depth,
          landmark: preview.landmark,
          landmarkBoss: preview.landmarkBoss,
          map: preview.map,
        }
      : pickDepth && depth < own
        ? // The picked depth's map is not here yet (or failed): draw no map rather than the own depth's.
          { ...today, depth, landmark: false, landmarkBoss: null, map: null }
        : today;
  const [slots, setSlots] = useState<Slots>(() =>
    setupTeam({
      memory: draft,
      saved: today.draftTeam,
      lastTeam: today.lastTeam,
      creatures: pickable,
    }),
  );

  /** A change of the row by the player (or by the collection): keep it, report it and save it soon. */
  function change(next: Slots): void {
    setSlots(next);
    onDraftChange(next);
    saver.change(next);
  }

  // The collection can change under the screen (a refresh after another tab): drop creatures that are gone.
  const owned = creatures.map((c) => c.id);
  useEffect(() => {
    const pruned = pruneSlots(slots, owned);
    if (!sameSlots(pruned, slots)) change(pruned);
  }, [owned.join(',')]);

  return {
    pickable,
    saver,
    slots,
    change,
    own,
    pickDepth,
    depth,
    setPick,
    previewStatus,
    shownToday,
  };
}
