<script lang="ts">
  import { getContext } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import type { TableInspector } from '../inspector/tableInspector';
  import { _t } from '../translations';

  export let table;

  // the column editor lives in the table data tab's inspector, which also refreshes the grid after a change
  const inspector = getContext('tableInspector') as TableInspector;

  function handleClick() {
    inspector.editColumn(null);
  }
</script>

{#if inspector?.matchesTable(table)}
  <button
    class="add-column buttonLike"
    tabindex="-1"
    on:click|stopPropagation={handleClick}
    title={_t('columnMenu.addColumnTitle', { defaultMessage: 'Add column' })}
    aria-label={_t('columnMenu.addColumnTitle', { defaultMessage: 'Add column' })}
    data-testid="ColumnAddButton_button"
  >
    <FontIcon icon="icon plus" />
  </button>
{/if}

<style>
  .add-column {
    width: 22px;
    height: 22px;
    margin: 0 7px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--theme-ui-border-strong);
    border-radius: 6px;
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font-size: 15px;
    cursor: pointer;
    transition:
      color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      background-color var(--dim-transition-fast);
  }
  .add-column:hover {
    border-style: solid;
    border-color: var(--theme-ui-accent);
    color: var(--theme-ui-accent-strong);
    background: var(--theme-ui-accent-soft);
  }
</style>
