/**
 * What is deployed, kept in the page's metadata instead of a visible footer (Misa, 2026-10-24): tools and
 * the staging DEV panel read `<meta name="build-branch">`, `build-commit` and `build-environment`. The
 * values come from `/api/config` when the app starts. Text only; a value that is not plainly shaped is left out.
 */

const SHA = /^[0-9a-f]{40}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/;
const ENVIRONMENT = /^[a-z0-9_-]{1,30}$/;

export interface BuildInfo {
  /** The deployed branch (staging), or null. */
  branch: string | null;
  /** The deployed commit: the full 40-character hash, or null. */
  commit: string | null;
  environment: string | null;
}

interface MetaLike {
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
}

/** The tags published for a config answer: only values of the expected shape. */
export function buildMetaTags(config: {
  environment: string;
  version: string;
  branch: string | null;
}): { name: string; content: string }[] {
  const tags: { name: string; content: string }[] = [];
  if (config.branch !== null && BRANCH.test(config.branch)) {
    tags.push({ name: 'build-branch', content: config.branch });
  }
  if (SHA.test(config.version)) tags.push({ name: 'build-commit', content: config.version });
  if (ENVIRONMENT.test(config.environment)) {
    tags.push({ name: 'build-environment', content: config.environment });
  }
  return tags;
}

/** The part of `document` that these functions use (so a test needs no browser). */
export interface MetaDocument<M extends MetaLike> {
  head: { appendChild(node: never): unknown };
  createElement(tag: 'meta'): M;
  querySelector(selector: string): M | null;
}

/** Sets (or replaces) the build meta tags in the page's head. */
export function publishBuildInfo<M extends MetaLike>(
  doc: MetaDocument<M>,
  config: { environment: string; version: string; branch: string | null },
): void {
  for (const { name, content } of buildMetaTags(config)) {
    const existing = doc.querySelector(`meta[name="${name}"]`);
    if (existing !== null) {
      existing.setAttribute('content', content);
      continue;
    }
    const meta = doc.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    doc.head.appendChild(meta as never);
  }
}

/** What the page's meta tags say (null for a missing one); for the DEV panel. */
export function readBuildInfo(doc: {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
}): BuildInfo {
  const read = (name: string): string | null =>
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
  return {
    branch: read('build-branch'),
    commit: read('build-commit'),
    environment: read('build-environment'),
  };
}

/** The DEV panel's rows: environment, branch and commit (only what is known). */
export function buildRows(info: BuildInfo): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (info.environment !== null) rows.push({ label: 'Environment', value: info.environment });
  if (info.branch !== null) rows.push({ label: 'Branch', value: info.branch });
  if (info.commit !== null) rows.push({ label: 'Commit', value: info.commit.slice(0, 12) });
  return rows;
}
