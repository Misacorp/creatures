/**
 * The bonfire, full screen (prototype): the communal fire in its ring under its poster, grown into the grand
 * hearth from place level 2. Its inside (resting creatures, a small moment, the hearth project) is step 3d; the
 * main action is a stub for now. Stories that wait here (a resting creature's small moment, the bonfire's growth)
 * show as the place's slim strip above it.
 */
import { useMemo, useState } from 'preact/hooks';
import { ActionButton } from '../../ui/ActionButton';
import { glowNameOf, glowSceneDraw, type PlaceSceneProps } from './glow-scene-art';
import { Stub } from './PeekScenes';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK } from './valley-places';

export function BonfireScene({ onLeave, waiting, look = DEFAULT_LOOK }: PlaceSceneProps) {
  const [stub, setStub] = useState<string | null>(null);
  const name = glowNameOf('bonfire', { bonfireLevel: look.bonfireLevel });
  const draw = useMemo(() => glowSceneDraw({ name, time: look.time }), [name, look.time]);
  return (
    <>
      <SceneFrame
        id="bonfire"
        label="Bonfire, resting creatures"
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        act={
          <ActionButton
            label="Sit by the fire"
            wide
            large
            onClick={() => {
              setStub('the bonfire: your resting creatures and the hearth project');
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
