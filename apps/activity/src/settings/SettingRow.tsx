import type { ComponentChildren } from 'preact';

/** One setting: its name and a line about it, then its control (a row per setting). */
export function SettingRow({
  name,
  hint,
  children,
}: {
  name: string;
  hint: string;
  children: ComponentChildren;
}) {
  return (
    <li class="setting-row">
      <div class="setting-text">
        <b class="setting-name">{name}</b>
        <span class="setting-hint">{hint}</span>
      </div>
      {children}
    </li>
  );
}
