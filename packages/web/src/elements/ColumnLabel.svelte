<script context="module" lang="ts">
  export function getColumnIcon(column, forceIcon = false) {
    if (column.autoIncrement) return 'img autoincrement';
    if (column.foreignKey) return 'img foreign-key';
    if (forceIcon) return 'img column';
    return null;
  }
</script>

<script lang="ts">
  import { openDatabaseObjectDetail } from '../appobj/DatabaseObjectAppObject.svelte';

  import FontIcon from '../icons/FontIcon.svelte';
  import TokenizedFilteredText from '../widgets/TokenizedFilteredText.svelte';
  import { _t } from '../translations';
  import Link from './Link.svelte';

  export let notNull = false;
  export let forceIcon = false;
  export let headerText = '';
  export let columnName = '';
  export let extInfo = null;
  export let dataType = null;
  export let displayedDataType = null;
  export let showDataType = false;
  export let foreignKey;
  export let isPrimaryKey = false;
  export let conid = undefined;
  export let database = undefined;
  export let iconOverride = undefined;
  export let filter = undefined;
  // grid header: neutral key and link icons in place of the column type icon
  export let keyIcons = false;
  // column list: one fixed key slot, name cut with an ellipsis, type on the right
  export let listLayout = false;

  $: icon = iconOverride || (keyIcons ? null : getColumnIcon($$props, forceIcon));
  $: showPrimaryKeyIcon = keyIcons && isPrimaryKey;
  $: showForeignKeyIcon = keyIcons && foreignKey && !(listLayout && isPrimaryKey);
  $: canOpenReference = !!(foreignKey && conid && database);

  function openReferencedTable() {
    openDatabaseObjectDetail('TableDataTab', null, {
      schemaName: foreignKey.refSchemaName,
      pureName: foreignKey.refTableName,
      conid,
      database,
      objectTypeField: 'tables',
    });
  }

  function getReferenceTitle(fk, canOpen) {
    const table = fk.refSchemaName ? `${fk.refSchemaName}.${fk.refTableName}` : fk.refTableName;
    const columns = (fk.columns || []).map(x => x.refColumnName).join(', ');
    const title = columns
      ? _t('columnLabel.referencesColumns', {
          defaultMessage: 'References {table} ({columns})',
          values: { table, columns },
        })
      : _t('columnLabel.referencesTable', { defaultMessage: 'References {table}', values: { table } });
    if (!canOpen) return title;
    return `${title}\n${_t('columnLabel.clickToOpenTable', { defaultMessage: 'Click to open the table' })}`;
  }
</script>

<span class="label" class:notNull class:listLayout>
  <span class="keys">
    {#if showPrimaryKeyIcon}
      <span
        class="key-icon"
        title={_t('columnLabel.primaryKey', { defaultMessage: 'Primary key' })}
        data-testid="ColumnLabel_primaryKeyIcon"
      >
        <FontIcon icon="icon primary-key" />
      </span>
    {/if}
    {#if showForeignKeyIcon}
      <span
        class="key-icon"
        class:clickable={canOpenReference}
        title={getReferenceTitle(foreignKey, canOpenReference)}
        role="button"
        tabindex="-1"
        aria-disabled={!canOpenReference}
        data-testid="ColumnLabel_foreignKeyIcon"
        on:mousedown={e => {
          // keep the grid from selecting the column
          if (canOpenReference) e.stopPropagation();
        }}
        on:click={e => {
          if (!canOpenReference) return;
          e.stopPropagation();
          openReferencedTable();
        }}
      >
        <FontIcon icon="icon foreign-key" />
      </span>
    {/if}
  </span>
  {#if icon}
    <FontIcon {icon} />
  {/if}
  <span class="name"><TokenizedFilteredText text={headerText || columnName} {filter} /></span>
  {#if extInfo}
    <span class="extinfo">{extInfo}</span>
  {/if}
  {#if showDataType}
    {#if foreignKey}
      <span class="extinfo">
        <FontIcon icon="icon arrow-right" />
        {#if conid && database}
          <Link
            onClick={e => {
              e.stopPropagation();
              openReferencedTable();
            }}>{foreignKey.refTableName}</Link
          >
        {:else}
          {foreignKey.refTableName}
        {/if}
      </span>
    {:else if dataType}
      <span class="extinfo">{(displayedDataType || dataType).toLowerCase()}</span>
    {/if}
  {/if}
</span>

<style>
  .label {
    white-space: nowrap;
  }

  .label.notNull {
    font-weight: bold;
  }

  .extinfo {
    font-weight: normal;
    margin-left: 5px;
    color: var(--theme-datagrid-foreground-grayed);
  }

  .key-icon {
    display: inline-block;
    font-size: 14px;
    line-height: 1;
    vertical-align: -1px;
    margin-right: 4px;
    color: var(--theme-datagrid-foreground-grayed);
  }

  .key-icon.clickable {
    cursor: pointer;
  }

  .key-icon.clickable:hover {
    color: var(--theme-link-foreground);
  }

  .keys {
    display: contents;
  }

  .label.listLayout {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .label.listLayout.notNull {
    font-weight: 600;
  }

  .listLayout .keys {
    display: inline-flex;
    flex: none;
    justify-content: center;
    width: 14px;
    margin-right: 6px;
  }

  .listLayout .key-icon {
    margin-right: 0;
    font-size: 13px;
  }

  .listLayout .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .listLayout .extinfo {
    flex: 0 3 auto;
    min-width: 0;
    max-width: 60%;
    margin-left: auto;
    padding-left: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }

  .listLayout .extinfo :global(.mdi) {
    font-size: 11px;
  }
</style>
