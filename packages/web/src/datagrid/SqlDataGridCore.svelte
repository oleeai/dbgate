<script context="module" lang="ts">
  import { getActiveComponent } from '../utility/createActivator';
  import registerCommand from '../commands/registerCommand';
  import hasPermission from '../utility/hasPermission';
  import { __t, _t } from '../translations';
  const getCurrentEditor = () => getActiveComponent('SqlDataGridCore');

  registerCommand({
    id: 'sqlDataGrid.openQuery',
    category: __t('command.datagrid', { defaultMessage: 'Data grid' }),
    name: __t('command.openQuery', { defaultMessage: 'Open query' }),
    testEnabled: () => getCurrentEditor() != null && hasPermission('dbops/query'),
    onClick: () => getCurrentEditor().openQuery(),
  });

  registerCommand({
    id: 'sqlDataGrid.export',
    category: __t('command.datagrid', { defaultMessage: 'Data grid' }),
    name: __t('common.export', { defaultMessage: 'Export' }),
    icon: 'icon export',
    keyText: 'CtrlOrCommand+E',
    testEnabled: () => getCurrentEditor() != null && hasPermission('dbops/export'),
    onClick: () => getCurrentEditor().exportGrid(),
  });
</script>

<script lang="ts">
  import _ from 'lodash';
  import { registerQuickExportHandler } from '../buttons/ToolStripExportButton.svelte';
  import {
    extractShellConnection,
    extractShellConnectionHostable,
    extractShellHostConnection,
  } from '../impexp/createImpExpScript';
  import { apiCall } from '../utility/api';

  import { registerMenu } from '../utility/contextMenu';
  import createActivator from '../utility/createActivator';
  import createQuickExportMenu from '../utility/createQuickExportMenu';
  import { exportQuickExportFile } from '../utility/exportFileTools';
  import { getConnectionInfo } from '../utility/metadataLoaders';
  import openNewTab from '../utility/openNewTab';
  import ChangeSetGrider from './ChangeSetGrider';

  import LoadingDataGridCore from './LoadingDataGridCore.svelte';
  import { openImportExportTab } from '../utility/importExportTools';
  import { getIntSettingsValue } from '../settings/settingsTools';
  import OverlayDiffGrider from './OverlayDiffGrider';
  import DataGridPagingFooter from './DataGridPagingFooter.svelte';
  import { getLocalStorage, setLocalStorage } from '../utility/storageCache';
  import { extensions } from '../stores';

  export let conid;
  export let display;
  export let database;
  export let schemaName;
  export let pureName;
  export let config;
  export let changeSetState;
  export let dispatchChangeSet;
  export let overlayDefinition = null;
  export let onResultInfoLoaded = null;

  export let macroPreview;
  export let macroValues;
  export let onPublishedCellsChanged;

  export let setConfig = null;
  export let isDetailView = false;
  // the table data tab shows one page at a time, with a footer to move between pages
  export let pagingFooter = false;

  let publishedCells = [];

  // export let onChangeGrider = undefined;

  export const activator = createActivator('SqlDataGridCore', false);

  const PAGE_SIZES = [50, 100, 500, 1000];

  let loadedRows = [];
  let domLoadingGrid;
  let loadState = null;

  let grider;

  // $: console.log('loadedRows BIND', loadedRows);

  $: {
    if (!overlayDefinition && macroPreview) {
      grider = new ChangeSetGrider(
        loadedRows,
        changeSetState,
        dispatchChangeSet,
        display,
        macroPreview,
        macroValues,
        publishedCells
      );
    }
  }
  // prevent recreate grider, if no macro is selected, so there is no need to selectedcells in macro
  $: {
    if (!overlayDefinition && !macroPreview) {
      grider = new ChangeSetGrider(loadedRows, changeSetState, dispatchChangeSet, display);
    }
  }
  // $: console.log('GRIDER', grider);
  // $: if (onChangeGrider) onChangeGrider(grider);

  $: {
    if (overlayDefinition) {
      grider = new OverlayDiffGrider(
        loadedRows,
        display,
        overlayDefinition.matchColumns,
        overlayDefinition.overlayData,
        overlayDefinition.matchedDbKeys
      );
    }
  }

  export async function exportGrid() {
    const coninfo = await getConnectionInfo({ conid });

    const initialValues: any = {};
    initialValues.sourceStorageType = 'query';
    initialValues.sourceConnectionId = conid;
    initialValues.sourceDatabaseName = database;
    initialValues.sourceQuery = coninfo.isReadOnly
      ? JSON.stringify(display.getExportQueryJson(), undefined, 2)
      : display.getExportQuery();
    initialValues.sourceQueryType = coninfo.isReadOnly ? 'json' : 'native';
    initialValues.sourceList = display.baseTableOrSimilar ? [display.baseTableOrSimilar.pureName] : [];
    initialValues[`columns_${pureName}`] = display.getExportColumnMap();
    openImportExportTab(initialValues);
    // showModal(ImportExportModal, { initialValues });
  }

  export function openQuery(sql?) {
    openNewTab(
      {
        title: _t('common.queryNumber', { defaultMessage: 'Query #' }),
        icon: 'img sql-file',
        tabComponent: 'QueryTab',
        focused: true,
        props: {
          schemaName: display.baseTableOrSimilar?.schemaName,
          pureName: display.baseTableOrSimilar?.pureName,
          conid,
          database,
        },
      },
      {
        editor: sql ?? display.getExportQuery(),
      }
    );
  }

  function openQueryOnError() {
    openQuery(display.getPageQueryText(0, getIntSettingsValue('dataGrid.pageSize', 100, 5, 50000)));
  }

  const quickExportHandler = fmt => async () => {
    const coninfo = await getConnectionInfo({ conid });
    exportQuickExportFile(
      pureName || 'Data',
      {
        functionName: 'queryReader',
        props: {
          ...extractShellConnectionHostable(coninfo, database),
          queryType: coninfo.isReadOnly ? 'json' : 'native',
          query: coninfo.isReadOnly ? display.getExportQueryJson() : display.getExportQuery(),
        },
        hostConnection: extractShellHostConnection(coninfo, database),
      },
      fmt,
      display.getExportColumnMap()
    );
  };
  registerQuickExportHandler(quickExportHandler);

  registerMenu(
    { command: 'sqlDataGrid.openActiveChart', tag: 'chart' },
    { command: 'sqlDataGrid.openQuery', tag: 'export' },
    () =>
      createQuickExportMenu(
        quickExportHandler,
        {
          command: 'sqlDataGrid.export',
        },
        { tag: 'export' }
      )
  );

  function handleSetLoadedRows(rows) {
    loadedRows = rows;
  }

  // a page is cut with OFFSET, which some engines can't do
  function supportsOffsetPaging(display) {
    const dialect = display?.dialect;
    return !!dialect && !dialect.offsetNotSupported && !!(dialect.rangeSelect || dialect.rowNumberOverPaging);
  }

  // filters and sort decide which rows a page holds, so when they change, paging starts again from page 1
  function getPagingQueryKey(cfg) {
    return JSON.stringify([
      cfg?.filters,
      cfg?.multiColumnFilter,
      cfg?.searchInColumns,
      cfg?.disabledFilterColumns,
      cfg?.disabledMultiColumnFilter,
      cfg?.sort,
      cfg?.grouping,
    ]);
  }

  function getDefaultPageLimit() {
    const value = getLocalStorage('dataGrid_pagingLimit');
    return PAGE_SIZES.includes(value) ? value : 100;
  }

  function resolvePaging(cfg) {
    const stored = cfg?.paging;
    return {
      offset: stored && stored.queryKey == getPagingQueryKey(cfg) ? stored.offset : 0,
      limit: stored?.limit ?? getDefaultPageLimit(),
    };
  }

  $: paging = pagingFooter && !isDetailView && supportsOffsetPaging(display) ? resolvePaging(config) : null;

  function setPaging(offset, limit) {
    setConfig(cfg => ({ ...cfg, paging: { offset, limit, queryKey: getPagingQueryKey(cfg) } }));
  }

  function handleSetPageLimit(limit) {
    setLocalStorage('dataGrid_pagingLimit', limit);
    // stay on the page that holds the current first row
    setPaging(Math.floor(paging.offset / limit) * limit, limit);
  }

  function handleLoadStateChanged(value) {
    loadState = value;
  }

  // eg. the rows of the last page were deleted
  $: if (paging && loadState?.allRowCount != null && paging.offset > 0 && paging.offset >= loadState.allRowCount) {
    setPaging(Math.max(0, Math.ceil(loadState.allRowCount / paging.limit) - 1) * paging.limit, paging.limit);
  }

  $: exportFormats = hasPermission('dbops/export')
    ? [
        { label: 'CSV', format: $extensions?.quickExports?.find(x => x.extension == 'csv') },
        { label: 'JSON', format: $extensions?.quickExports?.find(x => x.extension == 'json') },
      ].filter(x => x.format)
    : [];

  // OFFSET needs a fixed row order, otherwise rows can move between pages; without a sort, use the primary key
  function addStableOrder(select, display) {
    const keyColumns = display.baseTable?.primaryKey?.columns;
    if (!select?.range || select.orderBy || display.isGrouped || !keyColumns?.length) return;
    select.orderBy = keyColumns.map(({ columnName }) => ({
      exprType: 'column',
      columnName,
      source: select.from?.alias ? { alias: select.from.alias } : undefined,
      direction: 'ASC',
    }));
  }

  async function loadDataPage(props, offset, limit) {
    const { display, conid, database, paging } = props;

    const select = display.getPageQuery(offset, limit);
    if (paging) addStableOrder(select, display);

    const response = await apiCall('database-connections/sql-select', {
      conid,
      database,
      select,
      auditLogSessionGroup: 'data-grid',
    });

    if (response.errorMessage) return response;
    onResultInfoLoaded?.({ columns: response.columns });
    return response.rows;
  }

  function dataPageAvailable(props) {
    const { display } = props;
    const select = display.getPageQuery(0, 1);
    return !!select;
  }

  async function loadRowCount(props, timeout = 3000) {
    const { display, conid, database } = props;

    const select = display.getCountQuery();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Row count query timed out')), timeout)
    );

    try {
      const response = await Promise.race([
        apiCall('database-connections/sql-select', {
          conid,
          database,
          select,
          commandTimeout: timeout,
        }),
        timeoutPromise,
      ]);

      if (response.errorMessage) return { errorMessage: response.errorMessage };
      return parseInt(response.rows[0].count);
    } catch (err) {
      return { errorMessage: err.message || 'Error loading row count' };
    }
  }

  async function startFetchAll(props) {
    const { display, conid, database } = props;
    const sql = display.getExportQuery();
    if (!sql) return null;

    const resp = await apiCall('sessions/execute-reader', {
      conid,
      database,
      sql,
    });
    if (!resp || resp.errorMessage) return null;
    return resp.jslid;
  }
</script>

<div class="wrapper">
  <div class="grid-area">
    <LoadingDataGridCore
      {...$$props}
      bind:this={domLoadingGrid}
      {loadDataPage}
      {dataPageAvailable}
      {loadRowCount}
      {startFetchAll}
      setLoadedRows={handleSetLoadedRows}
      onPublishedCellsChanged={value => {
        publishedCells = value;
        if (onPublishedCellsChanged) {
          onPublishedCellsChanged(value);
        }
      }}
      frameSelection={!!macroPreview}
      {grider}
      {display}
      {paging}
      onLoadStateChanged={handleLoadStateChanged}
      onOpenQuery={openQuery}
      onOpenQueryOnError={openQueryOnError}
    />
  </div>
  {#if paging}
    <DataGridPagingFooter
      offset={paging.offset}
      limit={paging.limit}
      pageSizes={PAGE_SIZES}
      loadedCount={loadState?.loadedCount ?? 0}
      isLoadedAll={!!loadState?.isLoadedAll}
      totalCount={loadState?.allRowCount ?? null}
      countError={loadState?.allRowCountError ?? null}
      isCounting={!!loadState?.isRowCountLoading}
      onSetPage={offset => setPaging(offset, paging.limit)}
      onSetLimit={handleSetPageLimit}
      onReloadCount={() => domLoadingGrid?.reloadRowCount(30000)}
      {exportFormats}
      onExport={format => quickExportHandler(format)()}
      onExportAdvanced={hasPermission('dbops/export') ? exportGrid : null}
    />
  {/if}
</div>

<style>
  .wrapper {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
  }
  .grid-area {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
