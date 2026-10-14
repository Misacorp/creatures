import { changedProps } from './props';
import type { Entry, Props } from './types';

/** Where the feedback goes: a new issue of the game's own repository. No tokens, no API. */
export const ISSUES_URL = 'https://github.com/Misacorp/creatures/issues/new';
export const FEEDBACK_LABEL = 'ui-feedback';

/** The body stays well under what a link can carry (GitHub refuses very long ones). */
const MAX_BODY = 6000;
const MAX_URL = 7500;
const PROPS_LIMIT = 2000;

export interface FeedbackInput {
  entry: Entry;
  props: Props;
  /** The preview width as the switcher names it ("390", "360", "full"). */
  width: string;
  /** The shareable workbench link of this exact view. */
  link: string;
}

export interface Feedback {
  title: string;
  body: string;
}

/** The first `max` characters, counted in code points so a pair is never split (a lone half cannot be URL-encoded). */
function cut(text: string, max: number): string {
  return Array.from(text).slice(0, max).join('');
}

/** The line Misa fills in. It is always the last line, and no cutting ever removes it. */
const TAIL = "What I'd like changed: ";

/** `body` cut to `max` code points from the front part, keeping the tail line whole. */
function fit(body: string, max: number): string {
  if (Array.from(body).length <= max) return body;
  const head = body.endsWith(TAIL) ? body.slice(0, body.length - TAIL.length) : body;
  return `${cut(head, Math.max(0, max - TAIL.length - 7))}\n(cut)\n${TAIL}`;
}

function propsJson(props: Props): string {
  const json = JSON.stringify(props, null, 2);
  return json.length > PROPS_LIMIT ? `${cut(json, PROPS_LIMIT)}\n... (cut)` : json;
}

/** The text of a feedback issue, also what "Copy details" puts on the clipboard. */
export function buildFeedback(input: FeedbackInput): Feedback {
  const { entry, props, width, link } = input;
  const lines = [
    `Component: ${entry.name}`,
    `File: ${entry.file}`,
    `Preview width: ${width}`,
    `Workbench link: ${link}`,
    '',
    'Props (changed from the defaults):',
    '```json',
    propsJson(changedProps(entry, props)),
    '```',
    '',
    TAIL,
  ];
  return { title: `UI: ${entry.name}`, body: fit(lines.join('\n'), MAX_BODY) };
}

/** The "new issue" link, prefilled and labelled `ui-feedback`. Every part is URL-encoded. */
export function issueUrl(feedback: Feedback): string {
  const make = (body: string): string =>
    `${ISSUES_URL}?title=${encodeURIComponent(feedback.title)}&body=${encodeURIComponent(body)}&labels=${FEEDBACK_LABEL}`;
  let body = feedback.body;
  let url = make(body);
  // Encoded text is longer than the text: shorten it until the whole link fits.
  while (url.length > MAX_URL && body.length > 200) {
    body = fit(body, Math.floor(Array.from(body).length * 0.8));
    url = make(body);
  }
  return url;
}

/** The copy text: the title, then the body. */
export function clipboardText(feedback: Feedback): string {
  return `${feedback.title}\n\n${feedback.body}`;
}
