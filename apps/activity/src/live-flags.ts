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

let raidLive = false;

export function setRaidLiveOffered(offered: boolean): void {
  raidLive = offered;
}

/** True when the server offers the raid board's live socket (`raidLive` of `/api/config`). */
export function raidLiveOffered(): boolean {
  return raidLive;
}

let combatV2 = false;

export function setCombatV2(on: boolean): void {
  combatV2 = on;
}

/** True when the server plays combat v2 (`combatV2` of `/api/config`): help text then reads the v2 rules. */
export function combatV2On(): boolean {
  return combatV2;
}
