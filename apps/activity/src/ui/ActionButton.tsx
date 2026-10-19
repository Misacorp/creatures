/**
 * The big gold action button of a creature (Earn a ribbon, Evolve, Answer a waiting catch, Fill a talent
 * slot): the words in the heading size, and an optional small detail (a cost, the reason it cannot be used)
 * on the same row when it fits and under the words when it does not.
 *
 * The detail is an element only when it has text: an empty or missing `detail` draws nothing and reserves
 * no room, so the words sit in the middle of a button of the normal height (Misa, 2026-10-19: "too much
 * bottom padding below its text"). The words are centred as one block, whether they take one row or two.
 * `wide` makes it the full width of its place (its ink ring drawn in by the ring, so its edges meet its
 * neighbours'); `large` makes it taller, for the main button of a page. Build every such button from this,
 * never with inline markup and `<small>`.
 */
export function ActionButton({
  label,
  detail,
  onClick,
  disabled = false,
  wide = false,
  large = false,
}: {
  label: string;
  /** The small words next to or under the label; nothing is drawn (and no room kept) when empty. */
  detail?: string | undefined;
  onClick: () => void;
  disabled?: boolean | undefined;
  /** The full width of its place. */
  wide?: boolean | undefined;
  /** Taller and roomier: the main button of a page. */
  large?: boolean | undefined;
}) {
  const note = detail?.trim() ?? '';
  const classes = ['primary', 'action-btn'];
  if (wide) classes.push('wide');
  if (large) classes.push('large');
  return (
    <button type="button" class={classes.join(' ')} disabled={disabled} onClick={onClick}>
      <span class="ab-label">{label}</span>
      {note !== '' && (
        <>
          {/* A space between the two, so the button's name reads "Evolve 20 Essence" (the box drops it). */}{' '}
          <small class="ab-detail">{note}</small>
        </>
      )}
    </button>
  );
}
