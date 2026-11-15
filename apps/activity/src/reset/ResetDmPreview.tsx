import { DM_BOT_NAME, DM_LIMIT, type DmLayout, dmText } from './reset-dm';

/** Plain text with Discord's `**bold**` drawn as bold. Text only: the pieces are never read as HTML. */
function Marked({ text }: { text: string }) {
  return (
    <>
      {text
        .split('**')
        .map((part, i) =>
          i % 2 === 1 ? <strong key={`${String(i)}-${part}`}>{part}</strong> : part,
        )}
    </>
  );
}

/**
 * The goodbye DM as a Discord message bubble (dark theme, the bot's name), for judging its layout. Preview
 * only: the worker builds the real text (docs/design/reset.md, section 5).
 */
export function ResetDmPreview({ layout }: { layout: DmLayout }) {
  const text = dmText(layout);
  return (
    <div class="dm-preview">
      <div class="dm-preview-msg">
        <div class="dm-preview-avatar" aria-hidden="true" />
        <div class="dm-preview-body">
          <p class="dm-preview-head">
            <span class="dm-preview-name">{DM_BOT_NAME}</span>
            <span class="dm-preview-tag">APP</span>
            <span class="dm-preview-time">Today at 09:00</span>
          </p>
          <p class="dm-preview-text">
            <Marked text={text} />
          </p>
        </div>
      </div>
      <p class="dm-preview-count">
        {String(text.length)} / {String(DM_LIMIT)} characters
      </p>
    </div>
  );
}
