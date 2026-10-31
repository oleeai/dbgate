<script lang="ts" context="module">
  import registerCommand from '../commands/registerCommand';
  import { getActiveComponent } from '../utility/createActivator';
  import { __t } from '../translations';

  registerCommand({
    id: 'tableData.toggleInspector',
    category: __t('command.tableData', { defaultMessage: 'Table data' }),
    name: __t('command.tableData.toggleInspector', { defaultMessage: 'Toggle inspector' }),
    toolbarName: __t('command.tableData.toggleInspector.toolbar', { defaultMessage: 'Inspector' }),
    icon: 'icon inspector',
    keyText: 'CtrlOrCommand+I',
    isRelatedToTab: true,
    testEnabled: () => !!getActiveComponent('TableDataTab'),
    onClick: () => getActiveComponent('TableDataTab').toggleInspector(),
  });
</script>

<script lang="ts">
  import _ from 'lodash';
  import { onDestroy, tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { findEngineDriver } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import RowSidePanel from '../datagrid/RowSidePanel.svelte';
  import ColumnSidePanel from '../tableeditor/ColumnSidePanel.svelte';
  import CellDataWidget from '../widgets/CellDataWidget.svelte';
  import { extensions } from '../stores';
  import { formatKeyText } from '../utility/common';
  import hasPermission from '../utility/hasPermission';
  import { useConnectionInfo, useDatabaseInfo, useTableInfo } from '../utility/metadataLoaders';
  import splitterDrag from '../utility/splitterDrag';
  import { getLocalStorage, setLocalStorage } from '../utility/storageCache';
  import { _t } from '../translations';
  import InspectorColumnSection from './InspectorColumnSection.svelte';
  import InspectorHero from './InspectorHero.svelte';
  import InspectorSegments from './InspectorSegments.svelte';
  import InspectorTableSection from './InspectorTableSection.svelte';
  import type { TableInspector } from './tableInspector';

  export let inspector: TableInspector;
  export let conid;
  export let database;
  export let schemaName;
  export let pureName;

  const WIDTH_STORAGE_KEY = 'tableInspectorWidth';
  const DEFAULT_WIDTH = 380;
  const MIN_WIDTH = 300;
  // the grid keeps at least this much room
  const MIN_GRID_WIDTH = 260;

  const view = inspector.view;
  const connection = useConnectionInfo({ conid });
  const dbinfo = useDatabaseInfo({ conid, database });
  const tableInfo = useTableInfo({ conid, database, schemaName, pureName });
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  $: driver = findEngineDriver($connection, $extensions);
  $: allowStructureEdit = !$connection?.isReadOnly && hasPermission('dbops/model/edit') && !!$tableInfo;

  // ---- width
  let width = Math.max(getLocalStorage(WIDTH_STORAGE_KEY, DEFAULT_WIDTH), MIN_WIDTH);
  let layoutWidth = 0;
  $: maxWidth = Math.max(MIN_WIDTH, (layoutWidth || 1200) - MIN_GRID_WIDTH);
  $: panelWidth = Math.round(Math.min(width, maxWidth));
  const saveWidth = _.debounce(value => setLocalStorage(WIDTH_STORAGE_KEY, value), 300);

  function handleResize(e) {
    width = Math.round(Math.min(Math.max(panelWidth - e.detail, MIN_WIDTH), maxWidth));
    saveWidth(width);
  }

  // ---- open and close
  // The panel slides over the grid first and the grid makes room once it has settled, so the grid lays
  // out once per toggle instead of every frame. Closing gives the room back first, then slides out.
  // The slide is a CSS transition, so toggling again mid-way turns it around from where it is.
  let domLayout;
  let domPanel;
  let mounted = $view.open;
  let shown = $view.open;
  let docked = $view.open;
  let lastOpen = $view.open;
  let settleTimer = null;

  // while the panel slides out it keeps showing what it showed
  let shownView = $view;
  $: if ($view.open) shownView = $view;

  $: handleOpenChange($view.open);

  async function handleOpenChange(open) {
    if (open == lastOpen) return;
    lastOpen = open;
    clearTimeout(settleTimer);
    if (open) {
      mounted = true;
      if (reducedMotion?.matches) docked = true;
      await tick();
      // start from the closed position, then slide in
      domPanel?.getBoundingClientRect();
      if (!$view.open) return;
      shown = true;
    } else {
      domRow?.commitDraft();
      docked = false;
      shown = false;
    }
    settleTimer = setTimeout(settle, 500);
  }

  function settle() {
    clearTimeout(settleTimer);
    if ($view.open) {
      if (shown) docked = true;
    } else if (!shown) {
      mounted = false;
    }
  }

  function handleTransitionEnd(e) {
    if (e.target == domPanel && (e.propertyName == 'transform' || e.propertyName == 'opacity')) settle();
  }

  // ---- sections
  let domRow;
  let domColumnEditor;

  $: grid = shownView.grid;
  $: section = shownView.section;
  $: sectionKey = `${section}${shownView.insert ? ':insert' : ''}${shownView.columnEdit ? ':edit' : ''}`;

  // leaving the row (another section, or closing) keeps its edits as pending changes
  let lastSectionKey = null;
  $: if (sectionKey != lastSectionKey) {
    if (lastSectionKey == 'row') domRow?.commitDraft();
    lastSectionKey = sectionKey;
  }

  let lastFocusRequest = $view.focusRequest;
  $: handleFocusRequest($view.focusRequest);

  async function handleFocusRequest(request) {
    if (request == lastFocusRequest) return;
    lastFocusRequest = request;
    await tick();
    if ($view.section == 'row') domRow?.focusPanel();
    else if ($view.columnEdit) domColumnEditor?.focusPanel();
  }

  $: segments = [
    {
      id: 'row',
      label: _t('inspector.section.row', { defaultMessage: 'Row' }),
      disabled: !shownView.available.row,
    },
    {
      id: 'column',
      label: _t('inspector.section.column', { defaultMessage: 'Column' }),
      disabled: !shownView.available.column,
    },
    {
      id: 'table',
      label: _t('inspector.section.table', { defaultMessage: 'Table' }),
      disabled: !shownView.available.table,
    },
    {
      id: 'value',
      label: _t('inspector.section.value', { defaultMessage: 'Value' }),
      title: _t('inspector.section.valueHint', {
        defaultMessage: 'The selected value as text, JSON, a picture or a map',
      }),
      disabled: !shownView.available.value,
    },
  ];

  const closeShortcut = formatKeyText('CtrlOrCommand+I');

  $: valueCells = (shownView.cells ?? []).map(cell => ({
    ...cell,
    value: cell.value?.$bigint ?? cell.value?.$decimal ?? cell.value,
  }));
  $: valueRows = _.uniq(valueCells.map(x => x.row));

  function handleRowDone() {
    if ($view.insert) inspector.finishInsert();
    else inspector.finishTask();
  }

  // Esc in the grid closes an inspector that Edit row or Insert row opened, as it closed the old row sheet
  function handleWindowKeyDown(e) {
    if (e.key != 'Escape' || e.defaultPrevented) return;
    if (!e.target?.classList?.contains('focus-field') || !domLayout?.contains(e.target)) return;
    inspector.escapeFromGrid();
  }

  function sectionIn(node) {
    if (reducedMotion?.matches) return { duration: 0 };
    return {
      duration: 180,
      easing: cubicOut,
      css: (t, u) => `opacity: ${t}; transform: translateY(${u * 4}px)`,
    };
  }

  onDestroy(() => {
    clearTimeout(settleTimer);
    saveWidth.flush();
  });
</script>

<svelte:window on:keydown={handleWindowKeyDown} />

<!-- the panel slides in from outside the clipped layout; a focus there must not scroll the layout sideways -->
<div
  class="layout"
  bind:this={domLayout}
  bind:clientWidth={layoutWidth}
  on:scroll={() => domLayout.scrollLeft && (domLayout.scrollLeft = 0)}
>
  <div class="main">
    <slot />
  </div>

  <div class="dock" style={`width:${docked ? panelWidth : 0}px`}>
    {#if mounted}
      <aside
        class="panel"
        class:shown
        class:docked
        style={`width:${panelWidth}px`}
        bind:this={domPanel}
        on:transitionend={handleTransitionEnd}
        aria-label={_t('inspector.title', { defaultMessage: 'Inspector' })}
        data-testid="TableInspector_panel"
      >
        <div class="resize-handle" use:splitterDrag={'clientX'} on:resizeSplitter={handleResize} />

        <div class="bar">
          <InspectorSegments
            items={segments}
            value={section}
            onSelect={id => inspector.selectSection(id)}
            data-testid="TableInspector_sections"
          />
          <button
            class="close"
            on:click={() => inspector.close()}
            title={`${_t('inspector.close', { defaultMessage: 'Close inspector' })} (${closeShortcut})`}
            data-testid="TableInspector_close"
          >
            <FontIcon icon="icon close" />
          </button>
        </div>

        <div class="content">
          {#key sectionKey}
            <div class="section" in:sectionIn data-testid={`TableInspector_${section}`}>
              {#if section == 'row' && grid}
                <RowSidePanel
                  bind:this={domRow}
                  display={grid.display}
                  grider={grid.grider}
                  {conid}
                  {database}
                  mode={shownView.insert ? 'insert' : 'edit'}
                  rowIndex={shownView.insert ? null : grid.rowIndex}
                  editorTypes={grid.editorTypes}
                  currentColumn={grid.columnUniqueName}
                  onClose={handleRowDone}
                  onNavigate={delta => grid.api.navigateRow(grid.rowIndex, delta)}
                  onInserted={rowIndex => inspector.finishInsert(rowIndex)}
                />
              {:else if section == 'column' && shownView.columnEdit}
                <ColumnSidePanel
                  bind:this={domColumnEditor}
                  {conid}
                  {database}
                  {schemaName}
                  {pureName}
                  columnName={shownView.columnEdit.columnName}
                  {driver}
                  onSaved={() => inspector.getView().grid?.api.refresh()}
                  onClose={() => inspector.finishColumnEdit()}
                />
              {:else if section == 'column'}
                <InspectorColumnSection
                  {inspector}
                  {conid}
                  {database}
                  {driver}
                  table={$tableInfo}
                  columnName={shownView.columnName}
                  {allowStructureEdit}
                />
              {:else if section == 'value'}
                <InspectorHero
                  icon="mdi mdi-card-text-outline"
                  title={valueCells.length == 1
                    ? valueCells[0].column
                    : _t('inspector.value.cells', {
                        defaultMessage: '{count} values',
                        values: { count: valueCells.length },
                      })}
                  subtitle={valueRows.length == 1
                    ? _t('rowPanel.rowNumber', { defaultMessage: 'Row {number}', values: { number: valueRows[0] + 1 } })
                    : _t('inspector.value.rows', {
                        defaultMessage: '{count} rows',
                        values: { count: valueRows.length },
                      })}
                />
                <div class="value-body">
                  <CellDataWidget showTitle={false} selection={valueCells} onClose={() => inspector.toggleValue()} />
                </div>
              {:else}
                <InspectorTableSection
                  {conid}
                  {database}
                  {schemaName}
                  {pureName}
                  connection={$connection}
                  {driver}
                  table={$tableInfo}
                  dbinfo={$dbinfo}
                  allRowCount={grid?.allRowCount}
                  hasFilters={!!grid?.display?.filterCount || !!grid?.display?.config?.multiColumnFilter}
                />
              {/if}
            </div>
          {/key}
        </div>
      </aside>
    {/if}
  </div>
</div>

<style>
  .layout {
    position: absolute;
    inset: 0;
    display: flex;
    overflow: hidden;
  }
  .main {
    position: relative;
    flex: 1;
    min-width: 0;
    isolation: isolate;
  }
  .dock {
    position: relative;
    flex: none;
    z-index: 1;
  }

  .panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    border-left: 1px solid var(--theme-ui-border);
    background: color-mix(in srgb, var(--theme-ui-surface) 88%, transparent);
    backdrop-filter: blur(24px) saturate(1.6);
    -webkit-backdrop-filter: blur(24px) saturate(1.6);
    color: var(--theme-generic-font);
    font-size: 13px;
    box-shadow:
      -18px 0 40px -20px color-mix(in srgb, #000 34%, transparent),
      -1px 0 6px -3px color-mix(in srgb, #000 12%, transparent);
    transform: translateX(100%);
    transition:
      transform 220ms var(--dim-ease-out),
      box-shadow 200ms var(--dim-ease-out);
  }
  .panel.shown {
    transform: none;
    transition:
      transform 360ms var(--dim-ease-spring),
      box-shadow 200ms var(--dim-ease-out);
  }
  .panel.docked {
    box-shadow: none;
  }

  .resize-handle {
    position: absolute;
    left: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    z-index: 3;
    cursor: col-resize;
  }
  .resize-handle:hover,
  .resize-handle:active {
    background: linear-gradient(
      to right,
      transparent 2px,
      var(--theme-splitter-active) 2px,
      var(--theme-splitter-active) 4px,
      transparent 4px
    );
  }

  .bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 8px 6px 12px;
  }
  .close {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
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
  .close:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .close:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  .content {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .section {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  .value-body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    border-top: 1px solid var(--theme-ui-border-subtle);
  }
  /* the cell data view's format picker sits on the panel, not on a toolbar strip */
  .value-body :global(.toolbar) {
    padding: 8px 16px;
    background: transparent;
    border-bottom: 1px solid var(--theme-ui-border-subtle);
    color: var(--theme-ui-text-secondary);
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .panel,
    .panel.shown {
      transform: none;
      transition: opacity 140ms linear;
    }
    .panel {
      opacity: 0;
    }
    .panel.shown {
      opacity: 1;
    }
  }
</style>
