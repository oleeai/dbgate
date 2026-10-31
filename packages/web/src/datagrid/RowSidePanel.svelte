<script lang="ts">
  import _ from 'lodash';
  import { onDestroy, tick } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import { findCommand } from '../commands/runCommand';
  import InspectorHero from '../inspector/InspectorHero.svelte';
  import { currentThemeType } from '../plugins/themes';
  import { _t } from '../translations';
  import { apiCall } from '../utility/api';
  import { isCtrlOrCommandKey, isMac } from '../utility/common';
  import RowSidePanelField from './RowSidePanelField.svelte';
  import RowSidePanelLookup from './RowSidePanelLookup.svelte';
  import {
    createLookupSelect,
    currentTimeZoneOffset,
    formatLabel,
    fromRawValue,
    getFieldKind,
    getLabelColumns,
    isTimeZoneDataType,
    normalizeKeyValue,
    toRawValue,
    validateRawValue,
  } from './rowSidePanelTools';

  export let display;
  export let grider;
  export let conid;
  export let database;
  export let mode: 'edit' | 'insert' = 'edit';
  export let rowIndex: number = null;
  export let editorTypes = null;
  // the grid's current column, its field is marked and kept in view
  export let currentColumn = null;
  // called when the edit is saved or cancelled
  export let onClose;
  export let onNavigate;
  export let onInserted;

  let domPanel;
  let domBody;
  // edited fields only: uniqueName -> editor value (string, boolean or null)
  let draft = {};
  let lookup = null;
  let refCache = {};
  let refQueue = [];
  let refTimer = null;
  let target = null;

  $: table = display?.baseTable;
  $: columns = (display?.columns ?? []).filter(col => col.uniquePath?.length == 1);
  $: rowData = mode == 'edit' && _.isNumber(rowIndex) ? grider?.getRowData(rowIndex) : null;
  $: rowStatus = mode == 'edit' && _.isNumber(rowIndex) && rowData ? grider?.getRowStatus(rowIndex) : null;
  $: isDeleted = rowStatus?.status == 'deleted';
  $: canEdit = mode == 'insert' ? !!grider?.canInsert : !!grider?.editable && !!rowData && !isDeleted;
  $: isDirty = !_.isEmpty(draft);
  $: fields = columns.map(col => buildField(col, rowData, rowStatus, draft, refCache, canEdit));
  $: keyParts = getKeyParts(table, rowData);
  $: scheduleReferenceLoads(fields);
  $: handleTargetChange(mode, rowIndex);
  $: saveShortcut = isMac() ? '⌘S' : 'Ctrl+S';
  $: showFooter = canEdit && (mode == 'insert' || isDirty);
  $: revealCurrentField(currentColumn);

  function getKeyParts(table, rowData) {
    if (!table?.primaryKey || !rowData) return [];
    return table.primaryKey.columns.map(col => ({
      name: col.columnName,
      value: normalizeKeyValue(rowData[col.columnName]) ?? 'NULL',
    }));
  }

  function cleanDefault(value: string) {
    // 'USD'::bpchar -> 'USD'
    return String(value).replace(/::[\w\s"]+(\[\])?$/, '');
  }

  function findRefTable(foreignKey) {
    if (!foreignKey) return null;
    return display?.dbinfo?.tables?.find(
      x => x.pureName == foreignKey.refTableName && x.schemaName == foreignKey.refSchemaName
    );
  }

  function getRefInfo(foreignKey) {
    const refTable = findRefTable(foreignKey);
    if (!refTable || foreignKey.columns?.length != 1) return null;
    const keyColumn = foreignKey.columns[0].refColumnName;
    let dictionaryColumns = null;
    try {
      dictionaryColumns = display?.getDictionaryDescription?.(refTable)?.columns;
    } catch (e) {
      dictionaryColumns = null;
    }
    return { refTable, keyColumn, labelColumns: getLabelColumns(refTable, keyColumn, dictionaryColumns) };
  }

  function getPlaceholder(col) {
    if (mode != 'insert') return '';
    if (col.autoIncrement || col.hasAutoValue)
      return _t('rowPanel.placeholder.auto', { defaultMessage: 'Generated automatically' });
    if (col.defaultValue != null)
      return _t('rowPanel.placeholder.default', {
        defaultMessage: 'Default: {value}',
        values: { value: cleanDefault(col.defaultValue) },
      });
    if (col.notNull) return _t('rowPanel.placeholder.required', { defaultMessage: 'Required' });
    return 'NULL';
  }

  function getErrorMessage(error) {
    if (error == 'integer') return _t('rowPanel.error.integer', { defaultMessage: 'Enter a whole number' });
    if (error == 'number') return _t('rowPanel.error.number', { defaultMessage: 'Enter a number' });
    if (error == 'json') return _t('rowPanel.error.json', { defaultMessage: 'This is not valid JSON' });
    return null;
  }

  function buildField(col, rowData, rowStatus, draft, refCache, canEdit) {
    const original = rowData ? rowData[col.uniqueName] : undefined;
    const kind = getFieldKind(col, original);
    const originalRaw = mode == 'insert' ? undefined : toRawValue(kind, original, editorTypes);
    const isDirty = col.uniqueName in draft;
    const raw = isDirty ? draft[col.uniqueName] : originalRaw;
    const error = isDirty ? validateRawValue(kind, raw) : null;
    const isAuto = col.autoIncrement || col.hasAutoValue;

    let reference = null;
    if (col.foreignKey && raw != null && raw !== '' && !error) {
      const value = fromRawValue(kind, raw, original);
      const cached = refCache[getRefKey(col.foreignKey, value)];
      if (cached && !cached.error) reference = cached;
    }

    return {
      column: col,
      uniqueName: col.uniqueName,
      columnName: col.columnName,
      dataType: col.dataType,
      kind,
      raw,
      original,
      restoreRaw: originalRaw != null ? originalRaw : '',
      isDirty,
      isPending: !!rowStatus?.modifiedFields?.has(col.uniqueName),
      error: getErrorMessage(error),
      editable: canEdit && (mode == 'insert' || !!grider?.isCellEditable(rowIndex, col.uniqueName)),
      isPrimaryKey: !!col.isPrimaryKey,
      foreignKey: col.foreignKey,
      isRequired: !!col.notNull && !isAuto && col.defaultValue == null,
      isNullable: !col.notNull,
      placeholder: getPlaceholder(col),
      tzOffset: kind == 'datetime' && isTimeZoneDataType(col.dataType) ? currentTimeZoneOffset() : '',
      reference,
    };
  }

  function getRefKey(foreignKey, value) {
    return `${foreignKey.refSchemaName}.${foreignKey.refTableName}:${normalizeKeyValue(value)}`;
  }

  function scheduleReferenceLoads(fields) {
    let added = false;
    for (const field of fields) {
      if (!field.foreignKey || field.raw == null || field.raw === '' || field.error) continue;
      const value = fromRawValue(field.kind, field.raw, field.original);
      const key = getRefKey(field.foreignKey, value);
      if (key in refCache) continue;
      refCache[key] = { loading: true, labels: [] };
      refQueue.push({ key, foreignKey: field.foreignKey, value });
      added = true;
    }
    if (!added) return;
    refCache = refCache;
    // typing into a key field asks once the typing stops
    if (refTimer) clearTimeout(refTimer);
    refTimer = setTimeout(loadReferences, 250);
  }

  async function loadReferences() {
    const queue = refQueue;
    refQueue = [];
    await Promise.all(
      queue.map(async ({ key, foreignKey, value }) => {
        const info = getRefInfo(foreignKey);
        if (!info) {
          refCache = { ...refCache, [key]: { error: true } };
          return;
        }
        const response = await apiCall('database-connections/sql-select', {
          conid,
          database,
          select: createLookupSelect(info.refTable, info.keyColumn, info.labelColumns, { value, limit: 1 }),
          auditLogSessionGroup: 'lookup',
        });
        const row = response?.rows?.[0];
        refCache = {
          ...refCache,
          [key]: response?.errorMessage
            ? { error: true }
            : row
              ? { labels: formatLabel(row, info.labelColumns) }
              : { missing: true },
        };
      })
    );
  }

  /** Converts the draft of the row at index into cell values; invalid fields are left out. */
  function collectValues(index) {
    const row = _.isNumber(index) ? grider.getRowData(index) : null;
    const values = {};
    let firstError = null;
    for (const [uniqueName, raw] of Object.entries(draft)) {
      const col = columns.find(x => x.uniqueName == uniqueName);
      if (!col) continue;
      const original = row?.[uniqueName];
      const kind = getFieldKind(col, original);
      if (validateRawValue(kind, raw as any)) {
        firstError = firstError ?? uniqueName;
        continue;
      }
      values[uniqueName] = fromRawValue(kind, raw as any, original);
    }
    return { values, firstError };
  }

  // one batch = one undo step, the same as editing several cells and pressing Undo
  function writeValues(index, values) {
    if (_.isEmpty(values)) return;
    grider.beginUpdate();
    for (const [uniqueName, value] of Object.entries(values)) {
      grider.setCellValue(index, uniqueName, value);
    }
    grider.endUpdate();
  }

  function handleTargetChange(newMode, newIndex) {
    if (target && target.mode == newMode && target.rowIndex == newIndex) return;
    if (target?.mode == 'edit' && !_.isEmpty(draft)) {
      // moving to another row keeps the edits as pending changes, like leaving an edited grid cell
      writeValues(target.rowIndex, collectValues(target.rowIndex).values);
    }
    target = { mode: newMode, rowIndex: newIndex };
    draft = {};
    lookup = null;
  }

  function handleChange(uniqueName, raw) {
    const field = fields.find(x => x.uniqueName == uniqueName);
    if (!field) return;
    if (raw === '' && (mode == 'insert' || field.kind == 'enum')) {
      // an emptied field of a new row falls back to the column default
      raw = mode == 'insert' ? undefined : null;
    }
    const originalRaw = mode == 'insert' ? undefined : toRawValue(field.kind, field.original, editorTypes);
    if (raw === undefined || raw === originalRaw) {
      draft = _.omit(draft, uniqueName);
    } else {
      draft = { ...draft, [uniqueName]: raw };
    }
  }

  // scrolls only the field list: the inspector may still be sliding in, and the page must not move with it
  function scrollIntoBody(element) {
    if (!element || !domBody) return;
    const bodyRect = domBody.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (rect.top < bodyRect.top) domBody.scrollTop -= bodyRect.top - rect.top + 8;
    else if (rect.bottom > bodyRect.bottom) domBody.scrollTop += rect.bottom - bodyRect.bottom + 8;
  }

  async function focusField(uniqueName) {
    await tick();
    const input = domPanel?.querySelector(`#row-side-panel-${CSS.escape(uniqueName)}`);
    if (input) {
      input.focus({ preventScroll: true });
      scrollIntoBody(input.closest('.field') ?? input);
    }
  }

  async function revealCurrentField(uniqueName) {
    if (!uniqueName || mode != 'edit') return;
    await tick();
    scrollIntoBody(domBody?.querySelector(`[data-unique-name="${CSS.escape(uniqueName)}"]`));
  }

  /** Takes the keyboard focus: the first field of a new row, the panel itself for an existing row. */
  export async function focusPanel() {
    await tick();
    if (mode == 'insert') {
      const first = fields.find(x => x.editable && !x.column.autoIncrement && !x.column.hasAutoValue);
      if (first) {
        focusField(first.uniqueName);
        return;
      }
    }
    domPanel?.focus({ preventScroll: true });
  }

  /** Keeps unsaved edits as pending changes, like leaving an edited grid cell. */
  export function commitDraft() {
    if (target?.mode == 'edit' && !_.isEmpty(draft) && _.isNumber(target.rowIndex)) {
      writeValues(target.rowIndex, collectValues(target.rowIndex).values);
    }
    draft = {};
  }

  export function save() {
    if (!canEdit) return false;
    const { values, firstError } = collectValues(mode == 'edit' ? rowIndex : null);
    if (firstError) {
      focusField(firstError);
      return false;
    }
    if (mode == 'insert') {
      grider.beginUpdate();
      const newIndex = grider.insertRow();
      for (const [uniqueName, value] of Object.entries(values)) {
        grider.setCellValue(newIndex, uniqueName, value);
      }
      grider.endUpdate();
      draft = {};
      onInserted(newIndex);
    } else {
      writeValues(rowIndex, values);
      draft = {};
      onClose();
    }
    return true;
  }

  function saveAndWrite() {
    if ((isDirty || mode == 'insert') && !save()) return;
    // the table's own Save, with its SQL preview and confirmation
    const command = findCommand('tableData.save');
    if (command?.testEnabled?.()) command.onClick();
  }

  function cancel() {
    draft = {};
    onClose();
  }

  function openLookup(uniqueName, anchor) {
    if (lookup?.uniqueName == uniqueName) {
      lookup = null;
      return;
    }
    const field = fields.find(x => x.uniqueName == uniqueName);
    const info = getRefInfo(field?.foreignKey);
    if (!info || !anchor || !domPanel) return;
    const panelRect = domPanel.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = panelRect.bottom - rect.bottom - 64;
    const spaceAbove = rect.top - panelRect.top - 12;
    const placeAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(360, placeAbove ? spaceAbove : spaceBelow);
    const vertical = placeAbove
      ? `bottom:${panelRect.bottom - rect.top + 4}px`
      : `top:${rect.bottom - panelRect.top + 4}px`;
    lookup = {
      ...info,
      uniqueName,
      anchor,
      style: `${vertical};left:${rect.left - panelRect.left}px;width:${rect.width}px;max-height:${maxHeight}px`,
    };
  }

  function closeLookup(refocus) {
    const uniqueName = lookup?.uniqueName;
    lookup = null;
    if (refocus && uniqueName) focusField(uniqueName);
  }

  function handlePick(uniqueName, value, row) {
    const field = fields.find(x => x.uniqueName == uniqueName);
    if (!field) return;
    if (lookup) {
      // the picked row is already known, no need to look it up again
      refCache = {
        ...refCache,
        [getRefKey(field.foreignKey, value)]: { labels: formatLabel(row, lookup.labelColumns) },
      };
    }
    handleChange(uniqueName, toRawValue(field.kind, value, editorTypes));
    closeLookup(true);
  }

  function isTextTarget(element) {
    return !!element?.closest?.('input, textarea, select');
  }

  function handleKeyDown(e) {
    if (e.key == 'Escape') {
      cancel();
    } else if (e.key == 'Enter' && isCtrlOrCommandKey(e)) {
      save();
    } else if (e.key?.toLowerCase() == 's' && isCtrlOrCommandKey(e) && !e.shiftKey && !e.altKey) {
      saveAndWrite();
    } else if (
      mode == 'edit' &&
      (e.key == 'ArrowUp' || e.key == 'ArrowDown') &&
      !e.metaKey &&
      !e.ctrlKey &&
      !isTextTarget(e.target)
    ) {
      onNavigate(e.key == 'ArrowUp' ? -1 : 1);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  onDestroy(() => {
    if (refTimer) clearTimeout(refTimer);
  });
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<section
  class="row-section"
  style={`color-scheme:${$currentThemeType == 'dark' ? 'dark' : 'light'}`}
  tabindex="-1"
  bind:this={domPanel}
  on:keydown={handleKeyDown}
  aria-label={mode == 'insert'
    ? _t('rowPanel.ariaInsert', { defaultMessage: 'New row' })
    : _t('rowPanel.ariaEdit', { defaultMessage: 'Edit row' })}
  data-testid="RowSidePanel_sheet"
>
  <InspectorHero
    icon={mode == 'insert' ? 'mdi mdi-table-row-plus-after' : 'mdi mdi-table-row'}
    title={mode == 'insert'
      ? _t('rowPanel.chip.newRow', { defaultMessage: 'New row' })
      : _.isNumber(rowIndex)
        ? _t('rowPanel.rowNumber', { defaultMessage: 'Row {number}', values: { number: rowIndex + 1 } })
        : _t('rowPanel.title', { defaultMessage: 'Row' })}
  >
    <svelte:fragment slot="chips">
      {#if mode == 'edit' && rowStatus?.status == 'deleted'}
        <span class="chip deleted">{_t('rowPanel.chip.deleted', { defaultMessage: 'Marked for deletion' })}</span>
      {:else if mode == 'edit' && rowStatus?.status == 'inserted'}
        <span class="chip new">{_t('rowPanel.chip.inserted', { defaultMessage: 'New · not saved' })}</span>
      {:else if mode == 'edit' && rowStatus?.status == 'updated'}
        <span class="chip pending">{_t('rowPanel.chip.pending', { defaultMessage: 'Pending changes' })}</span>
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="subtitle">
      {#if mode == 'insert'}
        {_t('rowPanel.insertHint', { defaultMessage: 'Fields left empty use their column defaults' })}
      {:else if keyParts.length > 0}
        {#each keyParts as part}
          <span class="key-pill">
            <span class="key-name">{part.name}</span><span class="key-value">{part.value}</span>
          </span>
        {/each}
      {:else}
        {table?.pureName ?? ''}
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="trailing">
      {#if mode == 'edit'}
        <button
          class="icon-button"
          disabled={!_.isNumber(rowIndex) || rowIndex <= 0}
          on:click={() => onNavigate(-1)}
          title={_t('rowPanel.previousRow', { defaultMessage: 'Previous row (↑)' })}
          data-testid="RowSidePanel_previous"
        >
          <FontIcon icon="icon chevron-up" />
        </button>
        <button
          class="icon-button"
          disabled={!_.isNumber(rowIndex) || rowIndex >= (grider?.rowCount ?? 0) - 1}
          on:click={() => onNavigate(1)}
          title={_t('rowPanel.nextRow', { defaultMessage: 'Next row (↓)' })}
          data-testid="RowSidePanel_next"
        >
          <FontIcon icon="icon chevron-down" />
        </button>
      {/if}
    </svelte:fragment>
  </InspectorHero>

  {#if isDeleted}
    <div class="banner danger">
      <FontIcon icon="mdi mdi-delete-outline" />
      {_t('rowPanel.deletedBanner', {
        defaultMessage: 'This row will be deleted when you save. Revert the row to edit it.',
      })}
    </div>
  {:else if mode == 'edit' && rowData && !grider?.editable}
    <div class="banner">
      <FontIcon icon="mdi mdi-lock-outline" />
      {_t('rowPanel.readOnlyBanner', { defaultMessage: 'Read-only. This table or connection can’t be edited.' })}
    </div>
  {/if}

  <div class="body" bind:this={domBody} on:scroll={() => lookup && closeLookup(false)}>
    {#if mode == 'edit' && !rowData}
      <div class="empty">{_t('rowPanel.noRow', { defaultMessage: 'This row isn’t loaded any more.' })}</div>
    {:else}
      {#each fields as field (field.uniqueName)}
        <RowSidePanelField
          {field}
          current={mode == 'edit' && field.uniqueName == currentColumn}
          lookupOpen={lookup?.uniqueName == field.uniqueName}
          onChange={handleChange}
          onOpenLookup={openLookup}
        />
      {/each}
    {/if}
  </div>

  {#if showFooter}
    <footer class="footer">
      <span class="hint">
        <span>{_t('rowPanel.footerHint', { defaultMessage: 'Adds to the pending changes' })}</span>
        <span class="hint-secondary"
          >{_t('rowPanel.footerHintWrite', {
            defaultMessage: '{shortcut} saves to the database',
            values: { shortcut: saveShortcut },
          })}</span
        >
      </span>
      <button class="button secondary" on:click={cancel} data-testid="RowSidePanel_cancel">
        {_t('common.cancel', { defaultMessage: 'Cancel' })}
      </button>
      <button
        class="button primary"
        disabled={mode == 'edit' && !isDirty}
        on:click={save}
        title={isMac() ? '⌘↵' : 'Ctrl+Enter'}
        data-testid="RowSidePanel_save"
      >
        {_t('common.save', { defaultMessage: 'Save' })}
      </button>
    </footer>
  {/if}

  {#if lookup}
    <RowSidePanelLookup
      {conid}
      {database}
      refTable={lookup.refTable}
      keyColumn={lookup.keyColumn}
      labelColumns={lookup.labelColumns}
      value={fields.find(x => x.uniqueName == lookup.uniqueName)?.raw}
      style={lookup.style}
      anchor={lookup.anchor}
      onPick={(value, row) => handlePick(lookup.uniqueName, value, row)}
      onClose={closeLookup}
    />
  {/if}
</section>

<style>
  .row-section {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    outline: none;
    user-select: text;
  }

  .chip {
    flex-shrink: 0;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }
  .chip.new {
    background: var(--theme-datagrid-inserted-row-background);
    color: var(--theme-generic-font-success);
  }
  .chip.pending {
    background: var(--theme-datagrid-modified-cell-background);
    color: var(--theme-generic-font);
  }
  .chip.deleted {
    background: var(--theme-datagrid-deleted-row-background);
    color: var(--theme-generic-font-error);
  }

  .key-pill {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    border: 1px solid var(--theme-ui-border);
    border-radius: 5px;
    overflow: hidden;
    font-size: 11.5px;
  }
  .key-name {
    padding: 0 5px;
    background: var(--theme-ui-hover);
  }
  .key-value {
    padding: 0 6px;
    color: var(--theme-generic-font);
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon-button {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font-size: 16px;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .icon-button:hover:not(:disabled) {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .icon-button:disabled {
    color: var(--theme-ui-text-tertiary);
    opacity: 0.5;
    cursor: default;
  }
  .icon-button:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  .banner {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--theme-ui-border);
    background: var(--theme-ui-hover);
    font-size: 12px;
    color: var(--theme-ui-text-secondary);
  }
  .banner.danger {
    background: var(--theme-datagrid-deleted-row-background);
    color: var(--theme-generic-font-error);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px 0 12px;
    border-top: 1px solid var(--theme-ui-border-subtle);
  }
  .empty {
    padding: 24px 16px;
    color: var(--theme-generic-font-grayed);
  }

  .footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 10px 16px;
    border-top: 1px solid var(--theme-ui-border);
    background: var(--theme-modal-footer-background);
    animation: row-footer-in 220ms var(--dim-ease-spring);
  }
  @keyframes row-footer-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  .hint {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 11.5px;
    line-height: 15px;
    color: var(--theme-ui-text-secondary);
  }
  .hint > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint-secondary {
    color: var(--theme-generic-font-grayed);
  }
  .button {
    flex-shrink: 0;
    height: 30px;
    padding: 0 14px;
    border-radius: var(--dim-radius-md);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      color var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }
  .button:active:not(:disabled) {
    transform: scale(0.98);
  }
  .button:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }
  .button.secondary {
    border: var(--theme-outlinebutton-border);
    background: var(--theme-outlinebutton-background);
    color: var(--theme-outlinebutton-foreground);
  }
  .button.secondary:hover {
    border: var(--theme-outlinebutton-hover-border);
    background: var(--theme-outlinebutton-hover-background);
  }
  .button.primary {
    min-width: 72px;
    border: var(--theme-formbutton-border);
    background: var(--theme-formbutton-background);
    color: var(--theme-formbutton-foreground);
  }
  .button.primary:hover:not(:disabled) {
    border: var(--theme-formbutton-border-hover);
    background: var(--theme-formbutton-background-hover);
  }
  .button.primary:disabled {
    border: var(--theme-formbutton-border-disabled);
    background: var(--theme-formbutton-background-disabled);
    color: var(--theme-formbutton-foreground-disabled);
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .button:active:not(:disabled) {
      transform: none;
    }
    .footer {
      animation: none;
    }
  }
</style>
