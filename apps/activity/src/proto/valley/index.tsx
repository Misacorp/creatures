/**
 * Direction 1, "the valley is the menu" (prototype, dev only): the game is one pixel valley; places are
 * buildings, what needs you is a speech bubble on a building, and going in zooms into the building, where
 * its activity happens inside the scene. No dock, rail or pages.
 */
import { registerProto } from '../registry';
import { TOUR_STEPS } from '../tour';
import './valley.css';
import './valley-scenes.css';
import { Valley } from './Valley';

registerProto({
  id: 'valley',
  title: 'The valley is the menu',
  steps: TOUR_STEPS.map(({ id, title }) => ({ id, title })),
  render: ({ step, setStep }) => <Valley step={step} setStep={setStep} />,
});
