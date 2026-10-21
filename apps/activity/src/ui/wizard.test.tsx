import type { ComponentChildren } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { Drawer } from './Drawer';
import { useWizard, type Wizard, type WizardStep } from './use-wizard';
import { WizardFooter, WizardHead, WizardView } from './Wizard';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

type Id = 'a' | 'b' | 'c';
const STEPS: readonly WizardStep<Id>[] = [
  { id: 'a', title: 'First', backLabel: 'to the start' },
  { id: 'b', title: 'Second', backLabel: 'to the first', next: 'Onward' },
  { id: 'c', title: 'Third', backLabel: 'to the second', next: 'Finish it' },
];

/** The wizard of the current render, so a test can read and drive it. */
let live: Wizard<Id> | null = null;
function now(): Wizard<Id> {
  if (live === null) throw new Error('nothing drawn');
  return live;
}

function Plain({
  blocked = null,
  busy = false,
  onExit,
  onFinish,
  initial,
}: {
  blocked?: string | null;
  busy?: boolean;
  onExit?: () => void;
  onFinish?: () => void;
  initial?: Id;
}) {
  const wizard = useWizard(STEPS, { initial, onExit });
  live = wizard;
  return (
    <div>
      <WizardView wizard={wizard} focus>
        <p class="body">{`body ${wizard.step}`}</p>
      </WizardView>
      <WizardFooter wizard={wizard} blocked={blocked} busy={busy} onFinish={onFinish} />
    </div>
  );
}

function draw(node: ComponentChildren): FakeElement {
  page = createPage();
  page.draw(node);
  return page.root;
}

const footerButton = (root: FakeElement): FakeElement => {
  const [found] = byClass(root, 'send-button');
  if (found === undefined) throw new Error('no footer button');
  return found;
};
const bodyText = (root: FakeElement): string =>
  visibleText(byClass(root, 'body')[0] as FakeElement);
const backButton = (root: FakeElement): FakeElement => {
  const [found] = byName(root, 'button', /Back/);
  if (found === undefined) throw new Error('no Back');
  return found;
};

describe('useWizard', () => {
  it('walks next and back, stops at the ends and reports first, last and index', () => {
    const root = draw(<Plain />);
    expect(now()).toMatchObject({ step: 'a', index: 0, first: true, last: false });
    page?.update(() => {
      now().next();
    });
    expect(now()).toMatchObject({ step: 'b', index: 1, first: false, last: false });
    page?.update(() => {
      now().next();
    });
    expect(now()).toMatchObject({ step: 'c', index: 2, last: true });
    page?.update(() => {
      now().next();
    });
    expect(now().step).toBe('c');
    expect(bodyText(root)).toBe('body c');
    page?.update(() => {
      now().back();
    });
    expect(now().step).toBe('b');
  });

  it('calls onExit from Back on the first step, and does nothing without one', () => {
    const exit = vi.fn();
    draw(<Plain onExit={exit} />);
    expect(now().canBack).toBe(true);
    page?.update(() => {
      now().back();
    });
    expect(exit).toHaveBeenCalledTimes(1);
    expect(now().step).toBe('a');
    page?.unmount();
    draw(<Plain />);
    expect(now().canBack).toBe(false);
    page?.update(() => {
      now().back();
    });
    expect(now().step).toBe('a');
  });

  it('starts on `initial`, goes straight to a step and resets to the start', () => {
    draw(<Plain initial="b" />);
    expect(now().step).toBe('b');
    page?.update(() => {
      now().goTo('c');
    });
    expect(now().step).toBe('c');
    page?.update(() => {
      now().goTo('zzz' as Id);
    });
    expect(now().step).toBe('c');
    page?.update(() => {
      now().reset();
    });
    expect(now().step).toBe('b');
  });

  it('refuses a wizard with no steps', () => {
    function Empty() {
      useWizard<Id>([]);
      return <p>never</p>;
    }
    expect(() => {
      draw(<Empty />);
    }).toThrow('at least one step');
  });
});

describe('the wizard pieces', () => {
  it('draws the head, the body and a footer button that goes on, with the step labels', () => {
    const root = draw(<Plain />);
    expect(visibleText(root)).toContain('First');
    expect(bodyText(root)).toBe('body a');
    expect(visibleText(footerButton(root))).toBe('Next');
    page?.click(footerButton(root));
    expect(visibleText(root)).toContain('Second');
    expect(visibleText(footerButton(root))).toBe('Onward');
    expect(visibleText(backButton(root))).toContain('Back to the first');
  });

  it('says why it is blocked, always, and disables the button', () => {
    const root = draw(<Plain blocked="Pick one first." />);
    expect(visibleText(byClass(root, 'reason')[0] as FakeElement)).toBe('Pick one first.');
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
    page?.click(footerButton(root));
    expect(now().step).toBe('a');
  });

  it('disables the button while busy', () => {
    const root = draw(<Plain busy />);
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
    expect(byClass(root, 'reason')).toHaveLength(0);
  });

  it('shows the finish label on the last step and calls onFinish there', () => {
    const finish = vi.fn();
    const root = draw(<Plain initial="c" onFinish={finish} />);
    expect(visibleText(footerButton(root))).toBe('Finish it');
    page?.click(footerButton(root));
    expect(finish).toHaveBeenCalledTimes(1);
    expect(now().step).toBe('c');
  });

  it('Back in the head and Escape anywhere in the view go one step back', () => {
    const root = draw(<Plain initial="c" />);
    page?.click(backButton(root));
    expect(now().step).toBe('b');
    const event = page?.key(byClass(root, 'body')[0] as FakeElement, 'Escape');
    expect(now().step).toBe('a');
    expect(event?.defaultPrevented).toBe(true);
  });

  it('answers Escape in the footer as one step back too, and ignores other keys', () => {
    const root = draw(<Plain initial="b" />);
    page?.key(footerButton(root), 'Enter');
    expect(now().step).toBe('b');
    page?.key(footerButton(root), 'Escape');
    expect(now().step).toBe('a');
  });

  it('gives Back the focus when the head is drawn with focus, and keeps it off the footer button on a step change', () => {
    const root = draw(<Plain />);
    expect(page?.document.activeElement).toBe(backButton(root));
    footerButton(root).focus();
    page?.click(footerButton(root));
    expect(page?.document.activeElement).toBe(footerButton(root));
  });

  it('draws the head disabled on the first step when there is nowhere to go back to', () => {
    const root = draw(<Plain />);
    expect(backButton(root).hasAttribute('disabled')).toBe(true);
  });

  it('draws the head and the footer without a Drawer, and the footer alone as a finish', () => {
    const finish = vi.fn();
    function Alone() {
      const wizard = useWizard(STEPS);
      return (
        <>
          <WizardHead wizard={wizard} level={4} />
          <WizardFooter
            blocked="Not yet."
            label="Send it"
            onFinish={finish}
            before={<p class="before">Opens at 20:00</p>}
            extra={<p class="extra">Bag is full</p>}
            badge={<span class="badge-demo">3</span>}
            reasonShown
          />
        </>
      );
    }
    const root = draw(<Alone />);
    expect(byClass(root, 'drawer')).toHaveLength(0);
    expect(visibleText(footerButton(root))).toContain('Send it');
    expect(byClass(footerButton(root), 'badge-demo')).toHaveLength(1);
    // Order: before, the reason, extra, then the button.
    const classes = (byClass(root, 'send-footer')[0] as FakeElement).childNodes.map(
      (c) => (c as FakeElement).getAttribute('class') ?? '',
    );
    expect(classes).toEqual(['before', 'reason', 'extra', 'primary send-button']);
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
    expect(finish).not.toHaveBeenCalled();
  });

  it('leaves the reason out when it is already said above, and the button stays disabled', () => {
    const root = draw(<WizardFooter blocked="Opens at 20:00" reasonShown={false} label="Send" />);
    expect(byClass(root, 'reason')).toHaveLength(0);
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
  });

  it('works inside a Drawer: head and body in the content, the footer in the footer slot', () => {
    function InDrawer() {
      const wizard = useWizard(STEPS);
      live = wizard;
      return (
        <Drawer
          open
          onClose={() => undefined}
          title="Demo"
          footer={<WizardFooter wizard={wizard} />}
        >
          <WizardView wizard={wizard}>
            <p class="body">{`body ${wizard.step}`}</p>
          </WizardView>
        </Drawer>
      );
    }
    const root = draw(<InDrawer />);
    expect(byClass(byClass(root, 'drawer-footer')[0] as FakeElement, 'send-button')).toHaveLength(
      1,
    );
    page?.click(footerButton(root));
    expect(bodyText(root)).toBe('body b');
  });
});
