/**
 * The School, full screen (prototype): the schoolhouse under its poster. Its inside (a creature learning a
 * talent, a visiting teacher, a Bronze graduation) is step 3d; the main action is a stub for now. Stories that
 * wait here (a talent learned, a teacher's visit, a graduation) show as the place's slim strip above it.
 */
import { useMemo, useState } from 'preact/hooks';
import { ActionButton } from '../../ui/ActionButton';
import { glowNameOf, glowSceneDraw, type PlaceSceneProps } from './glow-scene-art';
import { Stub } from './PeekScenes';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK } from './valley-places';

export function SchoolScene({ onLeave, waiting, look = DEFAULT_LOOK }: PlaceSceneProps) {
  const [stub, setStub] = useState<string | null>(null);
  const name = glowNameOf('school');
  const draw = useMemo(() => glowSceneDraw({ name, time: look.time }), [name, look.time]);
  return (
    <>
      <SceneFrame
        id="school"
        label="School, talents"
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        act={
          <ActionButton
            label="Learn a talent"
            wide
            large
            onClick={() => {
              setStub("the School: a creature's talent lessons and graduation");
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
