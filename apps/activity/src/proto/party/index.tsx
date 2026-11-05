/**
 * Direction 2, "your creatures run the show": a clearing of stations over a camp of creatures. Every
 * action starts from a creature (pick it up, the places that can take it light up, put it there).
 */
import { registerProto } from '../registry';
import { TOUR_STEPS } from '../tour';
import { PartyScreen } from './PartyScreen';

registerProto({
  id: 'party',
  title: 'Your creatures run the show',
  steps: TOUR_STEPS.map(({ id, title }) => ({ id, title })),
  render: ({ step }) => <PartyScreen step={step} />,
});
