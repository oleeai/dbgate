<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';
  import { showModal } from '../modals/modalTools';
  import ColumnSidePanel from '../tableeditor/ColumnSidePanel.svelte';
  import { _t } from '../translations';

  export let conid;
  export let database;
  export let table;
  export let driver;
  export let onSaved = null;

  function handleClick() {
    showModal(ColumnSidePanel, {
      conid,
      database,
      schemaName: table.schemaName,
      pureName: table.pureName,
      columnName: null,
      driver,
      onSaved,
    });
  }
</script>

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
