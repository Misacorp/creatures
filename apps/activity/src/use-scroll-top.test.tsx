import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPage, type Page } from './test-dom';
import { useScrollTopOnChange } from './use-scroll-top';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

function Probe({ place }: { place: string }) {
  useScrollTopOnChange(place);
  return <p>{place}</p>;
}

describe('useScrollTopOnChange', () => {
  it('jumps the window to the top (instant) when the place changes, not on the first render or a redraw', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('window', { scrollTo });
    page = createPage();
    page.draw(<Probe place="home" />);
    expect(scrollTo).not.toHaveBeenCalled();
    page.draw(<Probe place="home" />);
    expect(scrollTo).not.toHaveBeenCalled();
    page.draw(<Probe place="workshop" />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    page.draw(<Probe place="home" />);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});
