<script lang="ts">
  import _ from 'lodash';
  import { getStringSettingsValue } from '../settings/settingsTools';
  import { stringifyCellValue } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import { _t } from '../translations';

  export let rowData;
  export let value;
  export let jsonParsedValue = undefined;
  export let editorTypes;
  export let rightMargin = false;

  $: stringified = stringifyCellValue(
    value,
    'gridCellIntent',
    editorTypes,
    { thousandsSeparator: getStringSettingsValue('dataGrid.thousandsSeparatorChar', 'none') },
    jsonParsedValue
  );

  // SQL NULL reads as a quiet keyword; booleans as a small check or dash (editing still uses true/false text)
  $: isSqlNull = value === null && !!editorTypes?.parseSqlNull;
  $: isBoolean = value === true || value === false;

  // $: console.log('CellValue', value, stringified);
</script>

{#if rowData == null}
  <span class="null">(No row)</span>
{:else if isSqlNull}
  <span class="nullCellStyle" class:rightMargin>{_t('datagrid.nullValue', { defaultMessage: 'NULL' })}</span>
{:else if isBoolean}
  <span
    class="boolean"
    class:isTrue={value}
    class:rightMargin
    role="img"
    title={stringified.value}
    aria-label={stringified.value}
  >
    {#if value}
      <FontIcon icon="icon check" />
    {:else}
      <span class="dash" aria-hidden="true">–</span>
    {/if}
  </span>
{:else}
  <span class={stringified.gridStyle} title={stringified.gridTitle} class:rightMargin>{stringified.value}</span>
{/if}

<style>
  .nullCellStyle {
    color: var(--theme-datagrid-foreground-grayed);
    font-style: italic;
  }
  .valueCellStyle {
    color: var(--theme-datagrid-cell-foreground-value-green);
  }

  .boolean {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    vertical-align: middle;
    color: var(--theme-datagrid-foreground-grayed);
  }
  .boolean.isTrue {
    color: var(--theme-ui-text-secondary);
    font-size: 15px;
  }
  .dash {
    line-height: 1;
  }

  .rightMargin {
    margin-right: 16px;
  }
</style>
