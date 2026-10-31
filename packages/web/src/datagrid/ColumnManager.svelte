<script lang="ts">
  import _, { add, indexOf, range } from 'lodash';
  import { ChangeSet, DisplayColumn, GridDisplay } from 'dbgate-datalib';
  import { filterName } from 'dbgate-tools';
  import CloseSearchButton from '../buttons/CloseSearchButton.svelte';

  import InlineButton from '../buttons/InlineButton.svelte';
  import ManagerInnerContainer from '../elements/ManagerInnerContainer.svelte';

  import SearchBoxWrapper from '../elements/SearchBoxWrapper.svelte';
  import SearchInput from '../elements/SearchInput.svelte';
  import InputTextModal from '../modals/InputTextModal.svelte';
  import { showModal } from '../modals/modalTools';
  import keycodes from '../utility/keycodes';
  import ColumnManagerRow from './ColumnManagerRow.svelte';
  import { copyTextToClipboard } from '../utility/clipboard';
  import SelectField from '../forms/SelectField.svelte';
  import ColumnEditorModal from '../tableeditor/ColumnEditorModal.svelte';
  import { tick } from 'svelte';
  import { _t } from '../translations';

  export let managerSize;
  export let display: GridDisplay;
  export let isJsonView = false;
  export let isDynamicStructure = false;
  export let conid;
  export let database;
  export let allowChangeChangeSetStructure = false;
  export let changeSetState: { value: ChangeSet } = null;
  export let dispatchChangeSet = null;

  let domFocusField;

  let selectedColumns = [];
  let currentColumnUniqueName = null;
  let dragStartColumnIndex = null;
  let shiftOriginColumnIndex = null;

  $: currentFilter = display?.config?.searchInColumns;

  $: items = display?.getColumns(currentFilter)?.filter(column => filterName(currentFilter, column.columnName)) || [];
  $: shownCount = items.filter(x => x.isChecked).length;
  $: allShown = isJsonView || shownCount == items.length;
  $: summaryText = currentFilter
    ? _t('columnManager.countMatching', { defaultMessage: '{count} matching', values: { count: items.length } })
    : allShown
      ? _t('columnManager.countAll', { defaultMessage: '{count} columns', values: { count: items.length } })
      : _t('columnManager.countShown', {
          defaultMessage: '{shown} of {count} shown',
          values: { shown: shownCount, count: items.length },
        });

  function selectColumnIndexCore(index, e) {
    const uniqueName = items[index].uniqueName;
    if (e.shiftKey) {
      const curIndex = _.findIndex(items, x => x.uniqueName == currentColumnUniqueName);
      if (curIndex >= 0 && shiftOriginColumnIndex == null) shiftOriginColumnIndex = curIndex;

      selectedColumns = _.range(
        Math.min(shiftOriginColumnIndex, index),
        Math.max(shiftOriginColumnIndex, index) + 1
      ).map(i => items[i].uniqueName);
    } else {
      selectedColumns = [uniqueName];
      shiftOriginColumnIndex = null;
    }

    currentColumnUniqueName = uniqueName;
    if (!isJsonView) {
      display.focusColumns(selectedColumns);
    }
  }

  function selectColumnIndex(index, e) {
    if (index >= 0 && index < items.length) {
      selectColumnIndexCore(index, e);
      return;
    }
    if (items.length == 0) {
      return;
    }
    if (index < 0) {
      selectColumnIndexCore(0, e);
      return;
    } else if (index >= items.length) {
      selectColumnIndexCore(items.length - 1, e);
      return;
    }
  }

  function moveIndex(indexFunc, e) {
    const index = _.findIndex(items, x => x.uniqueName == currentColumnUniqueName);
    if (index >= 0) {
      selectColumnIndex(indexFunc(index), e);
    }
  }

  function handleKeyDown(e) {
    if (e.keyCode == keycodes.upArrow) moveIndex(i => i - 1, e);
    else if (e.keyCode == keycodes.downArrow) moveIndex(i => i + 1, e);
    else if (e.keyCode == keycodes.home) moveIndex(() => 0, e);
    else if (e.keyCode == keycodes.end) moveIndex(() => items.length - 1, e);
    else if (e.keyCode == keycodes.pageUp) moveIndex(i => i - 10, e);
    else if (e.keyCode == keycodes.pageDown) moveIndex(i => i + 10, e);
    else if (e.keyCode == keycodes.space) {
      let checked = null;
      for (const name of selectedColumns) {
        const column = items.find(x => x.uniqueName == name);
        if (column) {
          if (checked == null) checked = !column.isChecked;
          display.setColumnVisibility(column.uniquePath, checked);
        }
      }
    }
  }
  function copyToClipboard() {
    copyTextToClipboard(selectedColumns.join('\r\n'));
  }

  export function setSelectedColumns(value) {
    selectedColumns = value;
    if (value.length > 0) currentColumnUniqueName = value[0];
  }

  $: tableInfo = display?.editableStructure;
  $: setTableInfo = updFunc => {
    const structure = updFunc(display?.editableStructure);
    let added = [];
    if (structure['__addDataCommands']) {
      added = structure['__addDataCommands'];
      delete structure['__addDataCommands'];
    }
    dispatchChangeSet({
      type: 'set',
      value: {
        ...changeSetState?.value,
        dataUpdateCommands: [...(changeSetState?.value?.dataUpdateCommands || []), ...added],
        structure,
      },
    });
    tick().then(() => display.reload());
  };

  $: addDataCommand = allowChangeChangeSetStructure;

  function handleAddColumn() {
    showModal(ColumnEditorModal, {
      setTableInfo,
      tableInfo,
      addDataCommand,
      onAddNext: async () => {
        await tick();
        handleAddColumn();
      },
    });
  }

  let isColumnManagerFocused = false;
</script>

{#if allowChangeChangeSetStructure}
  <div class="selectwrap">
    <SelectField
      isNative
      class="colmode"
      value={isDynamicStructure ? 'variable' : 'fixed'}
      options={[
        { label: _t('column.fixed', { defaultMessage: 'Fixed columns (like SQL)' }), value: 'fixed' },
        { label: _t('column.variable', { defaultMessage: 'Variable columns (like MongoDB)' }), value: 'variable' },
      ]}
      on:change={e => {
        dispatchChangeSet({
          type: 'set',
          value: {
            ...changeSetState?.value,
            structure: {
              ...display?.editableStructure,
              __isDynamicStructure: e.detail == 'variable',
              // __keepDynamicStreamHeader: true,
            },
          },
        });
      }}
    />
  </div>
{/if}
<SearchBoxWrapper altsearchbox filter={currentFilter}>
  <SearchInput
    placeholder={_t('column.search', { defaultMessage: 'Search columns' })}
    value={currentFilter}
    onChange={value => display.setSearchInColumns(value)}
    data-testid="ColumnManager_searchColumns"
    altsearchbox
  />
  <CloseSearchButton filter={currentFilter} onClearFilter={() => display.setSearchInColumns('')} />
  {#if isDynamicStructure && !isJsonView}
    <InlineButton
      on:click={() => {
        showModal(InputTextModal, {
          value: '',
          label: _t('column.name', { defaultMessage: 'Column name' }),
          header: _t('column.addNew', { defaultMessage: 'Add new column' }),
          onConfirm: name => {
            display.addDynamicColumn(name);
            tick().then(() => {
              selectedColumns = [name];
              currentColumnUniqueName = name;
              if (!isJsonView) {
                display.focusColumns(selectedColumns);
              }
            });
          },
        });
      }}>Add</InlineButton
    >
  {/if}
  {#if allowChangeChangeSetStructure && !isDynamicStructure}
    <InlineButton on:click={handleAddColumn}>Add</InlineButton>
  {/if}
</SearchBoxWrapper>
<div class="summary">
  <span class="summary-text" data-testid="ColumnManager_summary">{summaryText}</span>
  <span class="summary-actions">
    <button
      type="button"
      class="text-button"
      disabled={!isJsonView && shownCount == items.length}
      on:click={() => display.showAllColumns()}
      data-testid="ColumnManager_showAll"
    >
      {_t('columnManager.showAll', { defaultMessage: 'Show all' })}
    </button>
    <button
      type="button"
      class="text-button"
      disabled={!isJsonView && shownCount == 0}
      on:click={() => display.hideAllColumns()}
      data-testid="ColumnManager_hideAll"
    >
      {_t('columnManager.hideAll', { defaultMessage: 'Hide all' })}
    </button>
  </span>
</div>
<ManagerInnerContainer width={managerSize}>
  <input
    type="text"
    class="focus-field"
    bind:this={domFocusField}
    on:keydown={handleKeyDown}
    on:focus={() => {
      isColumnManagerFocused = true;
      // activator.activate();
      // invalidateCommands();
    }}
    on:blur={() => {
      isColumnManagerFocused = false;
    }}
    on:copy={copyToClipboard}
  />

  {#each items as column (column.uniqueName)}
    {@const columnIndex = items.indexOf(column)}
    <ColumnManagerRow
      {display}
      {column}
      {isJsonView}
      {isDynamicStructure}
      {conid}
      {database}
      {tableInfo}
      {setTableInfo}
      {isColumnManagerFocused}
      columnInfo={tableInfo?.columns?.[columnIndex]}
      {columnIndex}
      {allowChangeChangeSetStructure}
      isSelected={selectedColumns.includes(column.uniqueName) || currentColumnUniqueName == column.uniqueName}
      filter={currentFilter}
      on:click={() => {
        if (domFocusField) domFocusField.focus({ preventScroll: true });
        selectedColumns = [column.uniqueName];
        currentColumnUniqueName = column.uniqueName;
      }}
      on:mousemove={e => {
        if (e.buttons == 1 && dragStartColumnIndex != null && dragStartColumnIndex >= 0) {
          const index = _.findIndex(items, x => x.uniqueName == column.uniqueName);
          if (index >= 0) {
            selectedColumns = _.range(
              Math.min(dragStartColumnIndex, index),
              Math.max(dragStartColumnIndex, index) + 1
            ).map(i => items[i].uniqueName);
            currentColumnUniqueName = column.uniqueName;
            if (!isJsonView) {
              display.focusColumns([currentColumnUniqueName, ...selectedColumns]);
            }
          }
        }
      }}
      on:mousedown={e => {
        dragStartColumnIndex = _.findIndex(items, x => x.uniqueName == column.uniqueName);
        selectedColumns = [column.uniqueName];
        if (domFocusField) domFocusField.focus({ preventScroll: true });
        currentColumnUniqueName = column.uniqueName;
        if (!isJsonView) {
          display.focusColumns(selectedColumns);
        }
      }}
      on:mouseup={e => {
        if (domFocusField) domFocusField.focus({ preventScroll: true });
      }}
      on:setvisibility={e => {
        if (selectedColumns.includes(column.uniqueName)) {
          for (const name of selectedColumns) {
            const column = items.find(x => x.uniqueName == name);
            if (column) {
              display.setColumnVisibility(column.uniquePath, e.detail);
            }
          }
        }
      }}
    />
  {/each}
</ManagerInnerContainer>

<style>
  .focus-field {
    position: absolute;
    left: -1000px;
    top: -1000px;
  }

  .selectwrap :global(select) {
    flex: 1;
    padding: 3px 0px;
    border: none;
  }

  .selectwrap {
    border-bottom: var(--theme-table-border);
  }

  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 22px;
    padding: 0 8px 4px 14px;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
    white-space: nowrap;
  }

  .summary-text {
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }

  .summary-actions {
    display: flex;
    flex: none;
    gap: 2px;
  }

  .text-button {
    appearance: none;
    padding: 2px 6px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--theme-ui-accent-strong);
    font: inherit;
    cursor: pointer;
    transition: background-color 80ms ease;
  }
  .text-button:hover:not(:disabled) {
    background: var(--theme-ui-hover);
  }
  .text-button:disabled {
    color: var(--theme-ui-text-tertiary);
    cursor: default;
  }
</style>
