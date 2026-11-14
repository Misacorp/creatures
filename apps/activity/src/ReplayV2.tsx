/**
 * The replay of a combat v2 stage (docs/design/combat/integration.md, section 9): the stored board events played beat by beat on the v2
 * stage (`StageV2`), by themselves like the shipped replay, with Skip and 2x. Opened from "Watch" on a stage in the Raid tab's results, and
 * from the finale's result. The log is the engine's own text, closed until asked for. Names are drawn as text only.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bossAnimSetup } from './boss-anim/setup';
import { foldSetupOf, removedPercent, stageModelOf } from './fight-v2';
import type { FightPhaseV2, ReplayViewV2 } from './fight-v2-api';
import { INTRO_LIVE_MS, STAGE_ROUND_MS, roundBudgetMs, type SpeedV2 } from './playback-v2';
import { phaseName } from './raid-text';
import { StageV2 } from './StageV2';
import { LogToggle } from './Stage';
import { DrillHead } from './ui/DrillHead';
import { onDrillKey } from './ui/drill-keys';
import { PlaybackControls } from './ui/PlaybackControls';
import { usePlaybackV2 } from './use-playback-v2';

/** The stage's name for the head of the stage and of the page: "Stage 1 / 3", "Finale". */
export const stagePlace = (phase: FightPhaseV2): string =>
  phase === 'stage1' ? 'Stage 1 / 3' : phase === 'stage2' ? 'Stage 2 / 3' : 'Finale';

/** The page of a replay of a v2 stage: the drill-in head (Back goes to the raid, so does Escape) and the stage. */
export function ReplayV2({ data, onClose }: { data: ReplayViewV2; onClose: () => void }) {
  const title = `Replay: ${phaseName(phase1Of(data.phase), 2)}`;
  return (
    <section class="raid-section" aria-label={title} onKeyDown={onDrillKey(onClose)}>
      <DrillHead title={title} onBack={onClose} backLabel="to the raid" />
      <PlayerV2 data={data} />
    </section>
  );
}

/** The raid view's name of a stage (`phase1` is stage 1 on a v2 week). */
const phase1Of = (phase: FightPhaseV2): 'phase1' | 'phase2' | 'finale' =>
  phase === 'stage1' ? 'phase1' : phase === 'stage2' ? 'phase2' : 'finale';

/** The stage of a replay, played from the start, with its controls and its log. */
export function PlayerV2({
  data,
  showControls = false,
}: {
  data: ReplayViewV2;
  showControls?: boolean;
}) {
  const setup = useMemo(
    () => foldSetupOf({ fighters: data.fighters, card: data.card, bossHpStart: data.bossHpStart }),
    [data],
  );
  const model = useMemo(() => stageModelOf(setup, data.events), [setup, data.events]);
  const [speed, setSpeed] = useState<SpeedV2>(1);
  const bossAnim = useMemo(
    () => bossAnimSetup(data.boss, data.card, data.fighters),
    [data.boss, data.card, data.fighters],
  );
  const playback = usePlaybackV2({
    model,
    events: data.events,
    rounds: data.boss.rounds,
    speed,
    // The pace of the live finale (`playback-v2.ts`): its intro, its round budget and its round length.
    introMs: INTRO_LIVE_MS,
    budgetMs: roundBudgetMs(STAGE_ROUND_MS, INTRO_LIVE_MS),
    roundMs: STAGE_ROUND_MS,
    mode: 'replay',
    bossAnim: bossAnim,
  });
  const { beat, total, finished, playing, setPlaying, move } = playback;
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [beat]);
  const shown = beat === 0 ? 0 : (model.beats[beat - 1]?.to ?? 0);
  const removed = removedPercent(data.bossHpMax, data.bossHpStart, data.bossHpEnd);

  return (
    <>
      <p>
        {data.kill
          ? `${data.boss.name} fell in this stage.`
          : `${String(removed)}% of ${data.boss.name}'s HP came off in ${String(data.rounds)} rounds.`}
      </p>
      {showControls && (
        <PlaybackControls
          label="Replay controls"
          playing={playing}
          finished={finished}
          speed={speed}
          onPlayPause={() => {
            if (finished) move(0);
            setPlaying(!playing || finished);
          }}
          onSpeed={setSpeed}
          onSkip={() => {
            setPlaying(false);
            move(total);
          }}
          skipLabel="Skip to end"
          skipDisabled={finished}
        />
      )}
      <StageV2
        boss={data.boss}
        card={data.card}
        fighters={data.fighters}
        names={data.names}
        you={data.you}
        model={model}
        playback={playback}
        place={stagePlace(data.phase)}
        hpMax={data.bossHpMax}
        rounds={data.boss.rounds}
      />
      <LogToggle id="replay-log">
        <ol class="replay-log" ref={logRef} tabIndex={0} aria-label="Fight log">
          {data.events
            .slice(0, shown)
            .map((event, i) => (event.text === '' ? null : <li key={i}>{event.text}</li>))}
        </ol>
      </LogToggle>
    </>
  );
}
