import './nav-mockups.css';
import { useMediaQuery } from '../../hooks';
import type { Tab } from '../../tabs';
import { WIDE_QUERY } from '../../ui/wide-layout';
import { Option1Dock } from './Option1Dock';
import { Option2Valley } from './Option2Valley';
import { Option3Groups } from './Option3Groups';

export const OPTIONS = ['1 Dock and rail', '2 The valley', '3 Four big tabs'] as const;
export const SCREENS = ['default', 'creatures', 'games', 'expeditions', 'dungeon'] as const;
export const LAYOUTS = ['auto', 'phone', 'desktop'] as const;

/** The tab behind the navigation: what the option shows by default, or the one picked. */
function startTab(option: string, screen: string): Tab | null {
  if (screen === 'creatures') return 'collection';
  if (screen === 'games' || screen === 'expeditions' || screen === 'dungeon') return screen;
  if (option.startsWith('1')) return 'collection';
  if (option.startsWith('2')) return null;
  return 'games';
}

/**
 * The three main navigation mock-ups (dev only, see docs/design/workbench.md): one option at a time, as a
 * phone window or as the wide map-and-side-panel frame, in front of a real screen on fixture data.
 */
export function MainNavMockups({
  option,
  screen,
  layout,
}: {
  option: string;
  screen: string;
  layout: string;
}) {
  const auto = useMediaQuery(WIDE_QUERY);
  const wide = layout === 'desktop' || (layout === 'auto' && auto);
  const start = startTab(option, screen);
  if (option.startsWith('2')) return <Option2Valley wide={wide} start={start} />;
  const tab = start ?? 'collection';
  return option.startsWith('1') ? (
    <Option1Dock wide={wide} start={tab} />
  ) : (
    <Option3Groups wide={wide} start={tab} />
  );
}
