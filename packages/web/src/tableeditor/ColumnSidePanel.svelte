<script lang="ts">
  import _ from 'lodash';
  import { tick } from 'svelte';
  import {
    editorAddColumn,
    editorAddConstraint,
    editorDeleteConstraint,
    editorModifyColumn,
    editorModifyConstraint,
    filterName,
    fullNameFromString,
    fullNameToString,
    generateTablePairingId,
  } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import InspectorHero from '../inspector/InspectorHero.svelte';
  import { useDatabaseInfo } from '../utility/metadataLoaders';
  import ColumnPanelSwitch from './ColumnPanelSwitch.svelte';
  import {
    confirmDeleteColumn,
    confirmTableAlter,
    findSingleColumnForeignKey,
    findSingleColumnUnique,
    findTable,
  } from './columnAlterTools';
  import { _t } from '../translations';

  export let conid;
  export let database;
  export let schemaName;
  export let pureName;
  // Empty when adding a new column
  export let columnName = null;
  export let driver;
  export let onSaved = null;
  // called when the edit is saved, deleted or cancelled
  export let onClose;

  const dbInfo = useDatabaseInfo({ conid, database });

  $: isEdit = !!columnName;
  $: dialect = driver?.dialect;
  $: table = findTable($dbInfo, schemaName, pureName);
  $: supportsComment = !!dialect?.columnProperties?.columnComment;
  $: dataTypes = dialect?.predefinedDataTypes || ['int', 'varchar(250)', 'datetime', 'numeric(10,2)', 'float'];

  let initialized = false;
  let missingColumn = false;
  let name = '';
  let dataType = '';
  let defaultValue = '';
  let nullable = true;
  let isUnique = false;
  let isPrimaryKey = false;
  let refTableKey = '';
  let refColumnName = '';
  let comment = '';

  let showErrors = false;
  let nothingToSave = false;
  let domName;

  $: if (!initialized && table) initForm(table);

  function initForm(tbl) {
    initialized = true;
    const column = isEdit ? tbl.columns?.find(x => x.columnName == columnName) : null;
    if (isEdit && !column) {
      missingColumn = true;
      return;
    }
    if (!column) return;
    const fk = findSingleColumnForeignKey(tbl, columnName);
    name = column.columnName;
    dataType = column.dataType ?? '';
    defaultValue = column.defaultValue ?? '';
    nullable = !column.notNull;
    isPrimaryKey = !!tbl.primaryKey?.columns?.find(x => x.columnName == columnName);
    isUnique = !!findSingleColumnUnique(tbl, columnName);
    refTableKey = fk ? fullNameToString({ schemaName: fk.refSchemaName, pureName: fk.refTableName }) : '';
    refColumnName = fk?.columns?.[0]?.refColumnName ?? '';
    comment = column.columnComment ?? '';
  }

  function tableLabel(tbl) {
    return tbl.schemaName && tbl.schemaName != dialect?.defaultSchemaName
      ? `${tbl.schemaName}.${tbl.pureName}`
      : tbl.pureName;
  }

  $: refTables = _.sortBy($dbInfo?.tables || [], [
    x => x.schemaName != dialect?.defaultSchemaName,
    'schemaName',
    'pureName',
  ]);
  $: refTable = refTableKey ? findTable($dbInfo, ...nameParts(refTableKey)) : null;

  function nameParts(key): [string, string] {
    const parsed = fullNameFromString(key);
    return [parsed.schemaName, parsed.pureName];
  }

  // Preselect the referenced table's single-column primary key
  function handleRefTableChange(key) {
    refTableKey = key;
    const tbl = key ? findTable($dbInfo, ...nameParts(key)) : null;
    const pkColumns = tbl?.primaryKey?.columns || [];
    refColumnName = (pkColumns.length == 1 ? pkColumns[0].columnName : tbl?.columns?.[0]?.columnName) ?? '';
  }

  // ---- type combobox
  let typeListOpen = false;
  let typeFilter = '';
  let typeActive = 0;
  let domTypeList;
  // Chrome drops the selection on the mouseup that follows focus, so skip that one
  let keepTypeSelection = false;

  // Types starting with the typed text come first, so "int" offers int before bigint
  $: filteredTypes = _.sortBy(
    dataTypes.filter(type => !typeFilter || filterName(typeFilter, type)),
    type => (type.toLowerCase().startsWith(typeFilter.trim().toLowerCase()) ? 0 : 1)
  );
  $: if (typeActive >= filteredTypes.length) typeActive = Math.max(filteredTypes.length - 1, 0);

  async function openTypeList(filter = '') {
    typeFilter = filter;
    typeListOpen = true;
    // wait for the filtered list, then highlight the current type if it is there
    await tick();
    typeActive = Math.max(
      filteredTypes.findIndex(x => x.toLowerCase() == dataType.trim().toLowerCase()),
      0
    );
    await tick();
    scrollActiveType();
  }

  function scrollActiveType() {
    domTypeList?.children?.[typeActive]?.scrollIntoView({ block: 'nearest' });
  }

  function pickType(type) {
    dataType = type;
    typeListOpen = false;
  }

  async function handleTypeKeyDown(e) {
    if (e.key == 'ArrowDown' || e.key == 'ArrowUp') {
      e.preventDefault();
      if (!typeListOpen) {
        openTypeList();
        return;
      }
      const count = filteredTypes.length;
      if (!count) return;
      typeActive = (typeActive + (e.key == 'ArrowDown' ? 1 : -1) + count) % count;
      await tick();
      scrollActiveType();
    } else if (e.key == 'Enter' && typeListOpen && filteredTypes[typeActive]) {
      e.preventDefault();
      pickType(filteredTypes[typeActive]);
    } else if (e.key == 'Escape' && typeListOpen) {
      // keeps the editor open, see handleKeyDown
      e.preventDefault();
      typeListOpen = false;
    }
  }

  // ---- validation and save
  $: trimmedName = name.trim();
  $: nameError = !trimmedName
    ? _t('columnPanel.nameRequired', { defaultMessage: 'Enter a column name' })
    : table?.columns?.some(
          x => x.columnName.toLowerCase() == trimmedName.toLowerCase() && x.columnName != columnName
        )
      ? _t('columnPanel.nameTaken', { defaultMessage: 'This table already has a column with this name' })
      : null;
  $: typeError = !dataType.trim() ? _t('columnPanel.typeRequired', { defaultMessage: 'Choose a data type' }) : null;
  $: referenceError =
    refTableKey && !refColumnName
      ? _t('columnPanel.referenceColumnRequired', { defaultMessage: 'Choose the referenced column' })
      : null;
  $: hasErrors = !!(nameError || typeError || referenceError);
  $: canEdit = initialized && !missingColumn && !!table;

  function buildNewTable(base) {
    const oldColumn = isEdit ? base.columns.find(x => x.columnName == columnName) : null;
    const editedColumn = {
      ...(oldColumn || { pureName, schemaName }),
      columnName: trimmedName,
      dataType: dataType.trim(),
      defaultValue: defaultValue.trim() || undefined,
      notNull: isPrimaryKey || !nullable,
      columnComment: supportsComment ? comment.trim() || undefined : oldColumn?.columnComment,
      isPrimaryKey,
    };
    let res = oldColumn ? editorModifyColumn(base, editedColumn) : editorAddColumn(base, editedColumn);

    const oldUnique = isEdit ? findSingleColumnUnique(base, columnName) : null;
    if (isUnique && !oldUnique) {
      res = editorAddConstraint(res, {
        constraintType: 'unique',
        pureName,
        schemaName,
        columns: [{ columnName: trimmedName }],
      });
    } else if (!isUnique && oldUnique) {
      res = editorDeleteConstraint(res, oldUnique);
    }

    const oldForeignKey = isEdit ? findSingleColumnForeignKey(base, columnName) : null;
    const [refSchemaName, refTableName] = refTableKey ? nameParts(refTableKey) : [null, null];
    const fkColumns = [{ columnName: trimmedName, refColumnName }];
    if (refTableName && !oldForeignKey) {
      res = editorAddConstraint(res, {
        constraintType: 'foreignKey',
        pureName,
        schemaName,
        refSchemaName,
        refTableName,
        columns: fkColumns,
      });
    } else if (refTableName) {
      const isChanged =
        oldForeignKey.refTableName != refTableName ||
        (oldForeignKey.refSchemaName ?? null) != (refSchemaName ?? null) ||
        oldForeignKey.columns[0].refColumnName != refColumnName;
      if (isChanged) {
        res = editorModifyConstraint(res, { ...oldForeignKey, refSchemaName, refTableName, columns: fkColumns });
      }
    } else if (oldForeignKey) {
      res = editorDeleteConstraint(res, oldForeignKey);
    }
    return res;
  }

  function handleSave() {
    showErrors = true;
    nothingToSave = false;
    if (!canEdit || hasErrors) return;
    const base = generateTablePairingId(table);
    const hasChanges = confirmTableAlter({ conid, database, driver }, $dbInfo, base, buildNewTable(base), {
      onApplied: close,
      onSaved,
    });
    if (!hasChanges) nothingToSave = true;
  }

  function handleDelete() {
    confirmDeleteColumn(
      { conid, database, driver },
      { schemaName, pureName, columnName },
      { onApplied: close, onSaved }
    );
  }

  // ---- open / close
  function close() {
    onClose?.();
  }

  function handleKeyDown(e) {
    if (e.key != 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }

  export async function focusPanel() {
    await tick();
    // the inspector may still be sliding in, so don't let the focus scroll the page
    domName?.focus({ preventScroll: true });
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<section
  class="column-editor"
  aria-label={isEdit
    ? _t('columnPanel.editTitle', { defaultMessage: 'Edit column' })
    : _t('columnPanel.addTitle', { defaultMessage: 'Add column' })}
  on:keydown={handleKeyDown}
  data-testid="ColumnSidePanel_sheet"
>
  <InspectorHero
    icon={isEdit ? 'mdi mdi-table-column' : 'icon add-column'}
    title={isEdit
      ? _t('columnPanel.editTitle', { defaultMessage: 'Edit column' })
      : _t('columnPanel.addTitle', { defaultMessage: 'Add column' })}
    subtitle={isEdit ? columnName : schemaName ? `${schemaName}.${pureName}` : pureName}
  />

  {#if missingColumn}
    <div class="sheet-body">
      <div class="notice">
        {_t('columnPanel.columnMissing', {
          defaultMessage: 'Column {name} no longer exists in this table.',
          values: { name: columnName },
        })}
      </div>
    </div>
  {:else}
    <form class="sheet-body" id="ColumnSidePanel_form" on:submit|preventDefault={handleSave} autocomplete="off">
      <div class="field">
        <label class="field-label" for="ColumnSidePanel_name"
          >{_t('columnPanel.name', { defaultMessage: 'Name' })}</label
        >
        <input
          id="ColumnSidePanel_name"
          class="input"
          class:invalid={showErrors && nameError}
          bind:value={name}
          bind:this={domName}
          spellcheck="false"
          placeholder={_t('columnPanel.namePlaceholder', { defaultMessage: 'column_name' })}
          data-testid="ColumnSidePanel_name"
        />
        {#if showErrors && nameError}
          <div class="field-error">{nameError}</div>
        {/if}
      </div>

      <div class="field">
        <label class="field-label" for="ColumnSidePanel_type"
          >{_t('columnPanel.type', { defaultMessage: 'Type' })}</label
        >
        <div class="combo">
          <input
            id="ColumnSidePanel_type"
            class="input combo-input"
            class:invalid={showErrors && typeError}
            bind:value={dataType}
            spellcheck="false"
            role="combobox"
            aria-expanded={typeListOpen}
            aria-controls="ColumnSidePanel_typeList"
            aria-autocomplete="list"
            placeholder={_t('columnPanel.typePlaceholder', { defaultMessage: 'Search or type, e.g. varchar(100)' })}
            on:focus={e => {
              e.currentTarget.select();
              keepTypeSelection = true;
              openTypeList();
            }}
            on:mouseup={e => {
              if (keepTypeSelection) e.preventDefault();
              keepTypeSelection = false;
            }}
            on:click={() => !typeListOpen && openTypeList()}
            on:input={() => openTypeList(dataType)}
            on:keydown={handleTypeKeyDown}
            on:blur={() => (typeListOpen = false)}
            data-testid="ColumnSidePanel_type"
          />
          <span class="combo-chevron"><FontIcon icon="icon chevron-down" /></span>
          {#if typeListOpen && filteredTypes.length > 0}
            <ul class="combo-list" id="ColumnSidePanel_typeList" role="listbox" bind:this={domTypeList}>
              {#each filteredTypes as type, index (type)}
                <li
                  role="option"
                  class:active={index == typeActive}
                  aria-selected={type == dataType}
                  on:mousedown|preventDefault={() => pickType(type)}
                  on:mousemove={() => (typeActive = index)}
                >
                  <span class="combo-option">{type}</span>
                  {#if type == dataType}
                    <FontIcon icon="icon check" />
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        {#if showErrors && typeError}
          <div class="field-error">{typeError}</div>
        {/if}
      </div>

      <div class="field">
        <label class="field-label" for="ColumnSidePanel_default"
          >{_t('columnPanel.defaultValue', { defaultMessage: 'Default value' })}</label
        >
        <input
          id="ColumnSidePanel_default"
          class="input mono"
          bind:value={defaultValue}
          spellcheck="false"
          placeholder={_t('columnPanel.defaultPlaceholder', { defaultMessage: "None, or e.g. 0, 'text', now()" })}
          data-testid="ColumnSidePanel_default"
        />
        <div class="field-hint">
          {_t('columnPanel.defaultHint', { defaultMessage: 'SQL expression, written as is. Quote text values.' })}
        </div>
      </div>

      <div class="group-label">{_t('columnPanel.constraints', { defaultMessage: 'Constraints' })}</div>
      <div class="card">
        {#if !dialect?.specificNullabilityImplementation}
          <ColumnPanelSwitch
            bind:checked={nullable}
            disabled={isPrimaryKey}
            label={_t('columnPanel.nullable', { defaultMessage: 'Nullable' })}
            hint={isPrimaryKey
              ? _t('columnPanel.nullablePrimaryKeyHint', { defaultMessage: 'Primary key columns are never null' })
              : _t('columnPanel.nullableHint', { defaultMessage: 'Rows may leave this value empty' })}
            data-testid="ColumnSidePanel_nullable"
          />
        {/if}
        {#if !dialect?.omitUniqueConstraints}
          <ColumnPanelSwitch
            bind:checked={isUnique}
            label={_t('columnPanel.unique', { defaultMessage: 'Unique' })}
            hint={_t('columnPanel.uniqueHint', { defaultMessage: 'No two rows share a value' })}
            data-testid="ColumnSidePanel_unique"
          />
        {/if}
        <ColumnPanelSwitch
          bind:checked={isPrimaryKey}
          label={_t('columnPanel.primaryKey', { defaultMessage: 'Primary key' })}
          hint={_t('columnPanel.primaryKeyHint', { defaultMessage: 'Identifies each row' })}
          data-testid="ColumnSidePanel_primaryKey"
        />
      </div>

      {#if !dialect?.omitForeignKeys}
        <div class="group-label">{_t('columnPanel.foreignKey', { defaultMessage: 'Foreign key' })}</div>
        <div class="field">
          <label class="field-label" for="ColumnSidePanel_refTable"
            >{_t('columnPanel.referencedTable', { defaultMessage: 'References table' })}</label
          >
          <div class="select">
            <select
              id="ColumnSidePanel_refTable"
              class="input"
              value={refTableKey}
              on:change={e => handleRefTableChange(e.currentTarget.value)}
              data-testid="ColumnSidePanel_refTable"
            >
              <option value="">{_t('columnPanel.noReference', { defaultMessage: 'None' })}</option>
              {#each refTables as tbl (fullNameToString(tbl))}
                <option value={fullNameToString(tbl)}>{tableLabel(tbl)}</option>
              {/each}
            </select>
            <span class="combo-chevron"><FontIcon icon="icon chevron-down" /></span>
          </div>
        </div>
        {#if refTableKey}
          <div class="field">
            <label class="field-label" for="ColumnSidePanel_refColumn"
              >{_t('columnPanel.referencedColumn', { defaultMessage: 'Referenced column' })}</label
            >
            <div class="select">
              <select
                id="ColumnSidePanel_refColumn"
                class="input"
                class:invalid={showErrors && referenceError}
                bind:value={refColumnName}
                data-testid="ColumnSidePanel_refColumn"
              >
                {#each refTable?.columns || [] as refColumn (refColumn.columnName)}
                  <option value={refColumn.columnName}>{refColumn.columnName} · {refColumn.dataType}</option>
                {/each}
              </select>
              <span class="combo-chevron"><FontIcon icon="icon chevron-down" /></span>
            </div>
            {#if showErrors && referenceError}
              <div class="field-error">{referenceError}</div>
            {/if}
          </div>
        {/if}
      {/if}

      <div class="field">
        <label class="field-label" for="ColumnSidePanel_comment"
          >{_t('columnPanel.comment', { defaultMessage: 'Comment' })}</label
        >
        <textarea
          id="ColumnSidePanel_comment"
          class="input textarea"
          rows="2"
          bind:value={comment}
          disabled={!supportsComment}
          placeholder={supportsComment
            ? _t('columnPanel.commentPlaceholder', { defaultMessage: 'What this column holds' })
            : ''}
          data-testid="ColumnSidePanel_comment"
        />
        {#if !supportsComment}
          <div class="field-hint">
            {_t('columnPanel.commentUnsupported', {
              defaultMessage: 'Column comments are not supported for this database yet.',
            })}
          </div>
        {/if}
      </div>
    </form>
  {/if}

  <footer class="sheet-footer">
    {#if isEdit && canEdit}
      <button type="button" class="button danger" on:click={handleDelete} data-testid="ColumnSidePanel_deleteButton">
        <FontIcon icon="icon delete" />
        {_t('columnPanel.delete', { defaultMessage: 'Delete' })}
      </button>
    {/if}
    <span class="footer-note" role="status">
      {#if nothingToSave}
        {_t('columnPanel.nothingToSave', { defaultMessage: 'No changes to save' })}
      {/if}
    </span>
    <button type="button" class="button" on:click={close} data-testid="ColumnSidePanel_cancelButton">
      {_t('common.cancel', { defaultMessage: 'Cancel' })}
    </button>
    <button
      type="submit"
      form="ColumnSidePanel_form"
      class="button primary"
      disabled={!canEdit}
      data-testid="ColumnSidePanel_saveButton"
    >
      {isEdit
        ? _t('columnPanel.reviewChanges', { defaultMessage: 'Review changes' })
        : _t('columnPanel.reviewAdd', { defaultMessage: 'Add column' })}
    </button>
  </footer>
</section>

<style>
  .column-editor {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--theme-generic-font);
    font-size: 13px;
  }

  .sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 16px 20px;
    border-top: 1px solid var(--theme-ui-border-subtle);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  /* the body scrolls instead of squeezing its fields */
  .sheet-body > :global(*) {
    flex-shrink: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-ui-text-secondary);
  }
  .field-hint {
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }
  .field-error {
    font-size: 11.5px;
    color: var(--theme-generic-font-error);
  }
  .group-label {
    margin: 4px 0 -6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--theme-generic-font-grayed);
  }

  .input {
    width: 100%;
    height: 34px;
    box-sizing: border-box;
    padding: 0 10px;
    border: var(--theme-input-border);
    border-radius: var(--dim-radius-md);
    background: var(--theme-input-background);
    color: var(--theme-input-foreground);
    font: inherit;
    outline: none;
    transition:
      border-color var(--dim-transition-fast),
      box-shadow var(--dim-transition-fast);
  }
  .input::placeholder {
    color: var(--theme-input-placeholder);
  }
  .input:hover:not(:disabled) {
    border: var(--theme-input-border-hover);
  }
  .input:focus {
    border: var(--theme-input-border-focus);
    box-shadow: var(--theme-input-focus-ring);
  }
  .input.invalid {
    border-color: var(--theme-generic-font-error);
  }
  .input:disabled {
    background: var(--theme-input-background-disabled);
    color: var(--theme-input-foreground-disabled);
    border: var(--theme-input-border-disabled);
    cursor: not-allowed;
  }
  .input.mono {
    font-family: var(--theme-font-monospace, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12.5px;
  }
  .textarea {
    height: auto;
    min-height: 56px;
    padding: 8px 10px;
    resize: vertical;
  }

  .combo,
  .select {
    position: relative;
  }
  .combo-input,
  .select .input {
    padding-right: 30px;
  }
  .select select {
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  .combo-chevron {
    position: absolute;
    right: 9px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--theme-generic-font-grayed);
    font-size: 15px;
    pointer-events: none;
  }
  .combo-list {
    position: absolute;
    z-index: 2;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 240px;
    overflow-y: auto;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--theme-modal-background);
    border: var(--theme-modal-border);
    border-radius: 10px;
    box-shadow: var(--theme-popup-shadow);
  }
  .combo-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 8px;
    border-radius: var(--dim-radius-sm);
    cursor: pointer;
  }
  .combo-list li.active {
    background: var(--theme-menu-item-hover);
  }
  .combo-list li :global(.mdi) {
    color: var(--theme-ui-accent-strong);
  }
  .combo-option {
    flex: 1;
    min-width: 0;
    font-family: var(--theme-font-monospace, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card {
    border: var(--theme-modal-border);
    border-radius: 10px;
    background: var(--theme-input-background);
    overflow: hidden;
  }
  .card > :global(* + *) {
    border-top: var(--theme-modal-border);
  }

  .notice {
    padding: 12px;
    border-radius: var(--dim-radius-md);
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font-grayed);
  }

  .sheet-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 10px 16px;
    border-top: var(--theme-modal-border);
    background: var(--theme-modal-footer-background);
  }
  .footer-note {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
  }
  .button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    border: var(--theme-outlinebutton-border);
    border-radius: var(--dim-radius-md);
    background: var(--theme-outlinebutton-background);
    color: var(--theme-outlinebutton-foreground);
    font: inherit;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }
  .button:hover:not(:disabled) {
    background: var(--theme-outlinebutton-hover-background);
    border: var(--theme-outlinebutton-hover-border);
  }
  .button:active:not(:disabled) {
    transform: scale(0.98);
  }
  .button.primary {
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
    cursor: not-allowed;
  }
  .button.danger {
    padding: 0 10px;
    border-color: transparent;
    background: transparent;
    color: var(--theme-generic-font-error);
  }
  .button.danger:hover {
    border-color: transparent;
    background: color-mix(in srgb, var(--theme-generic-font-error) 12%, transparent);
  }
</style>
