/**
 * Opening a link outside the Activity. Inside Discord the Activity is a sandboxed frame that cannot
 * navigate away or open tabs; the Discord SDK's `openExternalLink` asks the Discord app to do it
 * (and shows its own "open this link?" prompt). `App.tsx` registers the SDK's opener once it has
 * one; outside Discord there is none and the browser's `window.open` is used.
 */
type Opener = (url: string) => Promise<void>;

let opener: Opener | null = null;

/** Called by the app once the Discord SDK is ready. */
export function setExternalLinkOpener(next: Opener | null): void {
  opener = next;
}

/** True when the link opens through Discord (the app is inside it). */
export function hasExternalLinkOpener(): boolean {
  return opener !== null;
}

/** Opens `url` (https only) through Discord, or in a new browser tab. Resolves false if it could not. */
export async function openExternalLink(url: string): Promise<boolean> {
  if (!url.startsWith('https://')) return false;
  try {
    if (opener !== null) {
      await opener(url);
      return true;
    }
    return window.open(url, '_blank', 'noopener,noreferrer') !== null;
  } catch {
    return false;
  }
}
