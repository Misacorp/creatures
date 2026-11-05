/**
 * The one thing pinned at the bottom of every place (the convention for `SceneFrame`'s `act`): every place has
 * one. When something needs you it is the place's next real step, the shared gold `ActionButton` (wide, large).
 * When nothing needs you it is a calm line of cream paper, which reads as news and not as a
 * disabled or dark button ("The fire is lit"). A check mark before it is opt-in (`mark`) and only for a line that says something is finished: a check means done. Pass `calm` for the second, `label` for the first; never a
 * disabled action as the resting state.
 */
import { ActionButton } from '../ui/ActionButton';
import { Glyph } from './parts';

export function PinnedAct({
  label,
  detail,
  onClick,
  calm,
  mark = false,
}: {
  /** The next step, in the button's words. */
  label?: string;
  detail?: string | undefined;
  onClick?: () => void;
  /** Nothing needs you: the calm line instead of a button. */
  calm?: string;
  /** A check mark before the calm line: off by default, on only where the line says something is finished. */
  mark?: boolean;
}) {
  if (calm !== undefined) {
    return (
      <p class="vy-calm" role="status">
        {mark && <Glyph id="check" scale={2} />}
        <span>{calm}</span>
      </p>
    );
  }
  return (
    <ActionButton
      label={label ?? ''}
      detail={detail}
      wide
      large
      onClick={onClick ?? (() => undefined)}
    />
  );
}
