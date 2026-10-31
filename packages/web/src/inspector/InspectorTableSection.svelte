<script lang="ts">
  import _ from 'lodash';
  import FontIcon from '../icons/FontIcon.svelte';
  import { openDatabaseObjectDetail } from '../appobj/DatabaseObjectAppObject.svelte';
  import TableDetailsSection from '../tabledetails/TableDetailsSection.svelte';
  import { getStructureDetails, hasPostgresCatalog, loadPostgresTableStats } from '../tabledetails/tableDetailsLoader';
  import type { TableSizeStats } from '../tabledetails/tableDetailsLoader';
  import formatFileSize from '../utility/formatFileSize';
  import openNewTab from '../utility/openNewTab';
  import { _t } from '../translations';
  import InspectorHero from './InspectorHero.svelte';

  export let conid;
  export let database;
  export let schemaName;
  export let pureName;
  export let connection;
  export let driver;
  export let table;
  export let dbinfo;
  // rows the grid counted, used when the catalog has no estimate
  export let allRowCount = null;
  export let hasFilters = false;

  $: isPostgres = hasPostgresCatalog(connection);
  $: structure = table && driver ? getStructureDetails(table, dbinfo, driver) : null;
  $: indexes = structure?.indexes ?? [];
  $: triggers = structure?.triggers ?? [];
  $: foreignKeys = table?.foreignKeys ?? [];
  $: dependencies = table?.dependencies ?? [];
  $: primaryKeyColumns = table?.primaryKey?.columns?.map(x => x.columnName) ?? [];

  let sizeStats: TableSizeStats = null;
  let sizeLoading = false;
  let loadCounter = 0;

  async function loadSizeStats() {
    const counter = ++loadCounter;
    sizeLoading = true;
    let result = null;
    try {
      result = await loadPostgresTableStats({ conid, database, schemaName, pureName });
    } catch {
      result = null;
    }
    if (counter != loadCounter) return;
    sizeStats = result;
    sizeLoading = false;
  }

  $: if (isPostgres && conid && database && pureName) loadSizeStats();

  function toNumber(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  $: rowEstimate =
    sizeStats?.rowEstimate ?? toNumber(table?.tableRowCount) ?? (!hasFilters ? toNumber(allRowCount) : null);
  $: isExactCount = sizeStats?.rowEstimate == null && table?.tableRowCount == null && rowEstimate != null;
  $: totalBytes = sizeStats?.totalBytes ?? toNumber(table?.sizeBytes);

  function formatCount(value) {
    if (value == null) return '—';
    if (value >= 10000000) return `${Math.round(value / 100000) / 10}M`;
    if (value >= 100000) return `${Math.round(value / 1000)}K`;
    return value.toLocaleString();
  }

  function fkLabel(fk) {
    return fk.columns.map(x => x.columnName).join(', ');
  }

  function fkTarget(fk) {
    return `${fk.refTableName}(${fk.columns.map(x => x.refColumnName).join(', ')})`;
  }

  function openTable(refSchemaName, refPureName) {
    openDatabaseObjectDetail('TableDataTab', null, {
      schemaName: refSchemaName,
      pureName: refPureName,
      conid,
      database,
      objectTypeField: 'tables',
    } as any);
  }

  function openDetails() {
    openNewTab({
      title: pureName,
      icon: 'img table-details',
      tabComponent: 'TableDetailsTab',
      tabPreviewMode: true,
      props: { schemaName, pureName, conid, database, objectTypeField: 'tables' },
    });
  }
</script>

<div class="table-section" data-testid="InspectorTableSection_container">
  <InspectorHero
    icon="icon table"
    title={pureName}
    subtitle={_.compact([schemaName, database]).join(' · ')}
  >
    <svelte:fragment slot="trailing">
      <button
        class="details-link"
        on:click={openDetails}
        title={_t('tableData.detailsHint', { defaultMessage: 'Indexes, triggers, policies and enums' })}
        data-testid="InspectorTableSection_openDetails"
      >
        {_t('inspector.table.openDetails', { defaultMessage: 'Open details' })}
        <FontIcon icon="icon arrow-link" />
      </button>
    </svelte:fragment>
  </InspectorHero>

  <div class="body">
    <div class="tiles">
      <div class="tile" data-testid="InspectorTableSection_rows">
        <span class="tile-label">
          {isExactCount
            ? _t('inspector.table.rows', { defaultMessage: 'Rows' })
            : _t('inspector.table.rowEstimate', { defaultMessage: 'Rows (est.)' })}
        </span>
        <span class="tile-value" title={rowEstimate != null ? rowEstimate.toLocaleString() : ''}>
          {#if rowEstimate == null && sizeLoading}<span class="skeleton" />{:else}{formatCount(rowEstimate)}{/if}
        </span>
      </div>
      <div class="tile" data-testid="InspectorTableSection_size">
        <span class="tile-label">{_t('inspector.table.size', { defaultMessage: 'Size' })}</span>
        <span class="tile-value">
          {#if totalBytes == null && sizeLoading}<span class="skeleton" />{:else}{totalBytes != null
              ? formatFileSize(totalBytes)
              : '—'}{/if}
        </span>
      </div>
      <div class="tile">
        <span class="tile-label">{_t('inspector.table.columns', { defaultMessage: 'Columns' })}</span>
        <span class="tile-value">{table?.columns?.length ?? '—'}</span>
      </div>
    </div>

    <div class="key-row">
      <span class="key-label">
        <FontIcon icon="mdi mdi-key-variant" />
        {_t('columnPanel.primaryKey', { defaultMessage: 'Primary key' })}
      </span>
      {#if primaryKeyColumns.length > 0}
        <span class="chips">
          {#each primaryKeyColumns as name}
            <span class="chip mono">{name}</span>
          {/each}
        </span>
      {:else}
        <span class="muted">{_t('inspector.table.noPrimaryKey', { defaultMessage: 'None' })}</span>
      {/if}
    </div>

    <div class="details">
      <TableDetailsSection
        id="inspector-indexes"
        title={_t('tableDetails.indexes', { defaultMessage: 'Indexes' })}
        count={indexes.length}
        sql={indexes
          .map(x => x.sql)
          .filter(x => x)
          .join('\n\n')}
        loading={!structure}
        emptyMessage={_t('tableDetails.noIndexes', { defaultMessage: 'No indexes' })}
      >
        {#each indexes as index (index.name)}
          <div class="row" data-testid="InspectorTableSection_index">
            <div class="row-main">
              <span class="name" title={index.name}>{index.name}</span>
              {#if index.isPrimary}
                <span class="badge accent">{_t('tableDetails.primary', { defaultMessage: 'Primary' })}</span>
              {:else if index.isUnique}
                <span class="badge">{_t('tableDetails.unique', { defaultMessage: 'Unique' })}</span>
              {/if}
            </div>
            <div class="row-sub mono">
              {index.columns.length > 0
                ? index.columns.join(', ')
                : _t('tableDetails.expression', { defaultMessage: 'expression' })}
            </div>
          </div>
        {/each}
      </TableDetailsSection>

      <TableDetailsSection
        id="inspector-foreign-keys"
        title={_t('inspector.table.foreignKeys', { defaultMessage: 'Foreign keys' })}
        count={foreignKeys.length}
        loading={!table}
        emptyMessage={_t('inspector.table.noForeignKeys', { defaultMessage: 'No foreign keys' })}
      >
        {#each foreignKeys as fk (fk.constraintName ?? fkLabel(fk))}
          <button
            class="row link-row"
            on:click={() => openTable(fk.refSchemaName, fk.refTableName)}
            title={_t('columnMenu.openReferencedTable', {
              defaultMessage: 'Open {table}',
              values: { table: fk.refTableName },
            })}
            data-testid="InspectorTableSection_foreignKey"
          >
            <span class="row-main mono">
              <span class="name">{fkLabel(fk)}</span>
              <FontIcon icon="mdi mdi-arrow-right" />
              <span class="target">{fkTarget(fk)}</span>
            </span>
          </button>
        {/each}
      </TableDetailsSection>

      {#if dependencies.length > 0}
        <TableDetailsSection
          id="inspector-references"
          title={_t('inspector.table.referencedBy', { defaultMessage: 'Referenced by' })}
          count={dependencies.length}
        >
          {#each dependencies as fk (`${fk.schemaName}.${fk.pureName}.${fk.constraintName}`)}
            <button
              class="row link-row"
              on:click={() => openTable(fk.schemaName, fk.pureName)}
              title={_t('columnMenu.openReferencedTable', {
                defaultMessage: 'Open {table}',
                values: { table: fk.pureName },
              })}
            >
              <span class="row-main mono">
                <span class="name">{fk.pureName}({fkLabel(fk)})</span>
              </span>
            </button>
          {/each}
        </TableDetailsSection>
      {/if}

      {#if isPostgres || triggers.length > 0}
        <TableDetailsSection
          id="inspector-triggers"
          title={_t('tableDetails.triggers', { defaultMessage: 'Triggers' })}
          count={triggers.length}
          loading={!structure}
          emptyMessage={_t('tableDetails.noTriggers', { defaultMessage: 'No triggers' })}
        >
          {#each triggers as trigger (trigger.name)}
            <div class="row">
              <div class="row-main">
                <span class="name" title={trigger.name}>{trigger.name}</span>
              </div>
              {#if trigger.timing || trigger.events.length > 0}
                <div class="row-sub">{_.compact([trigger.timing, trigger.events.join(' OR ')]).join(' ')}</div>
              {/if}
            </div>
          {/each}
        </TableDetailsSection>
      {/if}
    </div>
  </div>
</div>

<style>
  .table-section {
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
    padding: 14px 16px 24px;
    border-top: 1px solid var(--theme-ui-border-subtle);
  }

  .details-link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 26px;
    padding: 0 8px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-link-foreground);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--dim-transition-fast);
  }
  .details-link:hover {
    background: var(--theme-ui-accent-soft);
  }
  .details-link:focus-visible,
  .link-row:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 9px 11px;
    border-radius: 10px;
    background: var(--theme-ui-bg);
    box-shadow: inset 0 0 0 1px var(--theme-ui-border);
  }
  .tile-label {
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile-value {
    min-height: 20px;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .key-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding: 0 2px;
    min-width: 0;
  }
  .key-label {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-ui-text-secondary);
  }
  .key-label :global(.mdi) {
    color: var(--tw-color-amber-500);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 7px;
    border-radius: 6px;
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .muted {
    color: var(--theme-generic-font-grayed);
  }

  .details :global(.section) {
    padding-top: 16px;
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    padding: 8px 12px;
    box-sizing: border-box;
  }
  .row + .row {
    border-top: 1px solid var(--theme-ui-border-subtle);
  }
  .row-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .name {
    min-width: 0;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-main.mono .name {
    font-weight: 500;
  }
  .target {
    min-width: 0;
    color: var(--theme-link-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-sub {
    color: var(--theme-ui-text-secondary);
    font-size: 12px;
    word-break: break-word;
  }
  .link-row {
    border: none;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--dim-transition-fast);
  }
  .link-row:hover {
    background: var(--theme-ui-hover);
  }
  .link-row :global(.mdi) {
    flex-shrink: 0;
    color: var(--theme-generic-font-grayed);
  }

  .mono {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }
  .badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 5px;
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
    font-size: 11px;
    font-weight: 600;
  }
  .badge.accent {
    background: var(--theme-ui-accent-soft);
    color: var(--theme-ui-accent-strong);
  }

  .skeleton {
    display: inline-block;
    width: 48px;
    height: 12px;
    border-radius: 4px;
    background: var(--theme-ui-active);
    animation: inspector-table-pulse 1.1s ease-in-out infinite alternate;
  }
  @keyframes inspector-table-pulse {
    to {
      opacity: 0.45;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
</style>
