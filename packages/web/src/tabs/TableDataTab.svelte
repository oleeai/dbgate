<script lang="ts" context="module">
  import { getActiveComponent } from '../utility/createActivator';
  import registerCommand from '../commands/registerCommand';
  import { __t } from '../translations';
  const getCurrentEditor = () => getActiveComponent('TableDataTab');
  const INTERVALS = [5, 10, 15, 30, 60];

  const INTERVAL_COMMANDS = [
    {
      time: 5,
      name: __t('command.datagrid.setAutoRefresh.5', { defaultMessage: 'Refresh every 5 seconds' }),
    },
    {
      time: 10,
      name: __t('command.datagrid.setAutoRefresh.10', { defaultMessage: 'Refresh every 10 seconds' }),
    },
    {
      time: 15,
      name: __t('command.datagrid.setAutoRefresh.15', { defaultMessage: 'Refresh every 15 seconds' }),
    },
    {
      time: 30,
      name: __t('command.datagrid.setAutoRefresh.30', { defaultMessage: 'Refresh every 30 seconds' }),
    },
    {
      time: 60,
      name: __t('command.datagrid.setAutoRefresh.60', { defaultMessage: 'Refresh every 60 seconds' }),
    },
  ];

  registerCommand({
    id: 'tableData.save',
    group: 'save',
    category: __t('command.tableData', { defaultMessage: 'Table data' }),
    name: __t('command.tableData.save', { defaultMessage: 'Save' }),
    // keyText: 'CtrlOrCommand+S',
    toolbar: true,
    isRelatedToTab: true,
    icon: 'icon save',
    usageAnalytics: false,
    testEnabled: () => getCurrentEditor()?.canSave(),
    onClick: () => getCurrentEditor().save(),
  });

  registerCommand({
    id: 'tableData.setAutoRefresh.1',
    category: __t('command.datagrid', { defaultMessage: 'Data grid' }),
    name: __t('command.datagrid.setAutoRefresh.1', { defaultMessage: 'Refresh every 1 second' }),
    isRelatedToTab: true,
    testEnabled: () => !!getCurrentEditor(),
    onClick: () => getCurrentEditor().setAutoRefresh(1),
  });

  for (const { time, name } of INTERVAL_COMMANDS) {
    registerCommand({
      id: `tableData.setAutoRefresh.${time}`,
      category: __t('command.datagrid', { defaultMessage: 'Data grid' }),
      name,
      isRelatedToTab: true,
      testEnabled: () => !!getCurrentEditor(),
      onClick: () => getCurrentEditor().setAutoRefresh(time),
    });
  }

  registerCommand({
    id: 'tableData.stopAutoRefresh',
    category: __t('command.datagrid', { defaultMessage: 'Data grid' }),
    name: __t('command.datagrid.stopAutoRefresh', { defaultMessage: 'Stop auto refresh' }),
    isRelatedToTab: true,
    keyText: 'CtrlOrCommand+Shift+R',
    testEnabled: () => getCurrentEditor()?.isAutoRefresh() === true,
    onClick: () => getCurrentEditor().stopAutoRefresh(null),
  });

  registerCommand({
    id: 'tableData.startAutoRefresh',
    category: __t('command.datagrid', { defaultMessage: 'Data grid' }),
    name: __t('command.datagrid.startAutoRefresh', { defaultMessage: 'Start auto refresh' }),
    isRelatedToTab: true,
    keyText: 'CtrlOrCommand+Shift+R',
    testEnabled: () => getCurrentEditor()?.isAutoRefresh() === false,
    onClick: () => getCurrentEditor().startAutoRefresh(),
  });

  export const matchingProps = ['conid', 'database', 'schemaName', 'pureName', 'isRawMode'];
  export const allowAddToFavorites = props => true;
  export const allowSwitchDatabase = props => true;
</script>

<script lang="ts">
  import _ from 'lodash';
  import App from '../App.svelte';
  import TableDataGrid from '../datagrid/TableDataGrid.svelte';
  import useGridConfig from '../utility/useGridConfig';
  import {
    changeSetChangedCount,
    changeSetContainsChanges,
    changeSetToSql,
    createChangeSet,
    createGridCache,
    getDeleteCascades,
  } from 'dbgate-datalib';
  import { findEngineDriver } from 'dbgate-tools';
  import { reloadDataCacheFunc } from 'dbgate-datalib';
  import { writable } from 'svelte/store';
  import createUndoReducer from '../utility/createUndoReducer';
  import invalidateCommands from '../commands/invalidateCommands';
  import { showModal } from '../modals/modalTools';
  import ErrorMessageModal from '../modals/ErrorMessageModal.svelte';
  import { getTableInfo, useConnectionInfo, useDatabaseInfo, useTableInfo } from '../utility/metadataLoaders';
  import { scriptToSql } from 'dbgate-sqltree';
  import { extensions } from '../stores';
  import ConfirmSqlModal from '../modals/ConfirmSqlModal.svelte';
  import createActivator from '../utility/createActivator';
  import { registerMenu } from '../utility/contextMenu';
  import { showSnackbarSuccess } from '../utility/snackbar';
  import { onDestroy, setContext } from 'svelte';
  import { apiCall } from '../utility/api';
  import { getLocalStorage, setLocalStorage } from '../utility/storageCache';
  import ToolStripContainer from '../buttons/ToolStripContainer.svelte';
  import ToolStripCommandButton from '../buttons/ToolStripCommandButton.svelte';
  import ToolStripFilterBuilder from '../buttons/ToolStripFilterBuilder.svelte';
  import { createQuickExportHandlerRef } from '../buttons/ToolStripExportButton.svelte';
  import ToolStripFit from '../buttons/ToolStripFit.svelte';
  import ToolStripQuietButton from '../buttons/ToolStripQuietButton.svelte';
  import TableViewSwitch from '../buttons/TableViewSwitch.svelte';
  import { createQuickExportMenuItems } from '../utility/createQuickExportMenu';
  import hasPermission from '../utility/hasPermission';
  import { getBoolSettingsValue, getIntSettingsValue } from '../settings/settingsTools';
  import useEditorData from '../query/useEditorData';
  import { markTabSaved, markTabUnsaved } from '../utility/common';
  import { getNumberIcon } from '../icons/FontIcon.svelte';
  import { _t } from '../translations';
  import { trackUsage } from '../utility/usageAnalytics';

  export let tabid;
  export let conid;
  export let database;
  export let schemaName;
  export let pureName;
  export let isRawMode = false;
  export let tabPreviewMode;

  export const activator = createActivator('TableDataTab', true);

  const config = useGridConfig(tabid);
  const cache = writable(createGridCache());
  const dbinfo = useDatabaseInfo({ conid, database });

  let autoRefreshInterval = getIntSettingsValue('dataGrid.defaultAutoRefreshInterval', 10, 1, 3600);
  let autoRefreshStarted = false;
  let autoRefreshTimer = null;

  $: connection = useConnectionInfo({ conid });
  $: tableInfo = useTableInfo({ conid, database, schemaName, pureName });
  $: driver = findEngineDriver($connection, $extensions);
  $: filterColumns = ($tableInfo?.columns || []).map(col => ({ ...col, uniqueName: col.columnName }));

  const { editorState, editorValue, setEditorData } = useEditorData({
    tabid,
    onInitialData: value => {
      dispatchChangeSet({ type: 'reset', value });
      invalidateCommands();
      if (changeSetContainsChanges(value)) {
        markTabUnsaved(tabid);
      }
    },
  });

  const [changeSetStore, dispatchChangeSet] = createUndoReducer(createChangeSet());
  $: hasPendingChanges = changeSetChangedCount($changeSetStore?.value) > 0;

  function setToolbarFilter(value) {
    config.update(cfg => ({
      ...cfg,
      multiColumnFilter: value,
      formViewRecordNumber: 0,
      disabledMultiColumnFilter: false,
    }));
    cache.update(reloadDataCacheFunc);
  }

  // same config changes as the grid display's setFilter / removeFilter, so the filter row stays in sync;
  // a column that gets its first filter moves to the end, so its chip shows up last
  function setColumnFilter(uniqueName, value) {
    config.update(cfg => ({
      ...cfg,
      filters: value
        ? cfg.filters?.[uniqueName]
          ? { ...cfg.filters, [uniqueName]: value }
          : { ..._.omit(cfg.filters, [uniqueName]), [uniqueName]: value }
        : _.omit(cfg.filters, [uniqueName]),
      formFilterColumns: value
        ? cfg.formFilterColumns
        : (cfg.formFilterColumns || []).filter(x => x != uniqueName),
      formViewRecordNumber: 0,
      disabledFilterColumns: (cfg.disabledFilterColumns || []).filter(x => x != uniqueName),
    }));
    cache.update(reloadDataCacheFunc);
  }

  $: {
    setEditorData($changeSetStore.value);
    if (changeSetContainsChanges($changeSetStore?.value)) {
      markTabUnsaved(tabid);
    } else {
      markTabSaved(tabid);
    }
  }

  async function handleConfirmSql(sql) {
    const started = Date.now();
    const changedCount = changeSetChangedCount($changeSetStore?.value);
    const resp = await apiCall('database-connections/run-script', { conid, database, sql, useTransaction: true });
    const { errorMessage } = resp || {};
    trackUsage({
      feature: 'data_grid',
      action: 'save_changes',
      tab: 'table_data',
      engine: $connection?.engine,
      result: errorMessage ? 'error' : 'success',
      durationMs: Date.now() - started,
      value: changedCount,
    });
    if (errorMessage) {
      showModal(ErrorMessageModal, {
        title: _t('tableData.errorWhenSaving', { defaultMessage: 'Error when saving' }),
        message: errorMessage,
      });
    } else {
      dispatchChangeSet({ type: 'reset', value: createChangeSet() });
      cache.update(reloadDataCacheFunc);
      showSnackbarSuccess(_t('tableData.savedToDatabase', { defaultMessage: 'Saved to database' }));
    }
  }

  export async function save() {
    const driver = findEngineDriver($connection, $extensions);
    const tablePermissionRole = (await getTableInfo({ conid, database, schemaName, pureName }))?.tablePermissionRole;

    if (tablePermissionRole == 'create_update_delete' || tablePermissionRole == 'update_only') {
      const started = Date.now();
      const changedCount = changeSetChangedCount($changeSetStore?.value);
      const resp = await apiCall('database-connections/save-table-data', {
        conid,
        database,
        changeSet: $changeSetStore?.value,
      });
      const { errorMessage } = resp || {};
      trackUsage({
        feature: 'data_grid',
        action: 'save_changes',
        tab: 'table_data',
        engine: $connection?.engine,
        result: errorMessage ? 'error' : 'success',
        durationMs: Date.now() - started,
        value: changedCount,
      });
      if (errorMessage) {
        showModal(ErrorMessageModal, {
          title: _t('tableData.errorWhenSaving', { defaultMessage: 'Error when saving' }),
          message: errorMessage,
        });
      } else {
        dispatchChangeSet({ type: 'reset', value: createChangeSet() });
        cache.update(reloadDataCacheFunc);
        showSnackbarSuccess(_t('tableData.savedToDatabase', { defaultMessage: 'Saved to database' }));
      }
    } else {
      const script = driver.createSaveChangeSetScript($changeSetStore?.value, $dbinfo, () =>
        changeSetToSql($changeSetStore?.value, $dbinfo, driver.dialect)
      );

      const deleteCascades = getDeleteCascades($changeSetStore?.value, $dbinfo);
      const sql = scriptToSql(driver, script);
      const deleteCascadesScripts = _.map(deleteCascades, ({ title, commands }) => ({
        title,
        script: scriptToSql(driver, commands),
      }));
      // console.log('deleteCascadesScripts', deleteCascadesScripts);
      // deleted rows can't be brought back after Save, so their SQL is always shown first
      const alwaysConfirm = deleteCascadesScripts?.length > 0 || $changeSetStore?.value?.deletes?.length > 0;
      if (getBoolSettingsValue('skipConfirm.tableDataSave', false) && !alwaysConfirm) {
        handleConfirmSql(sql);
      } else {
        showModal(ConfirmSqlModal, {
          sql,
          onConfirm: confirmedSql => handleConfirmSql(confirmedSql),
          engine: driver.engine,
          deleteCascadesScripts,
          skipConfirmSettingKey: alwaysConfirm ? null : 'skipConfirm.tableDataSave',
        });
      }
    }
  }

  export function canSave() {
    return changeSetContainsChanges($changeSetStore?.value);
  }

  export function setAutoRefresh(interval) {
    autoRefreshInterval = interval;
    startAutoRefresh();
    invalidateCommands();
  }

  export function isAutoRefresh() {
    return autoRefreshStarted;
  }

  export function startAutoRefresh() {
    closeRefreshTimer();
    autoRefreshTimer = setInterval(() => {
      cache.update(reloadDataCacheFunc);
    }, autoRefreshInterval * 1000);
    autoRefreshStarted = true;
    invalidateCommands();
  }

  export function stopAutoRefresh() {
    closeRefreshTimer();
    autoRefreshStarted = false;
    invalidateCommands();
  }

  function closeRefreshTimer() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  $: {
    $changeSetStore;
    invalidateCommands();
  }

  registerMenu({ command: 'tableData.save', tag: 'save' });

  const collapsedLeftColumnStore = writable(getLocalStorage('dataGrid_collapsedLeftColumn', true));
  setContext('collapsedLeftColumnStore', collapsedLeftColumnStore);
  $: setLocalStorage('dataGrid_collapsedLeftColumn', $collapsedLeftColumnStore);

  onDestroy(() => {
    closeRefreshTimer();
  });

  const quickExportHandlerRef = createQuickExportHandlerRef();

  // same items as ToolStripExportButton: quick formats when the grid registered a handler
  function createExportMenu() {
    const handler = quickExportHandlerRef.get();
    return [
      handler
        ? createQuickExportMenuItems(handler, { command: 'sqlDataGrid.export' })
        : { command: 'sqlDataGrid.export' },
    ];
  }

  // What the toolbar folds away as it gets narrow, step by step (see ToolStripFit):
  // 1 view toggles, 2 export and fetch all, 3 refresh, 4 delete, revert and form navigation,
  // 5 the view switch shows icons only, 6 Insert row shows its icon only.
  const FOLD_LEVELS = 6;

  function createMoreMenu(level) {
    return [
      level >= 4 && [
        { command: 'dataForm.goToFirst', hideDisabled: true },
        { command: 'dataForm.goToPrevious', hideDisabled: true },
        { command: 'dataForm.goToNext', hideDisabled: true },
        { command: 'dataForm.goToLast', hideDisabled: true },
        { divider: true },
      ],
      level >= 3 && [
        { command: 'dataGrid.refresh', hideDisabled: true },
        { command: 'dataForm.refresh', hideDisabled: true },
        {
          text: _t('tableData.autoRefresh', { defaultMessage: 'Auto refresh' }),
          submenu: createAutoRefreshMenu(),
        },
      ],
      level >= 2 && [
        { command: 'dataGrid.fetchAll', hideDisabled: true },
        hasPermission('dbops/export') && {
          text: _t('common.export', { defaultMessage: 'Export' }),
          submenu: createExportMenu(),
        },
        { divider: true },
      ],
      level >= 1 && [
        {
          text: $collapsedLeftColumnStore
            ? _t('tableData.showColumnsPanel', { defaultMessage: 'Show columns panel' })
            : _t('tableData.hideColumnsPanel', { defaultMessage: 'Hide columns panel' }),
          onClick: () => collapsedLeftColumnStore.update(x => !x),
        },
        { command: 'dataGrid.switchToForm', hideDisabled: true },
        { command: 'dataGrid.switchToTable', hideDisabled: true },
        { command: 'dataGrid.toggleCellDataView', hideDisabled: true },
        { divider: true },
      ],
      level >= 4 && [
        { command: 'dataGrid.deleteSelectedRows', hideDisabled: true },
        { command: 'dataGrid.revertAllChanges', hideDisabled: true },
      ],
    ];
  }

  function createAutoRefreshMenu() {
    return [
      { divider: true },
      { command: 'dataGrid.deepRefresh', hideDisabled: true },
      { command: 'tableData.stopAutoRefresh', hideDisabled: true },
      { command: 'tableData.startAutoRefresh', hideDisabled: true },
      'tableData.setAutoRefresh.1',
      ...INTERVALS.map(seconds => ({
        command: `tableData.setAutoRefresh.${seconds}`,
        text: `...${seconds}` + ' ' + _t('command.datagrid.autoRefresh.seconds', { defaultMessage: 'seconds' }),
      })),
    ];
  }
</script>

<ToolStripContainer>
  <TableDataGrid
    {...$$props}
    activateOnTabVisible
    config={$config}
    setConfig={config.update}
    cache={$cache}
    setCache={cache.update}
    changeSetState={$changeSetStore}
    focusOnVisible
    pagingFooter
    allowRowSidePanel
    {changeSetStore}
    {dispatchChangeSet}
  />

  <svelte:fragment slot="toolstrip">
    <ToolStripFit maxLevel={FOLD_LEVELS} let:level>
      <TableViewSwitch
        active="data"
        {conid}
        {database}
        {schemaName}
        {pureName}
        objectTypeField="tables"
        {tabPreviewMode}
        compact={level >= 5}
        testIds={{ details: 'TableDataTab_details' }}
      />

      <div class="filter" data-fit-ignore>
        <ToolStripFilterBuilder
          columns={filterColumns}
          filters={$config?.filters}
          disabledFilterColumns={$config?.disabledFilterColumns}
          multiColumnFilter={$config?.multiColumnFilter}
          disabledMultiColumnFilter={$config?.disabledMultiColumnFilter}
          {driver}
          placeholder={_t('tableData.filterRows', { defaultMessage: 'Filter rows...' })}
          {setColumnFilter}
          setMultiColumnFilter={setToolbarFilter}
          data-testid="TableDataTab_filterRows"
        />
      </div>

      {#if level < 4}
        <!-- form view: record navigation -->
        <div class="group">
          <ToolStripCommandButton
            command="dataForm.goToFirst"
            component={ToolStripQuietButton}
            hideDisabled
            data-testid="TableDataTab_goToFirst"
          />
          <ToolStripCommandButton
            command="dataForm.goToPrevious"
            component={ToolStripQuietButton}
            hideDisabled
            data-testid="TableDataTab_goToPrevious"
          />
          <ToolStripCommandButton
            command="dataForm.goToNext"
            component={ToolStripQuietButton}
            hideDisabled
            data-testid="TableDataTab_goToNext"
          />
          <ToolStripCommandButton
            command="dataForm.goToLast"
            component={ToolStripQuietButton}
            hideDisabled
            data-testid="TableDataTab_goToLast"
          />
        </div>
      {/if}

      <div class="spacer" />

      <!-- data: refresh, fetch all, export -->
      {#if level < 3}
        <div class="group">
          <ToolStripCommandButton
            command="dataGrid.refresh"
            component={ToolStripQuietButton}
            hideDisabled
            split
            menu={() => [{ command: 'dataGrid.refresh' }, ...createAutoRefreshMenu()]}
            menuTitle={_t('tableData.autoRefreshOptions', { defaultMessage: 'Auto refresh' })}
            active={autoRefreshStarted}
            iconOnly={!autoRefreshStarted}
            buttonLabel={autoRefreshStarted
              ? _t('tableData.autoRefreshEvery', {
                  defaultMessage: 'Every {autoRefreshInterval}s',
                  values: { autoRefreshInterval },
                })
              : null}
            data-testid="TableDataTab_refreshGrid"
          />
          <ToolStripCommandButton
            command="dataForm.refresh"
            component={ToolStripQuietButton}
            hideDisabled
            split
            menu={() => [{ command: 'dataForm.refresh' }, ...createAutoRefreshMenu()]}
            menuTitle={_t('tableData.autoRefreshOptions', { defaultMessage: 'Auto refresh' })}
            active={autoRefreshStarted}
            iconOnly={!autoRefreshStarted}
            buttonLabel={autoRefreshStarted
              ? _t('tableData.autoRefreshEvery', {
                  defaultMessage: 'Every {autoRefreshInterval}s',
                  values: { autoRefreshInterval },
                })
              : null}
            data-testid="TableDataTab_refreshForm"
          />
          {#if level < 2}
            <ToolStripCommandButton
              command="dataGrid.fetchAll"
              component={ToolStripQuietButton}
              hideDisabled
              data-testid="TableDataTab_fetchAll"
            />
            {#if hasPermission('dbops/export')}
              <ToolStripQuietButton
                icon="icon export"
                title={_t('common.export', { defaultMessage: 'Export' })}
                menu={createExportMenu}
                data-testid="TableDataTab_export">{_t('common.export', { defaultMessage: 'Export' })}</ToolStripQuietButton
              >
            {/if}
          {/if}
        </div>
      {/if}

      <!-- view: panels and modes around the grid -->
      {#if level < 1}
        <div class="group">
          <ToolStripQuietButton
            icon="icon columns-outline"
            active={!$collapsedLeftColumnStore}
            title={_t('tableData.viewColumns', { defaultMessage: 'View columns' })}
            on:click={() => collapsedLeftColumnStore.update(x => !x)}
            data-testid="TableDataTab_toggleColumns"
            >{_t('tableData.viewColumns', { defaultMessage: 'View columns' })}</ToolStripQuietButton
          >
          <ToolStripCommandButton
            command="dataGrid.switchToForm"
            component={ToolStripQuietButton}
            hideDisabled
            data-testid="TableDataTab_switchToForm"
          />
          <ToolStripCommandButton
            command="dataGrid.switchToTable"
            component={ToolStripQuietButton}
            hideDisabled
            icon="icon form"
            active
            data-testid="TableDataTab_switchToTable"
          />
          <ToolStripCommandButton
            command="dataGrid.toggleCellDataView"
            component={ToolStripQuietButton}
            hideDisabled
            data-testid="TableDataTab_toggleCellDataView"
          />
        </div>
      {/if}

      <!-- edit: what is folded away, delete, then the one filled button -->
      <div class="group">
        {#if level > 0}
          <ToolStripQuietButton
            icon="icon dots-horizontal"
            title={_t('tableData.moreActions', { defaultMessage: 'More actions' })}
            menu={() => createMoreMenu(level)}
            showChevron={false}
            data-testid="TableDataTab_more">{_t('tableData.moreActions', { defaultMessage: 'More actions' })}</ToolStripQuietButton
          >
        {/if}
        {#if level < 4}
          <ToolStripCommandButton
            command="dataGrid.deleteSelectedRows"
            component={ToolStripQuietButton}
            hideDisabled
            icon="icon trash"
            variant="destructive"
            data-testid="TableDataTab_deleteSelectedRows"
          />
          <ToolStripCommandButton
            command="dataGrid.revertAllChanges"
            component={ToolStripQuietButton}
            hideDisabled
            icon="icon undo"
            data-testid="TableDataTab_revertAllChanges"
          />
        {/if}
        <ToolStripCommandButton
          command="tableData.save"
          hideDisabled
          variant="primary"
          iconAfter={getNumberIcon(changeSetChangedCount($changeSetStore?.value))}
          data-testid="TableDataTab_save"
        />
        <ToolStripCommandButton
          command="dataGrid.insertNewRow"
          hideDisabled
          icon="icon plus"
          variant={hasPendingChanges ? 'secondary' : 'primary'}
          iconOnly={level >= 6}
          buttonLabel={_t('tableData.insertRow', { defaultMessage: 'Insert row' })}
          data-testid="TableDataTab_insertNewRow"
        />
      </div>
    </ToolStripFit>
  </svelte:fragment>
</ToolStripContainer>

<style>
  .filter {
    display: contents;
  }
  .group {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 2px;
  }
  .group:empty {
    display: none;
  }
  .spacer {
    flex: 1 1 0;
    min-width: 0;
    margin: 0 -6px;
  }
</style>
