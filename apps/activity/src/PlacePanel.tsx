import type { ComponentChildren } from 'preact';
import { PlaceFlow, type PlaceFlowProps } from './PlaceFlow';
import { onDrillKey } from './ui/drill-keys';
import { SidePanel } from './ui/SidePanel';

const TITLE_ID = 'place-panel-title';
/** The id of the trip result's heading (it names the panel while the result shows). */
const RESULT_ID = 'trip-result-heading';

export interface PlacePanelProps extends Omit<PlaceFlowProps, 'frame' | 'destination'> {
  /** The chosen place's id; null with a reveal and no place. */
  destination: string | null;
  /** The claimed trip's reveal card; it replaces everything else in the panel while it shows. */
  reveal: ComponentChildren | null;
  /** The X (and Escape on the place): the panel goes and the map is full width again. */
  onClose: () => void;
}

/**
 * The desktop side panel of the world map (the shared `ui/SidePanel`, about 24 rem, next to the map), shown only while a place is
 * chosen or a claimed trip's reveal shows. It is the phone sheet's flow (`PlaceFlow`) in a panel instead of
 * a drawer: the place with "Send an explorer here", then the send wizard (Who goes, Pack up, Ready) and
 * the push-on choice as drill-ins, with the gold button pinned at the bottom. A pixel X in the heading
 * closes it, as does Escape on the place itself (in a drill-in Escape goes one step back). It never takes
 * the focus by itself: choosing a place on the map is announced by the page's live region.
 */
export function PlacePanel({ reveal, onClose, destination, ...props }: PlacePanelProps) {
  if (reveal !== null || destination === null) {
    return (
      <SidePanel class="place-panel reveal" labelledBy={RESULT_ID}>
        {reveal}
      </SidePanel>
    );
  }
  return (
    <PlaceFlow
      key={destination}
      {...props}
      destination={destination}
      frame={({ title, body, footer }) => (
        <SidePanel
          class="place-panel"
          title={title}
          titleId={TITLE_ID}
          onClose={onClose}
          footer={footer}
          onKeyDown={onDrillKey(onClose)}
        >
          {body}
        </SidePanel>
      )}
    />
  );
}
