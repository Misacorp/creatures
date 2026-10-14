import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasExternalLinkOpener, openExternalLink, setExternalLinkOpener } from './external-link';

afterEach(() => {
  setExternalLinkOpener(null);
});

describe('opening a link outside the Activity', () => {
  it('goes through the registered opener (the Discord SDK) when there is one', async () => {
    const open = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
    setExternalLinkOpener(open);
    expect(hasExternalLinkOpener()).toBe(true);
    await expect(openExternalLink('https://example.com/x')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/x');
  });

  it('refuses anything but https, without calling the opener', async () => {
    const open = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
    setExternalLinkOpener(open);
    await expect(openExternalLink('http://example.com')).resolves.toBe(false);
    await expect(openExternalLink('javascript:alert(1)')).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('says false when the opener fails', async () => {
    setExternalLinkOpener(() => Promise.reject(new Error('no')));
    await expect(openExternalLink('https://example.com')).resolves.toBe(false);
  });
});
