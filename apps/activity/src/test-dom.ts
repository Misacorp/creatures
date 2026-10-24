/**
 * A very small fake DOM for render tests, so components can be drawn, clicked and typed into without a
 * browser or a new dependency (the activity's tests run in plain Node). It supports what Preact and this
 * app's components use: elements, text, attributes, a few properties, events that bubble, focus and
 * `scrollIntoView` (recorded). It is not a browser: no layout, no CSS, no real `<details>` behaviour.
 * Test support only; never imported by the app.
 */
import { act } from 'preact/test-utils';
import { render, type ComponentChild } from 'preact';

type Listener = (event: FakeEvent) => void;

export interface FakeEvent {
  type: string;
  target: FakeElement;
  currentTarget: FakeElement;
  key?: string;
  /** Pointer events: where, which pointer and what kind (a finger is `touch`). */
  clientX?: number;
  clientY?: number;
  pointerId?: number;
  pointerType?: string;
  isPrimary?: boolean;
  timeStamp?: number;
  defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

abstract class FakeNode {
  parentNode: FakeElement | null = null;
  abstract readonly nodeType: number;

  get nextSibling(): FakeNode | null {
    const list = this.parentNode?.childNodes ?? [];
    return list[list.indexOf(this) + 1] ?? null;
  }

  /** Like the DOM's `ChildNode.remove()`, on text nodes too (Preact 11 removes nodes with it). */
  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

class FakeText extends FakeNode {
  readonly nodeType = 3;
  constructor(public data: string) {
    super();
  }
  get nodeValue(): string {
    return this.data;
  }
  set nodeValue(value: string) {
    this.data = value;
  }
}

/** Properties Preact sets with `dom[name] = value` when `name in dom`; each maps to an attribute. */
const REFLECTED: Readonly<Record<string, string>> = {
  id: 'id',
  tabIndex: 'tabindex',
  hidden: 'hidden',
  disabled: 'disabled',
  type: 'type',
  title: 'title',
  placeholder: 'placeholder',
  maxLength: 'maxlength',
};

/** Event handler properties a browser has (Preact uses lower case names only when the DOM has them). */
const HANDLERS = [
  'onclick',
  'oninput',
  'onchange',
  'onkeydown',
  'onkeyup',
  'onsubmit',
  'onmousedown',
  'onfocus',
  'onblur',
  'onpointerdown',
  'onpointermove',
  'onpointerup',
  'onpointercancel',
  'ontoggle',
];

/** An element's style: what was set through `setProperty` stays readable with `getPropertyValue`. */
function fakeStyle() {
  const props = new Map<string, string>();
  return {
    setProperty: (name: string, value: string): void => {
      props.set(name, String(value));
    },
    removeProperty: (name: string): string => {
      const was = props.get(name) ?? '';
      props.delete(name);
      return was;
    },
    getPropertyValue: (name: string): string => props.get(name) ?? '',
  };
}

export class FakeElement extends FakeNode {
  readonly nodeType = 1;
  readonly childNodes: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();
  /** The listeners added for the capture phase (Preact's `onClickCapture`), which run before the target's. */
  readonly captureListeners = new Map<string, Listener[]>();
  /** The pointers this element took with `setPointerCapture`. */
  readonly captured: number[] = [];
  readonly classList = {
    add: (...names: string[]): void => {
      const now = new Set((this.getAttribute('class') ?? '').split(/\s+/).filter((n) => n !== ''));
      for (const name of names) now.add(name);
      this.setAttribute('class', [...now].join(' '));
    },
    remove: (...names: string[]): void => {
      const gone = new Set(names);
      const rest = (this.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((n) => n !== '' && !gone.has(n));
      this.setAttribute('class', rest.join(' '));
    },
    contains: (name: string): boolean =>
      (this.getAttribute('class') ?? '').split(/\s+/).includes(name),
  };
  /** Keeps the properties set on it, so a test can read a custom property (`cssVars`). */
  readonly style = fakeStyle();
  /** How often `scrollIntoView` and `focus` were called, for the tests. */
  scrolled = 0;
  focused = 0;
  private current = '';

  constructor(
    readonly localName: string,
    private readonly doc: FakeDocument,
  ) {
    super();
    for (const handler of HANDLERS) Reflect.set(this, handler, null);
    for (const [prop, attr] of Object.entries(REFLECTED)) {
      Object.defineProperty(this, prop, {
        get: () => this.attributes.get(attr) ?? (prop === 'tabIndex' ? -1 : ''),
        set: (value: string | number | boolean | null | undefined) => {
          if (value === false || value === '' || value === null || value === undefined) {
            this.attributes.delete(attr);
          } else {
            this.attributes.set(attr, value === true ? '' : String(value));
          }
        },
        enumerable: true,
      });
    }
  }

  get nodeName(): string {
    return this.localName.toUpperCase();
  }
  get namespaceURI(): string {
    return 'http://www.w3.org/1999/xhtml';
  }
  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }
  get value(): string {
    return this.current;
  }
  set value(value: string) {
    this.current = value;
  }
  get textContent(): string {
    return this.childNodes
      .map((n) => (n instanceof FakeText ? n.data : n instanceof FakeElement ? n.textContent : ''))
      .join('');
  }
  set textContent(value: string) {
    this.childNodes.length = 0;
    this.appendChild(new FakeText(value));
  }

  setAttribute(name: string, value: string | number | boolean): void {
    this.attributes.set(name.toLowerCase() === 'tabindex' ? 'tabindex' : name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  appendChild(node: FakeNode): FakeNode {
    return this.insertBefore(node, null);
  }
  insertBefore(node: FakeNode, before: FakeNode | null): FakeNode {
    node.parentNode?.removeChild(node);
    const index = before === null ? this.childNodes.length : this.childNodes.indexOf(before);
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, node);
    node.parentNode = this;
    return node;
  }
  removeChild(node: FakeNode): FakeNode {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  addEventListener(
    type: string,
    listener: Listener,
    capture?: boolean | { capture?: boolean },
  ): void {
    const map = isCapture(capture) ? this.captureListeners : this.listeners;
    map.set(type, [...(map.get(type) ?? []), listener]);
  }
  removeEventListener(
    type: string,
    listener: Listener,
    capture?: boolean | { capture?: boolean },
  ): void {
    const map = isCapture(capture) ? this.captureListeners : this.listeners;
    map.set(
      type,
      (map.get(type) ?? []).filter((l) => l !== listener),
    );
  }
  setPointerCapture(id: number): void {
    this.captured.push(id);
  }

  focus(): void {
    this.focused += 1;
    this.doc.activeElement = this;
  }
  /** There is no layout: every box is empty (components that measure keep their default size). */
  getBoundingClientRect(): { width: number; height: number; left: number; top: number } {
    return { width: 0, height: 0, left: 0, top: 0 };
  }

  scrollIntoView(): void {
    this.scrolled += 1;
  }

  /** True when `node` is this element or sits inside it. */
  contains(node: FakeNode | null): boolean {
    for (let current: FakeNode | null = node; current !== null; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  /**
   * Only the selectors the app's components use: `[role="x"]` (any attribute, as `[data-slot="1"]`), `[data-lane]`,
   * `.class` and `button:not(:disabled)` (the popover's first focus); anything else throws.
   */
  querySelectorAll<T = FakeElement>(selector: string): T[] {
    if (selector === 'button:not(:disabled)') {
      return find(
        this,
        (el) => el !== this && el.localName === 'button' && !el.hasAttribute('disabled'),
      ) as T[];
    }
    const attr = /^\[([\w-]+)="([^"]+)"\]$/.exec(selector);
    // `[data-lane]`: the attribute is there, whatever its value.
    const has = /^\[([\w-]+)\]$/.exec(selector)?.[1];
    const cls = /^\.([\w-]+)$/.exec(selector)?.[1];
    if (has !== undefined) {
      return find(this, (el) => el !== this && el.hasAttribute(has)) as T[];
    }
    if (attr === null && cls === undefined) {
      throw new Error(`the fake DOM does not support the selector ${selector}`);
    }
    return find(
      this,
      (el) =>
        el !== this &&
        (attr !== null
          ? el.getAttribute(attr[1] ?? '') === attr[2]
          : el.classList.contains(cls ?? '')),
    ) as T[];
  }
  querySelector<T = FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }
  /** The nearest of this element and its parents that matches `[attr]` or `.class` (the selectors popovers use). */
  closest(selector: string): FakeElement | null {
    const has = /^\[([\w-]+)\]$/.exec(selector)?.[1];
    const cls = /^\.([\w-]+)$/.exec(selector)?.[1];
    if (has === undefined && cls === undefined) {
      throw new Error(`the fake DOM does not support the selector ${selector}`);
    }
    const matches = (el: FakeElement): boolean =>
      has !== undefined ? el.hasAttribute(has) : el.classList.contains(cls ?? '');
    if (matches(this)) return this;
    for (let el = this.parentNode; el !== null; el = el.parentNode) {
      if (matches(el)) return el;
    }
    return null;
  }
  /** The `data-*` attributes, by their camel-cased names (read only). */
  get dataset(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, value] of this.attributes) {
      if (name.startsWith('data-')) {
        out[name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
      }
    }
    return out;
  }
  getContext(): null {
    return null;
  }
}

function isCapture(options: boolean | { capture?: boolean } | undefined): boolean {
  return typeof options === 'boolean' ? options : options?.capture === true;
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly body = new FakeElement('body', this);

  /** Document-level listeners are accepted and never called (the tests send keys to an element). */
  addEventListener(): void {}
  removeEventListener(): void {}
  createElement(name: string): FakeElement {
    return new FakeElement(name, this);
  }
  createElementNS(_namespace: string, name: string): FakeElement {
    return new FakeElement(name, this);
  }
  createTextNode(text: string): FakeText {
    return new FakeText(text);
  }
  getElementById(id: string): FakeElement | null {
    return find(this.body, (el) => el.getAttribute('id') === id)[0] ?? null;
  }
}

// --- Queries ---

/** Every element under `root` (depth first, `root` included) that passes the test. */
export function find(root: FakeElement, test: (el: FakeElement) => boolean): FakeElement[] {
  const found: FakeElement[] = [];
  const visit = (el: FakeElement): void => {
    if (test(el)) found.push(el);
    for (const child of el.childNodes) if (child instanceof FakeElement) visit(child);
  };
  visit(root);
  return found;
}

/** What assistive technology would call the element: its aria-label, else its text. */
export function nameOf(el: FakeElement): string {
  return (el.getAttribute('aria-label') ?? el.textContent).replace(/\s+/g, ' ').trim();
}

/** The elements with this tag whose name matches. */
export function byName(root: FakeElement, tag: string, name: RegExp | string): FakeElement[] {
  return find(root, (el) => {
    if (el.localName !== tag) return false;
    const label = nameOf(el);
    return typeof name === 'string' ? label === name : name.test(label);
  });
}

export function byClass(root: FakeElement, cls: string): FakeElement[] {
  return find(root, (el) => (el.getAttribute('class') ?? '').split(/\s+/).includes(cls));
}

export function byRole(root: FakeElement, role: string): FakeElement[] {
  return find(root, (el) => el.getAttribute('role') === role);
}

export function visibleText(root: FakeElement): string {
  return root.textContent.replace(/\s+/g, ' ').trim();
}

// --- The page ---

export interface Page {
  root: FakeElement;
  document: FakeDocument;
  /** Draws (again) and flushes effects. */
  draw(vnode: ComponentChild): void;
  /** Runs `change` (state updates, events) and flushes the redraw and the effects. */
  update(change: () => void): void;
  click(el: FakeElement): void;
  /** Types into a text field: sets its value and fires `input`. */
  type(el: FakeElement, text: string): void;
  key(el: FakeElement, key: string): FakeEvent;
  /** Any other event by name (`wheel`, `touchstart`, `focusin`, `scroll`), with effects flushed. */
  event(el: FakeElement, type: string): FakeEvent;
  /** A pointer event (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) with its position and kind. */
  pointer(
    el: FakeElement,
    type: string,
    init: { x: number; y: number; at?: number; id?: number; kind?: string; primary?: boolean },
  ): FakeEvent;
  unmount(): void;
}

/** A fresh page; call `unmount` (or `usePage`) when done. It installs the fake `document` globally. */
export function createPage(): Page {
  const document = new FakeDocument();
  Reflect.set(globalThis, 'document', document);
  const root = document.createElement('div');
  document.body.appendChild(root);

  function fire(
    el: FakeElement,
    event: Omit<
      FakeEvent,
      'currentTarget' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation' | 'target'
    >,
  ): FakeEvent {
    let stopped = false;
    const full: FakeEvent = {
      ...event,
      target: el,
      currentTarget: el,
      defaultPrevented: false,
      preventDefault() {
        full.defaultPrevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
    };
    void act(() => {
      const path: FakeElement[] = [];
      for (let node: FakeElement | null = el; node !== null; node = node.parentNode)
        path.push(node);
      // Capture phase from the top down, then the target and the bubble back up.
      for (const node of [...path].reverse()) {
        if (stopped) break;
        full.currentTarget = node;
        for (const listener of node.captureListeners.get(event.type) ?? []) {
          listener.call(node, full);
        }
      }
      for (const node of path) {
        if (stopped) break;
        full.currentTarget = node;
        for (const listener of node.listeners.get(event.type) ?? []) listener.call(node, full);
      }
    });
    return full;
  }

  return {
    root,
    document,
    draw(vnode) {
      void act(() => {
        // The fake element is a stand-in for the DOM element Preact draws into.
        render(vnode, root as unknown as Element);
      });
    },
    update(change) {
      void act(change);
    },
    click(el) {
      if (el.hasAttribute('disabled')) return;
      fire(el, { type: 'click' });
    },
    type(el, text) {
      el.value = text;
      fire(el, { type: 'input' });
    },
    key(el, key) {
      return fire(el, { type: 'keydown', key });
    },
    event(el, type) {
      return fire(el, { type });
    },
    pointer(el, type, init) {
      return fire(el, {
        type,
        clientX: init.x,
        clientY: init.y,
        timeStamp: init.at ?? 0,
        pointerId: init.id ?? 1,
        pointerType: init.kind ?? 'touch',
        isPrimary: init.primary ?? true,
      });
    },
    unmount() {
      void act(() => {
        render(null, root as unknown as Element);
      });
      Reflect.deleteProperty(globalThis, 'document');
    },
  };
}
