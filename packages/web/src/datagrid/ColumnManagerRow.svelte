<script lang="ts">
  import { plusExpandIcon } from '../icons/expandIcons';

  import FontIcon from '../icons/FontIcon.svelte';
  import ColumnLabel from '../elements/ColumnLabel.svelte';
  import { createEventDispatcher } from 'svelte';
  import { showModal } from '../modals/modalTools';
  import ColumnEditorModal from '../tableeditor/ColumnEditorModal.svelte';
  import { editorDeleteColumn } from 'dbgate-tools';
  import { isProApp } from '../utility/proTools';
  import { _t } from '../translations';

  export let column;
  export let display;
  export let isJsonView = false;
  export let isSelected = false;
  export let conid;
  export let database;
  export let isDynamicStructure;
  export let filter = undefined;

  export let tableInfo;
  export let setTableInfo;

  export let columnInfo = null;
  export let columnIndex = -1;

  export let isColumnManagerFocused = false;

  export let allowChangeChangeSetStructure = false;
  $: addDataCommand = allowChangeChangeSetStructure;

  function handleEditColumn() {
    showModal(ColumnEditorModal, { columnInfo, tableInfo, setTableInfo, addDataCommand });
  }

  function exchange(array, i1, i2) {
    const i1r = (i1 + array.length) % array.length;
    const i2r = (i2 + array.length) % array.length;
    const res = [...array];
    [res[i1r], res[i2r]] = [res[i2r], res[i1r]];
    return res;
  }

  const dispatch = createEventDispatcher();
</script>

<div
  class="row"
  on:click={e => {
    // @ts-ignore
    if (e.target.closest('.expandColumnIcon')) return;
    if (isJsonView) display.showFilter(column.uniqueName);
    else display.focusColumns([column.uniqueName]);
  }}
  class:isSelected
  class:isFocused={isColumnManagerFocused}
  class:isHidden={!isJsonView && !column.isChecked}
  on:click
  on:mousedown
  on:mousemove
  on:mouseup
>
  {#if isProApp()}
    <span class="expandColumnIcon" style={`margin-left: ${(column.uniquePath.length - 1) * 10}px`}>
      <FontIcon
        icon={column.isExpandable ? plusExpandIcon(display.isExpandedColumn(column.uniqueName)) : 'icon invisible-box'}
        on:click={() => display.toggleExpandedColumn(column.uniqueName)}
        data-testid="ColumnManagerRow_expand_{column.uniqueName}"
      />
    </span>
  {/if}
  {#if isJsonView}
    <span class="lead"><FontIcon icon="img column" /></span>
  {:else}
    <input
      type="checkbox"
      class="check"
      checked={column.isChecked}
      title={column.isChecked
        ? _t('columnManager.hideColumn', { defaultMessage: 'Hide column' })
        : _t('columnManager.showColumn', { defaultMessage: 'Show column' })}
      on:click={e => {
        e.stopPropagation();
      }}
      on:mousedown={e => {
        e.stopPropagation();
      }}
      on:change={() => {
        const newValue = !column.isChecked;
        display.setColumnVisibility(column.uniquePath, newValue);
        dispatch('setvisibility', newValue);
      }}
      data-testid="ColumnManagerRow_checkbox_{column.uniqueName}"
    />
  {/if}
  <div class="label-wrap">
    <ColumnLabel {...column} showDataType {conid} {database} {filter} keyIcons listLayout />
  </div>

  {#if allowChangeChangeSetStructure && !isDynamicStructure}
    <div class="actions">
      <span
        class="action"
        title={_t('columnManager.editColumn', { defaultMessage: 'Edit column' })}
        on:click={handleEditColumn}
      >
        <FontIcon icon="icon edit" />
      </span>
      <span
        class="action"
        title={_t('columnManager.deleteColumn', { defaultMessage: 'Delete column' })}
        on:click={() => setTableInfo(info => editorDeleteColumn(info, columnInfo, addDataCommand))}
      >
        <FontIcon icon="icon delete" />
      </span>
      <span
        class="action"
        title={_t('columnManager.moveUp', { defaultMessage: 'Move up' })}
        on:click={() =>
          setTableInfo(info => ({ ...info, columns: exchange(info.columns, columnIndex, columnIndex - 1) }))}
      >
        <FontIcon icon="icon arrow-up" />
      </span>
      <span
        class="action"
        title={_t('columnManager.moveDown', { defaultMessage: 'Move down' })}
        on:click={() =>
          setTableInfo(info => ({ ...info, columns: exchange(info.columns, columnIndex, columnIndex + 1) }))}
      >
        <FontIcon icon="icon arrow-down" />
      </span>
    </div>
  {/if}
</div>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 8px;
    margin: 0 6px;
    border-radius: var(--dim-radius-sm);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 80ms ease;
  }
  .row:hover {
    background: var(--theme-altsidebar-background-hover);
  }

  .row.isSelected {
    background: var(--theme-altsidebar-background-active);
  }

  .row.isSelected.isFocused {
    background: var(--theme-altsidebar-background-focused);
  }

  .row.isSelected.isFocused::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background-color: var(--theme-ui-accent);
  }

  .lead {
    display: inline-flex;
    flex: none;
    justify-content: center;
    width: 14px;
  }

  .check {
    appearance: none;
    -webkit-appearance: none;
    flex: none;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    margin: 0;
    border: 1.5px solid var(--theme-ui-border-strong);
    border-radius: 4px;
    background: transparent center / 10px 10px no-repeat;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      transform 100ms ease;
  }
  .check:hover {
    border-color: var(--theme-ui-text-tertiary);
  }
  .check:checked {
    border-color: var(--theme-ui-accent);
    background-color: var(--theme-ui-accent);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.3l2.4 2.4 4.6-5.1' fill='none' stroke='white' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  }
  .check:checked:hover {
    border-color: var(--theme-ui-accent-hover);
    background-color: var(--theme-ui-accent-hover);
  }
  .check:active {
    transform: scale(0.88);
  }
  .check:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  .label-wrap {
    display: flex;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    transition: opacity 120ms ease;
  }
  .row.isHidden .label-wrap {
    opacity: 0.5;
  }

  .actions {
    display: flex;
    flex: none;
    gap: 1px;
    opacity: 0;
    transition: opacity 120ms ease;
  }
  .row:hover .actions,
  .row.isSelected .actions {
    opacity: 1;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    color: var(--theme-altsidebar-foreground-button);
  }
  .action:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-altsidebar-foreground-hover);
  }

  @media (prefers-reduced-motion: reduce) {
    .row,
    .check,
    .label-wrap,
    .actions {
      transition: none;
    }
    .check:active {
      transform: none;
    }
  }
</style>
