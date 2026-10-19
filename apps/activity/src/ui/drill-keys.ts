/**
 * The key handler of a drill-in view (`ui/DrillHead`): Escape goes back one step, not out of the drawer or the
 * card around it. Put it on the view's own element; keys pressed on anything inside it arrive here.
 */
export function onDrillKey(onBack: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onBack();
  };
}
