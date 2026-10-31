<script lang="ts" context="module">
  // Stats of a column stay for a minute, so moving the cursor across columns doesn't query again
  const STATS_CACHE_MS = 60000;
  const statsCache = new Map<string, { time: number; stats?: any; errorMessage?: string }>();
</script>

<script lang="ts">
  import _ from 'lodash';
  import { onDestroy } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import { openDatabaseObjectDetail } from '../appobj/DatabaseObjectAppObject.svelte';
  import ColumnQuickStatsView from '../datagrid/ColumnQuickStatsView.svelte';
  import { loadColumnQuickStats } from '../datagrid/columnQuickStats';
  import { findSingleColumnUnique } from '../tableeditor/columnAlterTools';
  import { copyTextToClipboard } from '../utility/clipboard';
  import { _t } from '../translations';
  import InspectorHero from './InspectorHero.svelte';
  import type { TableInspector } from './tableInspector';

  export let inspector: TableInspector;
  export let conid;
  export let database;
  export let driver;
  export let table;
  export let columnName;
  export let allowStructureEdit = false;

  $: column = table?.columns?.find(x => x.columnName == columnName);
  $: isPrimaryKey = !!table?.primaryKey?.columns?.some(x => x.columnName == columnName);
  $: isUnique = !!findSingleColumnUnique(table, columnName);
  $: foreignKeys = (table?.foreignKeys ?? []).filter(fk => fk.columns?.some(x => x.columnName == columnName));
  $: referencedBy = (table?.dependencies ?? []).filter(fk => fk.columns?.some(x => x.refColumnName == columnName));
  $: allowQuickStats = !!column && !!driver?.databaseEngineTypes?.includes('sql');

  function cleanDefault(value) {
    // 'USD'::bpchar -> 'USD'
    return String(value).replace(/::[\w\s"]+(\[\])?$/, '');
  }

  function refLabel(fk) {
    const target = fk.columns.find(x => x.columnName == columnName) ?? fk.columns[0];
    return `${fk.refTableName}.${target?.refColumnName ?? ''}`;
  }

  function dependencyLabel(fk) {
    const source = fk.columns.find(x => x.refColumnName == columnName) ?? fk.columns[0];
    return `${fk.pureName}.${source?.columnName ?? ''}`;
  }

  function openTable(schemaName, pureName) {
    openDatabaseObjectDetail('TableDataTab', null, {
      schemaName,
      pureName,
      conid,
      database,
      objectTypeField: 'tables',
    } as any);
  }

  // ---- quick stats
  let stats = null;
  let statsError = null;
  let statsLoading = false;
  let statsTimer = null;
  let statsToken = 0;

  $: statsKey =
    column && table ? `${conid}|${database}|${table.schemaName}.${table.pureName}.${column.columnName}` : null;
  $: if (allowQuickStats) scheduleStats(statsKey);

  function scheduleStats(key, force = false) {
    clearTimeout(statsTimer);
    const token = ++statsToken;
    const cached = key && !force ? statsCache.get(key) : null;
    if (cached && Date.now() - cached.time < STATS_CACHE_MS) {
      stats = cached.stats;
      statsError = cached.errorMessage;
      statsLoading = false;
      return;
    }
    stats = null;
    statsError = null;
    statsLoading = true;
    if (!key) return;
    // wait until the cursor rests on a column
    statsTimer = setTimeout(() => loadStats(key, token), force ? 0 : 350);
  }

  async function loadStats(key, token) {
    const entry: { time: number; stats?: any; errorMessage?: string } = { time: Date.now() };
    try {
      entry.stats = await loadColumnQuickStats(conid, database, driver, {
        schemaName: table.schemaName,
        pureName: table.pureName,
        columnName: column.columnName,
        dataType: column.dataType,
      });
    } catch (err) {
      entry.errorMessage = err?.message || String(err);
    }
    statsCache.set(key, entry);
    if (token != statsToken) return;
    stats = entry.stats;
    statsError = entry.errorMessage;
    statsLoading = false;
  }

  onDestroy(() => clearTimeout(statsTimer));
</script>

<div class="column-section" data-testid="InspectorColumnSection_container">
  <InspectorHero
    icon={isPrimaryKey
      ? 'mdi mdi-key-variant'
      : foreignKeys.length > 0
        ? 'mdi mdi-link-variant'
        : 'mdi mdi-table-column'}
    title={columnName}
    subtitle={column?.dataType ? String(column.dataType).toLowerCase() : null}
  >
    <svelte:fragment slot="trailing">
      <button
        class="icon-button"
        on:click={() => copyTextToClipboard(columnName)}
        title={_t('columnMenu.copyName', { defaultMessage: 'Copy column name' })}
        data-testid="InspectorColumnSection_copyName"
      >
        <FontIcon icon="icon copy" />
      </button>
    </svelte:fragment>
  </InspectorHero>

  <div class="body">
    {#if !column}
      <div class="empty">
        {_t('columnPanel.columnMissing', {
          defaultMessage: 'Column {name} no longer exists in this table.',
          values: { name: columnName },
        })}
      </div>
    {:else}
      <div class="group-label">{_t('inspector.column.attributes', { defaultMessage: 'Attributes' })}</div>
      <dl class="card facts">
        <div class="fact">
          <dt>{_t('columnPanel.type', { defaultMessage: 'Type' })}</dt>
          <dd class="mono" data-testid="InspectorColumnSection_type">{column.dataType ?? '—'}</dd>
        </div>
        <div class="fact">
          <dt>{_t('columnPanel.nullable', { defaultMessage: 'Nullable' })}</dt>
          <dd>
            {column.notNull
              ? _t('inspector.column.notNull', { defaultMessage: 'No, NOT NULL' })
              : _t('inspector.column.yes', { defaultMessage: 'Yes' })}
          </dd>
        </div>
        <div class="fact">
          <dt>{_t('columnPanel.defaultValue', { defaultMessage: 'Default value' })}</dt>
          <dd class:mono={column.defaultValue != null} class:muted={column.defaultValue == null}>
            {#if column.autoIncrement}
              {_t('inspector.column.autoIncrement', { defaultMessage: 'Auto increment' })}
            {:else if column.defaultValue != null}
              <span title={column.defaultValue}>{cleanDefault(column.defaultValue)}</span>
            {:else}
              {_t('columnPanel.noReference', { defaultMessage: 'None' })}
            {/if}
          </dd>
        </div>
        <div class="fact">
          <dt>{_t('inspector.column.key', { defaultMessage: 'Key' })}</dt>
          <dd class:muted={!isPrimaryKey && !isUnique}>
            {#if isPrimaryKey}
              <span class="badge key">
                <FontIcon icon="mdi mdi-key-variant" />
                {_t('columnPanel.primaryKey', { defaultMessage: 'Primary key' })}
              </span>
            {:else if isUnique}
              <span class="badge">{_t('columnPanel.unique', { defaultMessage: 'Unique' })}</span>
            {:else}
              {_t('columnPanel.noReference', { defaultMessage: 'None' })}
            {/if}
          </dd>
        </div>
        {#each foreignKeys as fk}
          <div class="fact">
            <dt>{_t('columnPanel.referencedTable', { defaultMessage: 'References table' })}</dt>
            <dd>
              <button
                class="link mono"
                on:click={() => openTable(fk.refSchemaName, fk.refTableName)}
                title={_t('columnMenu.openReferencedTable', {
                  defaultMessage: 'Open {table}',
                  values: { table: fk.refTableName },
                })}
                data-testid="InspectorColumnSection_reference"
              >
                {refLabel(fk)}
              </button>
            </dd>
          </div>
        {/each}
        {#if column.columnComment}
          <div class="fact stacked">
            <dt>{_t('columnPanel.comment', { defaultMessage: 'Comment' })}</dt>
            <dd class="comment">{column.columnComment}</dd>
          </div>
        {/if}
      </dl>

      {#if referencedBy.length > 0}
        <div class="group-label">
          {_t('inspector.column.referencedBy', { defaultMessage: 'Referenced by' })}
          <span class="count">{referencedBy.length}</span>
        </div>
        <div class="card list">
          {#each referencedBy as fk}
            <button
              class="list-row"
              on:click={() => openTable(fk.schemaName, fk.pureName)}
              title={_t('columnMenu.openReferencedTable', {
                defaultMessage: 'Open {table}',
                values: { table: fk.pureName },
              })}
            >
              <FontIcon icon="mdi mdi-table-arrow-left" />
              <span class="mono">{dependencyLabel(fk)}</span>
            </button>
          {/each}
        </div>
      {/if}

      {#if allowQuickStats}
        <div class="group-label">
          {_t('columnStats.title', { defaultMessage: 'Quick stats' })}
          <span class="spacer" />
          <button
            class="mini-button"
            on:click={() => scheduleStats(statsKey, true)}
            disabled={statsLoading}
            title={_t('inspector.column.refreshStats', { defaultMessage: 'Count again' })}
            data-testid="InspectorColumnSection_refreshStats"
          >
            <FontIcon icon="icon reload" />
          </button>
        </div>
        <div class="card stats" data-testid="InspectorColumnSection_stats">
          <ColumnQuickStatsView {driver} {stats} errorMessage={statsError} isLoading={statsLoading} />
        </div>
      {/if}

      {#if allowStructureEdit}
        <button
          class="edit-button"
          on:click={() => inspector.editColumn(columnName)}
          data-testid="InspectorColumnSection_edit"
        >
          <FontIcon icon="mdi mdi-pencil-outline" />
          {_t('columnMenu.editColumn', { defaultMessage: 'Edit column…' })}
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .column-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    font-size: 13px;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 16px 20px;
    border-top: 1px solid var(--theme-ui-border-subtle);
  }
  .empty {
    padding: 20px 0;
    color: var(--theme-generic-font-grayed);
  }

  .group-label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    margin: 14px 2px 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-ui-text-secondary);
  }
  .count {
    padding: 0 6px;
    border-radius: 9px;
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font-grayed);
    font-size: 11px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    flex: 1;
  }

  .card {
    margin: 0;
    border-radius: 10px;
    background: var(--theme-ui-bg);
    box-shadow: inset 0 0 0 1px var(--theme-ui-border);
    overflow: hidden;
  }

  .fact {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-height: 20px;
    padding: 7px 12px;
  }
  .fact + .fact {
    border-top: 1px solid var(--theme-ui-border-subtle);
  }
  .fact.stacked {
    flex-direction: column;
    gap: 3px;
  }
  dt {
    flex-shrink: 0;
    width: 104px;
    color: var(--theme-generic-font-grayed);
  }
  .fact.stacked dt {
    width: auto;
  }
  dd {
    flex: 1;
    min-width: 0;
    margin: 0;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fact.stacked dd {
    text-align: left;
  }
  dd.muted {
    color: var(--theme-generic-font-grayed);
  }
  dd.comment {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .mono {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 18px;
    padding: 0 7px;
    border-radius: 5px;
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
    font-size: 11px;
    font-weight: 600;
  }
  .badge.key {
    background: var(--theme-status-testing-background);
    color: var(--theme-generic-font);
  }
  .badge.key :global(.mdi) {
    color: var(--tw-color-amber-500);
  }

  .link {
    max-width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--theme-link-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
  .link:focus-visible,
  .list-row:focus-visible,
  .icon-button:focus-visible,
  .mini-button:focus-visible,
  .edit-button:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  .list-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--dim-transition-fast);
  }
  .list-row + .list-row {
    border-top: 1px solid var(--theme-ui-border-subtle);
  }
  .list-row:hover {
    background: var(--theme-ui-hover);
  }
  .list-row :global(.mdi) {
    color: var(--theme-ui-accent-strong);
  }

  .stats {
    font-size: 13px;
  }

  .icon-button,
  .mini-button {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-secondary);
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .icon-button {
    width: 28px;
    height: 28px;
    font-size: 15px;
  }
  .mini-button {
    width: 22px;
    height: 22px;
    font-size: 13px;
    font-weight: 400;
  }
  .icon-button:hover,
  .mini-button:hover:not(:disabled) {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .mini-button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .edit-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    margin-top: 16px;
    padding: 0 12px;
    border: var(--theme-outlinebutton-border);
    border-radius: var(--dim-radius-md);
    background: var(--theme-outlinebutton-background);
    color: var(--theme-outlinebutton-foreground);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }
  .edit-button:hover {
    border: var(--theme-outlinebutton-hover-border);
    background: var(--theme-outlinebutton-hover-background);
  }
  .edit-button:active {
    transform: scale(0.98);
  }

  @media (prefers-reduced-motion: reduce) {
    .edit-button:active {
      transform: none;
    }
  }
</style>
