/**
 * What the server offered at boot (`/api/config`) that the finale screen needs, kept in one place so it
 * does not travel through every screen's props. Set once by `App.tsx`; the default is "not offered", so
 * anything that never learned the flag polls as before.
 */
let finaleLive = false;

export function setFinaleLiveOffered(offered: boolean): void {
  finaleLive = offered;
}

/** True when the server offers the finale's live socket (`finaleLive` of `/api/config`). */
export function finaleLiveOffered(): boolean {
  return finaleLive;
}
