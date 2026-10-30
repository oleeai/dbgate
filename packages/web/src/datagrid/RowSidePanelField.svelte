<script lang="ts">
  import _ from 'lodash';
  import FontIcon from '../icons/FontIcon.svelte';
  import { _t } from '../translations';
  import { joinDateTime, splitDateTime } from './rowSidePanelTools';

  export let field;
  export let lookupOpen = false;
  export let onChange;
  export let onOpenLookup = null;

  let domGroup;

  $: inputId = `row-side-panel-${field.uniqueName}`;
  $: testId = `RowSidePanel_input_${field.columnName}`;
  $: isNull = field.raw === null;
  $: textValue = _.isString(field.raw) ? field.raw : '';
  $: placeholder = isNull ? 'NULL' : field.placeholder;
  $: dateTime = field.kind == 'datetime' ? splitDateTime(field.raw) : null;
  // a value the native date picker can't show (infinity, odd formats) stays editable as text
  $: useTextForDateTime = field.kind == 'datetime' && _.isString(field.raw) && field.raw != '' && !dateTime;

  function autogrow(node) {
    const resize = () => {
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight + 2, 260)}px`;
    };
    resize();
    node.addEventListener('input', resize);
    return {
      update: resize,
      destroy: () => node.removeEventListener('input', resize),
    };
  }

  function handleText(e) {
    onChange(field.uniqueName, e.target.value);
  }

  function handleDateTime(e) {
    onChange(field.uniqueName, e.target.value ? joinDateTime(e.target.value, dateTime?.offset ?? field.tzOffset) : '');
  }

  function toggleNull() {
    if (isNull) onChange(field.uniqueName, field.kind == 'boolean' ? false : (field.restoreRaw ?? ''));
    else onChange(field.uniqueName, null);
  }
</script>

<div
  class="field"
  class:dirty={field.isDirty}
  class:pending={field.isPending && !field.isDirty}
  class:invalid={!!field.error}
  class:readonly={!field.editable}
  data-testid={`RowSidePanel_field_${field.columnName}`}
>
  <div class="label-row">
    <label for={inputId} class="name" title={field.columnName}>
      {#if field.isPrimaryKey}
        <span class="marker key" title={_t('rowPanel.primaryKey', { defaultMessage: 'Primary key' })}
          ><FontIcon icon="mdi mdi-key-variant" /></span
        >
      {:else if field.foreignKey}
        <span
          class="marker link"
          title={_t('rowPanel.foreignKey', {
            defaultMessage: 'References {pureName}',
            values: { pureName: field.foreignKey.refTableName },
          })}><FontIcon icon="mdi mdi-link-variant" /></span
        >
      {/if}
      <span class="column-name">{field.columnName}</span>
      {#if field.isRequired}
        <span class="required" title={_t('rowPanel.required', { defaultMessage: 'Required (NOT NULL)' })} />
      {/if}
    </label>
    <span class="type" title={field.dataType}>{field.dataType}</span>
    <span class="spacer" />
    {#if field.isDirty}
      <span class="state edited">{_t('rowPanel.state.edited', { defaultMessage: 'Edited' })}</span>
    {:else if field.isPending}
      <span
        class="state pending"
        title={_t('rowPanel.state.pendingTitle', { defaultMessage: 'Changed, not saved yet' })}
        >{_t('rowPanel.state.pending', { defaultMessage: 'Pending' })}</span
      >
    {/if}
    {#if field.isNullable && field.editable && field.kind != 'binary'}
      <button
        class="null-toggle"
        class:active={isNull}
        on:click={toggleNull}
        title={isNull
          ? _t('rowPanel.unsetNull', { defaultMessage: 'Give the field a value' })
          : _t('rowPanel.setNull', { defaultMessage: 'Set to NULL' })}
        data-testid={`RowSidePanel_null_${field.columnName}`}>NULL</button
      >
    {/if}
  </div>

  <div class="control" class:with-action={!!field.foreignKey && field.editable} bind:this={domGroup}>
    {#if field.kind == 'binary'}
      <div class="static">
        <FontIcon icon="mdi mdi-file-outline" />
        {isNull ? 'NULL' : _t('rowPanel.binaryData', { defaultMessage: 'Binary data' })}
      </div>
    {:else if field.kind == 'boolean'}
      <div class="toggle-row">
        <button
          id={inputId}
          class="switch"
          class:on={field.raw === true}
          class:null={isNull || field.raw === undefined}
          role="switch"
          aria-checked={field.raw === true}
          disabled={!field.editable}
          on:click={() => onChange(field.uniqueName, !(field.raw === true))}
          data-testid={testId}
        >
          <span class="thumb" />
        </button>
        <span class="toggle-label" class:muted={isNull || field.raw === undefined}>
          {#if isNull}
            NULL
          {:else if field.raw === undefined}
            {field.placeholder}
          {:else}
            {field.raw ? 'true' : 'false'}
          {/if}
        </span>
      </div>
    {:else if field.kind == 'enum'}
      <select
        id={inputId}
        class="input"
        class:null={isNull || field.raw === undefined}
        disabled={!field.editable}
        value={_.isString(field.raw) ? field.raw : ''}
        on:change={e => onChange(field.uniqueName, e.currentTarget.value)}
        data-testid={testId}
      >
        <option value="">{isNull ? 'NULL' : field.placeholder || '—'}</option>
        {#each field.column.options as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
      <span class="select-chevron"><FontIcon icon="icon unfold" /></span>
    {:else if field.kind == 'date' || field.kind == 'time'}
      <input
        id={inputId}
        class="input"
        class:null={isNull}
        class:empty={!textValue}
        type={field.kind}
        step={field.kind == 'time' ? 1 : undefined}
        value={textValue}
        readonly={!field.editable}
        on:input={handleText}
        data-testid={testId}
      />
      <span class="picker-placeholder">{placeholder}</span>
    {:else if field.kind == 'datetime' && !useTextForDateTime}
      <input
        id={inputId}
        class="input"
        class:null={isNull}
        class:empty={!dateTime}
        type="datetime-local"
        step="1"
        value={dateTime?.local ?? ''}
        readonly={!field.editable}
        on:input={handleDateTime}
        data-testid={testId}
      />
      <span class="picker-placeholder">{placeholder}</span>
      {#if dateTime?.offset || (field.tzOffset && !!dateTime)}
        <span class="suffix">{dateTime?.offset || field.tzOffset}</span>
      {/if}
    {:else if field.kind == 'longtext' || field.kind == 'json'}
      <textarea
        id={inputId}
        class="input"
        class:mono={field.kind == 'json'}
        class:null={isNull}
        rows="1"
        value={textValue}
        {placeholder}
        readonly={!field.editable}
        spellcheck={field.kind != 'json'}
        on:input={handleText}
        use:autogrow={textValue}
        data-testid={testId}
      />
    {:else}
      <input
        id={inputId}
        class="input"
        class:numeric={field.kind == 'integer' || field.kind == 'number'}
        class:null={isNull}
        type="text"
        inputmode={field.kind == 'integer' ? 'numeric' : field.kind == 'number' ? 'decimal' : undefined}
        value={textValue}
        {placeholder}
        readonly={!field.editable}
        spellcheck="false"
        on:input={handleText}
        data-testid={testId}
      />
    {/if}

    {#if field.foreignKey && field.editable}
      <button
        class="action"
        class:active={lookupOpen}
        title={_t('rowPanel.pickReference', {
          defaultMessage: 'Pick from {pureName}',
          values: { pureName: field.foreignKey.refTableName },
        })}
        on:click={() => onOpenLookup?.(field.uniqueName, domGroup)}
        data-testid={`RowSidePanel_pick_${field.columnName}`}
      >
        <FontIcon icon="mdi mdi-table-search" />
      </button>
    {/if}
  </div>

  {#if field.error}
    <div class="message error">{field.error}</div>
  {:else if field.reference}
    <div class="message reference" class:missing={field.reference.missing}>
      <FontIcon icon="mdi mdi-subdirectory-arrow-right" />
      {#if field.reference.loading}
        <span class="muted">{_t('rowPanel.reference.loading', { defaultMessage: 'Looking up…' })}</span>
      {:else if field.reference.missing}
        <span
          >{_t('rowPanel.reference.missing', {
            defaultMessage: 'No row with this key in {pureName}',
            values: { pureName: field.foreignKey.refTableName },
          })}</span
        >
      {:else}
        <span class="ref-table">{field.foreignKey.refTableName}</span>
        <span class="ref-label">{field.reference.labels[0] ?? ''}</span>
        {#if field.reference.labels[1]}
          <span class="muted ref-secondary">{field.reference.labels[1]}</span>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .field {
    position: relative;
    padding: 8px 16px 10px;
  }
  .field::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10px;
    bottom: 12px;
    width: 2px;
    border-radius: 0 2px 2px 0;
    background: transparent;
    transition: background-color var(--dim-transition-fast);
  }
  .field.dirty::before {
    background: var(--theme-ui-accent);
  }
  .field.pending::before {
    background: var(--tw-color-amber-500);
  }
  .field.invalid::before {
    background: var(--theme-generic-font-error);
  }

  .label-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 20px;
    margin-bottom: 5px;
    font-size: 12px;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    font-weight: 600;
    color: var(--theme-generic-font);
    cursor: default;
  }
  .column-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .marker {
    flex-shrink: 0;
    font-size: 13px;
    line-height: 1;
  }
  .marker.key {
    color: var(--tw-color-amber-500);
  }
  .marker.link {
    color: var(--theme-ui-accent-strong);
  }
  .required {
    flex-shrink: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--theme-generic-font-error);
    opacity: 0.85;
  }
  .type {
    flex-shrink: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spacer {
    flex: 1;
  }

  .state {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 500;
  }
  .state.edited {
    color: var(--theme-ui-accent-strong);
  }
  .state.pending {
    color: var(--tw-color-amber-500);
  }

  .null-toggle {
    flex-shrink: 0;
    height: 18px;
    padding: 0 6px;
    border: 1px solid var(--theme-ui-border);
    border-radius: 5px;
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .null-toggle:hover {
    border-color: var(--theme-ui-border-strong);
    color: var(--theme-generic-font);
  }
  .null-toggle.active {
    border-color: transparent;
    background: var(--theme-ui-accent-soft);
    color: var(--theme-ui-accent-strong);
  }
  .null-toggle:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  .control {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    min-height: 30px;
    padding: 5px 9px;
    border: var(--theme-input-border);
    border-radius: 7px;
    background: var(--theme-input-background);
    color: var(--theme-input-foreground);
    font: inherit;
    font-size: 13px;
    line-height: 18px;
    outline: none;
    transition:
      border-color var(--dim-transition-fast),
      box-shadow var(--dim-transition-fast),
      background-color var(--dim-transition-fast);
  }
  .input:hover:not(:read-only):not(:disabled) {
    border: var(--theme-input-border-hover);
  }
  .input:focus {
    border: var(--theme-input-border-focus);
    box-shadow: var(--theme-input-focus-ring);
  }
  .input::placeholder {
    color: var(--theme-input-placeholder);
  }
  .input.null::placeholder {
    font-style: italic;
    letter-spacing: 0.02em;
  }
  .input:read-only,
  .input:disabled {
    background: var(--theme-input-background-disabled);
    color: var(--theme-input-foreground-disabled);
  }
  .field.pending .input:not(:focus) {
    background: var(--theme-datagrid-modified-cell-background);
  }
  .field.invalid .input {
    border-color: var(--theme-generic-font-error);
  }
  textarea.input {
    resize: none;
    overflow-y: auto;
    white-space: pre-wrap;
  }
  .input.mono {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }
  .input.numeric {
    font-variant-numeric: tabular-nums;
  }
  select.input {
    appearance: none;
    padding-right: 28px;
    cursor: pointer;
  }
  select.input.null {
    color: var(--theme-input-placeholder);
  }
  .select-chevron {
    position: absolute;
    right: 9px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--theme-generic-font-grayed);
  }
  input[type='date'].input,
  input[type='time'].input,
  input[type='datetime-local'].input {
    font-variant-numeric: tabular-nums;
  }
  /* native date pickers have no placeholder, so an empty one shows ours until it gets the focus */
  .picker-placeholder {
    display: none;
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--theme-input-placeholder);
    font-size: 13px;
  }
  .input.null + .picker-placeholder {
    font-style: italic;
    letter-spacing: 0.02em;
  }
  .input.empty:not(:focus) + .picker-placeholder {
    display: block;
  }
  .input.empty:not(:focus)::-webkit-datetime-edit {
    opacity: 0;
  }
  .suffix {
    position: absolute;
    right: 34px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
    font-variant-numeric: tabular-nums;
  }

  .control.with-action .input {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .action {
    flex-shrink: 0;
    width: 32px;
    margin-left: -1px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: var(--theme-input-border);
    border-radius: 0 7px 7px 0;
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font-grayed);
    font-size: 15px;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .action:hover,
  .action.active {
    background: var(--theme-ui-active);
    color: var(--theme-ui-accent-strong);
  }
  .action:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  .static {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    color: var(--theme-generic-font-grayed);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 30px;
  }
  .switch {
    position: relative;
    flex-shrink: 0;
    width: 34px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: var(--theme-ui-border-strong);
    cursor: pointer;
    transition: background-color var(--dim-transition-base);
  }
  .switch.on {
    background: var(--theme-ui-accent);
  }
  .switch.null {
    background: var(--theme-ui-border);
  }
  .switch:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .switch:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    transition: transform var(--dim-transition-base);
  }
  .switch.on .thumb {
    transform: translateX(14px);
  }
  .toggle-label {
    font-variant-numeric: tabular-nums;
  }
  .toggle-label.muted {
    color: var(--theme-generic-font-grayed);
    font-style: italic;
  }

  .message {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 5px;
    font-size: 11.5px;
    min-width: 0;
  }
  .message.error {
    color: var(--theme-generic-font-error);
  }
  .message.reference {
    color: var(--theme-generic-font-grayed);
  }
  .message.reference.missing {
    color: var(--tw-color-amber-500);
  }
  .ref-table {
    flex-shrink: 0;
    padding: 0 5px;
    border-radius: 4px;
    background: var(--theme-ui-hover);
    font-size: 11px;
  }
  .ref-label {
    flex-shrink: 0;
    max-width: 50%;
    color: var(--theme-generic-font);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ref-secondary {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted {
    color: var(--theme-generic-font-grayed);
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb,
    .switch {
      transition: none;
    }
  }
</style>
