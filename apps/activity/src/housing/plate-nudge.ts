/**
 * Name plates that run off the edge of what can be seen (the cutaway pans inside its stage, so a plate near the edge is cut:
 * "Workbenc"). Each plate is moved inward, along x, by just enough to be whole inside the view with a small margin (`--nudge`, used
 * by `house-canvas.css`). The Forge's plates never meet an edge (its scene fits); this is the same cue for a scene that pans.
 */

/** How far (CSS px) a plate `from`..`to` must move to sit inside `box` with `margin` to spare; 0 when it already does or cannot. */
export function nudgeFor(
  plate: { from: number; to: number },
  box: { from: number; to: number },
  margin = 4,
): number {
  if (plate.to - plate.from > box.to - box.from - 2 * margin) return 0;
  if (plate.from < box.from + margin) return box.from + margin - plate.from;
  if (plate.to > box.to - margin) return box.to - margin - plate.to;
  return 0;
}

/**
 * Sets `--nudge` on every plate in `view` so each is whole in what `view` shows. Measured with the plates' own nudge taken out. A plate
 * that sits inside a big thing (a room's, `cv-plate-in`) stays inside the part of that thing that is in view, and is hidden
 * (`data-clipped`) when that part is too narrow to hold it whole, so the plates of two half-seen neighbours never run together.
 */
export function nudgePlates(view: HTMLElement): void {
  const box = view.getBoundingClientRect();
  for (const plate of Array.from(view.querySelectorAll<HTMLElement>('.cv-plate'))) {
    const was = Number.parseFloat(plate.style.getPropertyValue('--nudge')) || 0;
    const r = plate.getBoundingClientRect();
    const mine = { from: r.left - was, to: r.right - was };
    let room = { from: box.left, to: box.right };
    if (plate.classList.contains('cv-plate-in') && plate.parentElement !== null) {
      const p = plate.parentElement.getBoundingClientRect();
      room = { from: Math.max(room.from, p.left), to: Math.min(room.to, p.right) };
    }
    const fits = mine.to - mine.from <= room.to - room.from - 8;
    const shift = fits ? nudgeFor(mine, room) : 0;
    if (shift !== was) plate.style.setProperty('--nudge', `${String(shift)}px`);
    if (plate.classList.contains('cv-plate-in')) {
      if (fits) plate.removeAttribute('data-clipped');
      else plate.setAttribute('data-clipped', 'yes');
    }
  }
}
