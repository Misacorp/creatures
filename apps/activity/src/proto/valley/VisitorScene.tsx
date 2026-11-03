/**
 * The visitor's stall, full screen (prototype): his open stall under the poster from Thursday to the raid's
 * finale, and his shuttered stall with a "Back Thursday" sign the rest of the week (V-VIS-1: no timer). His
 * stock and the reroll are step 3c; the main action (while he is here) is a stub for now. His stories show as
 * the place's slim strip above it.
 */
import { useMemo, useState } from 'preact/hooks';
import { ActionButton } from '../../ui/ActionButton';
import { glowNameOf, glowSceneDraw, glowSceneSpots, type PlaceSceneProps } from './glow-scene-art';
import { At, Glyph } from './parts';
import { Stub } from './PeekScenes';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK } from './valley-places';

export function VisitorScene({ onLeave, waiting, look = DEFAULT_LOOK }: PlaceSceneProps) {
  const [stub, setStub] = useState<string | null>(null);
  const here = look.visitorHere;
  const name = glowNameOf('visitor', { visitorHere: here });
  const draw = useMemo(() => glowSceneDraw({ name, time: look.time }), [name, look.time]);
  return (
    <>
      <SceneFrame
        id="visitor"
        label={here ? "Visitor's stall, weekly stall" : "Visitor's stall, shuttered until Thursday"}
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        act={
          here ? (
            <ActionButton
              label="See his stock"
              wide
              large
              onClick={() => {
                setStub("the visitor's stock and the reroll service");
              }}
            />
          ) : undefined
        }
      >
        {(g) =>
          here ? null : (
            <At
              x={g.X(g.cx)}
              y={g.Y(glowSceneSpots(g).below + 4)}
              class="pv-centred"
              hidden={false}
            >
              <span class="pv-sign pix">
                <Glyph id="moon" scale={2} />
                <span>Back Thursday</span>
              </span>
            </At>
          )
        }
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
