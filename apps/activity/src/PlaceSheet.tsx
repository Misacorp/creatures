import { PlaceFlow, type PlaceFlowProps } from './PlaceFlow';
import { Drawer } from './ui/Drawer';

export type { PlaceMode as SheetMode } from './PlaceFlow';

export interface PlaceSheetProps extends Omit<PlaceFlowProps, 'frame'> {
  /** The control that opened the sheet, which gets the focus back on close. */
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
}

/**
 * A place on the phone map, as a bottom sheet (`PlaceFlow` in a `ui/Drawer`): the place, then the send
 * wizard or the push-on choice as drill-ins in the same sheet. After a send that started the caller closes
 * it.
 */
export function PlaceSheet({ returnFocusTo, onClose, ...props }: PlaceSheetProps) {
  return (
    <PlaceFlow
      {...props}
      frame={({ title, body, footer }) => (
        <Drawer
          open
          onClose={onClose}
          title={title}
          returnFocusTo={returnFocusTo}
          class="place-sheet"
          footer={footer}
        >
          {body}
        </Drawer>
      )}
    />
  );
}
