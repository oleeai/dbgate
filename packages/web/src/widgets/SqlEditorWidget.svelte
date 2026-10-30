<script lang="ts">
  import { onMount } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import newQuery from '../query/newQuery';
  import { currentDatabase, openedTabs, selectedWidget } from '../stores';
  import { formatKeyText } from '../utility/common';
  import { _t } from '../translations';
  import ConnectionSwitcher from './ConnectionSwitcher.svelte';
  import QueryHistoryList from './QueryHistoryList.svelte';
  import SavedQueriesList from './SavedQueriesList.svelte';
  import WidgetColumnBar from './WidgetColumnBar.svelte';
  import WidgetColumnBarItem from './WidgetColumnBarItem.svelte';

  function handleNewQuery() {
    newQuery();
  }

  // opening the SQL editor with nothing to edit starts a fresh query, so there is always an editor to type into
  onMount(() => {
    const hasQueryTab = ($openedTabs || []).some(x => x.tabComponent == 'QueryTab' && !x.closedTime);
    if (!hasQueryTab && $currentDatabase) newQuery();
  });
</script>

<div class="sql-editor-widget">
  <ConnectionSwitcher onShowAllConnections={() => ($selectedWidget = 'database')} />

  <div class="new-query-row">
    <button class="new-query" on:click={handleNewQuery} data-testid="SqlEditorWidget_newQuery">
      <FontIcon icon="icon plus" />
      <span class="new-query-label">{_t('sqlEditor.newQuery', { defaultMessage: 'New query' })}</span>
      <span class="new-query-shortcut">{formatKeyText('CtrlOrCommand+T')}</span>
    </button>
  </div>

  <WidgetColumnBar storageName="sqlEditorWidget">
    <WidgetColumnBarItem
      title={_t('sqlEditor.savedQueries', { defaultMessage: 'Saved queries' })}
      name="savedQueries"
      height="45%"
    >
      <SavedQueriesList />
    </WidgetColumnBarItem>

    <WidgetColumnBarItem title={_t('sqlEditor.history', { defaultMessage: 'History' })} name="queryHistory">
      <QueryHistoryList />
    </WidgetColumnBarItem>
  </WidgetColumnBar>
</div>

<style>
  .sql-editor-widget {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .new-query-row {
    padding: 6px 10px 4px;
    flex-shrink: 0;
  }
  .new-query {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-md);
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast);
  }
  .new-query:hover {
    background: var(--theme-ui-hover);
    border-color: var(--theme-ui-border-strong);
  }
  .new-query:active {
    transform: scale(0.99);
  }
  .new-query :global(.mdi) {
    color: var(--theme-generic-font-grayed);
  }
  .new-query-label {
    flex: 1;
    min-width: 0;
  }
  .new-query-shortcut {
    font-size: 11.5px;
    color: var(--theme-ui-text-tertiary);
  }
</style>
