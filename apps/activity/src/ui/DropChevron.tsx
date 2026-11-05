/** The pixel chevron at the right of a trigger that looks like a dropdown ("Equip on", the depth picker). */
export function DropChevron() {
  return (
    <svg class="equip-chevron" viewBox="0 0 7 4" aria-hidden="true" shape-rendering="crispEdges">
      <rect x="0" y="0" width="7" height="1" />
      <rect x="1" y="1" width="5" height="1" />
      <rect x="2" y="2" width="3" height="1" />
      <rect x="3" y="3" width="1" height="1" />
    </svg>
  );
}
