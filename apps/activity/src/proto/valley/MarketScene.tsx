/**
 * The Market, full screen (prototype): the shard stall under its poster. Its inside (the shard exchange, the
 * second guided project, the broker's post once built) is step 3b; the main action is a stub for now. Stories
 * that wait here (anything about the Market or its broker) show as the place's slim strip above it.
 */
import { useMemo, useState } from 'preact/hooks';
import { ActionButton } from '../../ui/ActionButton';
import { glowNameOf, glowSceneDraw, type PlaceSceneProps } from './glow-scene-art';
import { Stub } from './PeekScenes';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK } from './valley-places';

export function MarketScene({ onLeave, waiting, look = DEFAULT_LOOK }: PlaceSceneProps) {
  const [stub, setStub] = useState<string | null>(null);
  const name = glowNameOf('market');
  const draw = useMemo(() => glowSceneDraw({ name, time: look.time }), [name, look.time]);
  return (
    <>
      <SceneFrame
        id="market"
        label="Market, shards"
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        act={
          <ActionButton
            label="Trade shards"
            wide
            large
            onClick={() => {
              setStub('the Market: the shard exchange and its build project');
            }}
          />
        }
      >
        {() => null}
      </SceneFrame>
      <Stub
        what={stub}
        onClose={() => {
          setStub(null);
        }}
      />
    </>
  );
}
