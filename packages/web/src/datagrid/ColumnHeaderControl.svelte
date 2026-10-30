<script>
  import FontIcon from '../icons/FontIcon.svelte';
  import ColumnHeaderMenu from './ColumnHeaderMenu.svelte';
  import ColumnQuickStats from './ColumnQuickStats.svelte';
  import ColumnSidePanel from '../tableeditor/ColumnSidePanel.svelte';
  import { confirmDeleteColumn } from '../tableeditor/columnAlterTools';
  import splitterDrag from '../utility/splitterDrag';
  import _ from 'lodash';

  import ColumnLabel from '../elements/ColumnLabel.svelte';
  import { isTypeDateTime } from 'dbgate-tools';
  import { openDatabaseObjectDetail } from '../appobj/DatabaseObjectAppObject.svelte';
  import { copyTextToClipboard } from '../utility/clipboard';
  import VirtualForeignKeyEditorModal from '../tableeditor/VirtualForeignKeyEditorModal.svelte';
  import { showModal } from '../modals/modalTools';
  import DefineDictionaryDescriptionModal from '../modals/DefineDictionaryDescriptionModal.svelte';
  import { sleep } from '../utility/common';
  import { isProApp } from '../utility/proTools';
  import { _t } from '../translations';

  export let column;
  export let conid = undefined;
  export let database = undefined;
  export let setSort = undefined;
  export let addToSort = undefined;
  export let clearSort = undefined;
  export let grouping = undefined;
  export let order = undefined;
  export let orderIndex = undefined;
  export let isSortDefined = false;
  export let allowDefineVirtualReferences = false;
  export let setGrouping;
  export let seachInColumns = '';
  export let onReload = undefined;
  export let driver = null;
  export let onHideColumn = null;
  export let onFilterColumn = null;
  // Quick stats run a read-only aggregate on the base table or view
  export let allowQuickStats = false;
  export let allowStructureEdit = false;

  let domHeader;
  let showQuickStats = false;

  // Expanded foreign-key columns belong to another table, so table actions only apply to own columns
  $: isOwnColumn = column?.uniquePath?.length == 1 && !!column?.columnName;
  $: canEditStructure = allowStructureEdit && isOwnColumn;

  const openReferencedTable = () => {
    openDatabaseObjectDetail('TableDataTab', null, {
      schemaName: column.foreignKey.refSchemaName,
      pureName: column.foreignKey.refTableName,
      conid,
      database,
      objectTypeField: 'tables',
    });
  };

  const handleDefineVirtualForeignKey = () => {
    showModal(VirtualForeignKeyEditorModal, {
      schemaName: column.schemaName,
      pureName: column.pureName,
      conid,
      database,
      columnName: column.columnName,
    });
  };

  const handleCustomizeDescriptions = () => {
    showModal(DefineDictionaryDescriptionModal, {
      conid,
      database,
      schemaName: column.foreignKey.refSchemaName,
      pureName: column.foreignKey.refTableName,
      onConfirm: async () => {
        await sleep(100);
        onReload?.();
      },
    });
  };

  function openColumnPanel(columnName) {
    showModal(ColumnSidePanel, {
      conid,
      database,
      schemaName: column.schemaName,
      pureName: column.pureName,
      columnName,
      driver,
      onSaved: onReload,
    });
  }

  function handleDeleteColumn() {
    confirmDeleteColumn(
      { conid, database, driver },
      { schemaName: column.schemaName, pureName: column.pureName, columnName: column.columnName },
      { onSaved: onReload }
    );
  }

  function getMenuSections() {
    return [
      setSort && {
        label: _t('columnMenu.sort', { defaultMessage: 'Sort' }),
        items: [
          {
            onClick: () => setSort('ASC'),
            text: _t('columnMenu.sortAscending', { defaultMessage: 'Sort ascending' }),
            icon: 'mdi mdi-sort-ascending',
            checked: order == 'ASC',
          },
          {
            onClick: () => setSort('DESC'),
            text: _t('columnMenu.sortDescending', { defaultMessage: 'Sort descending' }),
            icon: 'mdi mdi-sort-descending',
            checked: order == 'DESC',
          },
          isSortDefined &&
            addToSort &&
            !order && [
              {
                onClick: () => addToSort('ASC'),
                text: _t('columnMenu.addToSortAscending', { defaultMessage: 'Add to sort, ascending' }),
                icon: 'mdi mdi-sort-reverse-variant',
              },
              {
                onClick: () => addToSort('DESC'),
                text: _t('columnMenu.addToSortDescending', { defaultMessage: 'Add to sort, descending' }),
                icon: 'mdi mdi-sort-variant',
              },
            ],
          (order || isSortDefined) &&
            clearSort && {
              onClick: () => clearSort(),
              text: _t('columnMenu.clearSort', { defaultMessage: 'Clear sort' }),
              icon: 'mdi mdi-sort-variant-remove',
            },
        ],
      },
      {
        label: _t('columnMenu.column', { defaultMessage: 'Column' }),
        items: [
          onFilterColumn && {
            onClick: onFilterColumn,
            text: _t('columnMenu.filter', { defaultMessage: 'Filter by this column' }),
            icon: 'mdi mdi-filter-outline',
          },
          allowQuickStats &&
            isOwnColumn && {
              onClick: () => (showQuickStats = true),
              text: _t('columnMenu.quickStats', { defaultMessage: 'Quick stats' }),
              icon: 'mdi mdi-chart-box-outline',
              testid: 'ColumnHeaderControl_quickStats',
            },
          onHideColumn && {
            onClick: onHideColumn,
            text: _t('columnMenu.hide', { defaultMessage: 'Hide column' }),
            icon: 'mdi mdi-eye-off-outline',
          },
          {
            onClick: () => copyTextToClipboard(column.columnName),
            text: _t('columnMenu.copyName', { defaultMessage: 'Copy column name' }),
            icon: 'icon copy',
          },
          column.foreignKey && {
            onClick: openReferencedTable,
            text: _t('columnMenu.openReferencedTable', {
              defaultMessage: 'Open {table}',
              values: { table: column.foreignKey.refTableName },
            }),
            icon: 'mdi mdi-table-arrow-right',
          },
        ],
      },

      isProApp() &&
        setGrouping &&
        !driver?.dialect?.disableGroupingForDataType?.(column.dataType) && {
          label: _t('columnMenu.group', { defaultMessage: 'Group' }),
          items: [
            { onClick: () => setGrouping('GROUP'), text: 'Group by', icon: 'mdi mdi-group' },
            { onClick: () => setGrouping('MAX'), text: 'MAX' },
            { onClick: () => setGrouping('MIN'), text: 'MIN' },
            { onClick: () => setGrouping('SUM'), text: 'SUM' },
            { onClick: () => setGrouping('AVG'), text: 'AVG' },
            { onClick: () => setGrouping('COUNT'), text: 'COUNT' },
            { onClick: () => setGrouping('COUNT DISTINCT'), text: 'COUNT DISTINCT' },
            isTypeDateTime(column.dataType) && [
              { onClick: () => setGrouping('GROUP:YEAR'), text: 'Group by YEAR' },
              { onClick: () => setGrouping('GROUP:MONTH'), text: 'Group by MONTH' },
              { onClick: () => setGrouping('GROUP:DAY'), text: 'Group by DAY' },
            ],
          ],
        },

      {
        label: _t('columnMenu.structure', { defaultMessage: 'Structure' }),
        items: [
          canEditStructure && {
            onClick: () => openColumnPanel(column.columnName),
            text: _t('columnMenu.editColumn', { defaultMessage: 'Edit column…' }),
            icon: 'mdi mdi-pencil-outline',
            testid: 'ColumnHeaderControl_editColumn',
          },
          canEditStructure && {
            onClick: () => openColumnPanel(null),
            text: _t('columnMenu.addColumn', { defaultMessage: 'Add column…' }),
            icon: 'icon add-column',
          },
          isProApp() &&
            allowDefineVirtualReferences && {
              onClick: handleDefineVirtualForeignKey,
              text: 'Define virtual foreign key',
              icon: 'icon add-key',
            },
          column.foreignKey &&
            isProApp() && {
              onClick: handleCustomizeDescriptions,
              text: 'Customize description',
              icon: 'icon edit',
            },
          canEditStructure && {
            onClick: handleDeleteColumn,
            text: _t('columnMenu.deleteColumn', { defaultMessage: 'Delete column…' }),
            icon: 'icon trash',
            danger: true,
            testid: 'ColumnHeaderControl_deleteColumn',
          },
        ],
      },
    ];
  }
</script>

<div class="header" bind:this={domHeader}>
  <div class="label">
    {#if grouping}
      <span class="grouping">
        {grouping == 'COUNT DISTINCT' ? 'distinct' : grouping.toLowerCase()}
      </span>
    {/if}
    <ColumnLabel {...column} filter={seachInColumns} />

    {#if _.isString(column.displayedDataType || column.dataType) && !order}
      <span class="data-type" title={column.dataType}>
        {(column.displayedDataType || column.dataType).toLowerCase()}
      </span>
    {/if}
  </div>
  {#if order == 'ASC'}
    <span class="icon">
      <FontIcon icon="img sort-asc" />
      {#if orderIndex >= 0}
        <span class="color-icon-green order-index">{orderIndex + 1}</span>
      {/if}
    </span>
  {/if}
  {#if order == 'DESC'}
    <span class="icon">
      <FontIcon icon="img sort-desc" />
      {#if orderIndex >= 0}
        <span class="color-icon-green order-index">{orderIndex + 1}</span>
      {/if}
    </span>
  {/if}
  <ColumnHeaderMenu
    getSections={getMenuSections}
    title={column.columnName}
    subtitle={_.isString(column.dataType) ? column.dataType.toLowerCase() : null}
    data-testid={`ColumnHeaderControl_dropdown_${column?.uniqueName}`}
  />
  {#if showQuickStats}
    <ColumnQuickStats
      {conid}
      {database}
      {driver}
      {column}
      anchor={domHeader}
      onClose={() => (showQuickStats = false)}
    />
  {/if}
  <div class="horizontal-split-handle resizeHandleControl" use:splitterDrag={'clientX'} on:resizeSplitter />
</div>

<style>
  .header {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    padding-right: 2px;
    font-size: 12.5px;
    font-weight: 500;
  }
  .header :global(.buttonLike) {
    opacity: 0;
    transition: opacity var(--dim-transition-fast);
  }
  .header:hover :global(.buttonLike) {
    opacity: 1;
  }
  .order-index {
    font-size: 10pt;
    margin-left: -3px;
    margin-right: 2px;
    top: -1px;
    position: relative;
  }
  .label {
    flex: 1;
    min-width: 10px;
    padding: 4px 4px 4px 8px;
    margin: auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon {
    margin-left: 3px;
    align-self: center;
    font-size: 18px;
  }
  .grouping {
    color: var(--theme-datagrid-cell-foreground-value-green);
    white-space: nowrap;
  }
  .data-type {
    color: var(--theme-generic-font-grayed);
    font-weight: 400;
    font-size: 11.5px;
    margin-left: 2px;
  }
</style>
