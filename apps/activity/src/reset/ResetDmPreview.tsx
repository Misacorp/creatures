import {
  DM_BOT_NAME,
  DM_COLOUR,
  DM_DESCRIPTION,
  DM_TITLE,
  SAMPLE_SETTLER,
  dmFields,
} from './reset-dm';

/**
 * The goodbye DM as Discord draws an embed (dark theme, a colour bar on the left, the title, the description, inline
 * fields in a grid, the creature field below), for judging it. Preview only: the worker builds the real message
 * (docs/design/reset.md, section 5). Text only: the pieces are never read as HTML.
 */
export function ResetDmPreview() {
  const fields = dmFields(SAMPLE_SETTLER);
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
          <div class="dm-embed" style={{ borderLeftColor: DM_COLOUR }}>
            <p class="dm-embed-title">{DM_TITLE}</p>
            <p class="dm-embed-description">{DM_DESCRIPTION}</p>
            <div class="dm-embed-fields">
              {fields.map((f) => (
                <div key={f.name} class={f.inline ? 'dm-embed-field inline' : 'dm-embed-field'}>
                  <p class="dm-embed-field-name">{f.name}</p>
                  <p class="dm-embed-field-value">{f.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
