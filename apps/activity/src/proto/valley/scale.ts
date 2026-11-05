/**
 * The one pixel scale of a place's screen (prototype): every sprite on it is drawn at this whole number of
 * CSS px per art pixel, so no two pixels on one screen differ in size. It covers the poster, the place's art,
 * the scene's creatures, the story clipping's creatures and the creature tray's. 3 on a phone, 4 from 700 px
 * wide. (The valley's own map is a different screen and keeps its scale of 2.)
 */
export function sceneScale(width: number): number {
  return width >= 700 ? 4 : 3;
}
