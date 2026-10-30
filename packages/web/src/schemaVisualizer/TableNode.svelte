<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import { findForeignKeyForColumn } from 'dbgate-tools';
  import { getContext } from 'svelte';
  import { createDatabaseObjectMenu } from '../appobj/DatabaseObjectAppObject.svelte';
  import contextMenu from '../utility/contextMenu';
  import ErdIcon from './ErdIcon.svelte';

  export let id;
  export let data;
  export let selected = false;

  const highlight: any = getContext('schemaVisualizerHighlight');

  $: table = data.table;
  $: schemaPrefix = data.showSchemaName && table.schemaName ? `${table.schemaName}.` : null;
  $: highlightedColumns = $highlight.columns[id] || [];

  function isPrimaryKey(column) {
    return !!table.primaryKey?.columns?.find(x => x.columnName == column.columnName);
  }

  function createMenu() {
    return createDatabaseObjectMenu({ ...table, objectTypeField: 'tables', conid: data.conid, database: data.database });
  }
</script>

<div
  class="card"
  class:selected
  use:contextMenu={createMenu}
  data-testid={`TableNode_${table.pureName}`}
>
  <div class="header">
    <span class="table-icon"><ErdIcon name="table" size={14} /></span>
    <span class="table-name"
      >{#if schemaPrefix}<span class="schema-name">{schemaPrefix}</span>{/if}{table.pureName}</span
    >
  </div>
  <div class="columns">
    {#each table.columns || [] as column (column.columnName)}
      {@const primaryKey = isPrimaryKey(column)}
      {@const foreignKey = findForeignKeyForColumn(table, column)}
      <div class="row" class:highlighted={highlightedColumns.includes(column.columnName)}>
        <span class="key-icon" class:primaryKey class:foreignKey={!!foreignKey}>
          {#if primaryKey}
            <ErdIcon name="key" />
          {:else if foreignKey}
            <ErdIcon name="link" />
          {/if}
        </span>
        <span class="column-name" class:primaryKey>{column.columnName}</span>
        <span class="data-type">{(column.displayedDataType || column.dataType || '').toLowerCase()}</span>
        <Handle type="source" position={Position.Left} id={`${column.columnName}:left`} isConnectable={false} />
        <Handle type="source" position={Position.Right} id={`${column.columnName}:right`} isConnectable={false} />
      </div>
    {/each}
  </div>
</div>

<style>
  .card {
    min-width: 200px;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-lg);
    background: var(--theme-ui-bg);
    box-shadow: var(--theme-schema-visualizer-card-shadow);
    color: var(--theme-ui-text);
    font-size: 13px;
    line-height: 1.45;
    transition:
      border-color var(--dim-transition-fast),
      box-shadow var(--dim-transition-fast);
  }
  .card:hover {
    border-color: var(--theme-ui-border-strong);
  }
  .card.selected,
  .card.selected:hover {
    border-color: var(--theme-ui-accent);
    box-shadow:
      0 0 0 3px var(--theme-ui-accent-soft),
      var(--theme-schema-visualizer-card-shadow);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 12px;
    border-bottom: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-lg) var(--dim-radius-lg) 0 0;
    background: var(--theme-schema-visualizer-card-header-background);
    font-weight: 600;
    white-space: nowrap;
    cursor: grab;
  }
  .table-icon {
    display: flex;
    color: var(--theme-icon-blue);
  }
  .card.selected .table-icon {
    color: var(--theme-ui-accent-strong);
  }
  .schema-name {
    font-weight: 400;
    color: var(--theme-ui-text-tertiary);
  }

  .columns {
    padding: 4px 0;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 26px;
    padding: 0 12px;
    white-space: nowrap;
    transition: background-color var(--dim-transition-fast);
  }
  .row:hover {
    background: var(--theme-ui-hover);
  }
  .row.highlighted {
    background: var(--theme-ui-accent-soft);
  }
  .key-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    flex-shrink: 0;
    color: var(--theme-ui-text-tertiary);
  }
  .key-icon.primaryKey {
    color: var(--theme-icon-gold);
  }
  .row.highlighted .key-icon.foreignKey:not(.primaryKey) {
    color: var(--theme-ui-accent-strong);
  }
  .column-name {
    flex: 1;
  }
  .column-name.primaryKey {
    font-weight: 600;
  }
  .data-type {
    margin-left: 16px;
    color: var(--theme-ui-text-tertiary);
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, 'JetBrains Mono', Consolas, monospace;
    font-size: 11px;
  }
  .row.highlighted .data-type {
    color: var(--theme-ui-text-secondary);
  }

  /* relation lines attach to the row edges; the handles themselves stay invisible */
  .row :global(.svelte-flow__handle) {
    width: 1px;
    height: 1px;
    min-width: 0;
    min-height: 0;
    border: none;
    background: transparent;
    opacity: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .row {
      transition: none;
    }
  }
</style>
