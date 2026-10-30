<script lang="ts">
  import { onMount } from 'svelte';
  import AppObjectList from '../appobj/AppObjectList.svelte';
  import * as savedFileAppObject from '../appobj/SavedFileAppObject.svelte';
  import CloseSearchButton from '../buttons/CloseSearchButton.svelte';
  import SearchBoxWrapper from '../elements/SearchBoxWrapper.svelte';
  import SearchInput from '../elements/SearchInput.svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import newQuery from '../query/newQuery';
  import { currentDatabase, openedTabs, selectedWidget } from '../stores';
  import { formatKeyText } from '../utility/common';
  import { useFiles } from '../utility/metadataLoaders';
  import { _t } from '../translations';
  import ConnectionSwitcher from './ConnectionSwitcher.svelte';
  import QueryHistoryList from './QueryHistoryList.svelte';
  import WidgetColumnBar from './WidgetColumnBar.svelte';
  import WidgetColumnBarItem from './WidgetColumnBarItem.svelte';
  import WidgetsInnerContainer from './WidgetsInnerContainer.svelte';

  let filter = '';

  const sqlFiles = useFiles({ folder: 'sql', parseFrontMatter: true });

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

  <div class="search-row">
    <SearchBoxWrapper {filter} noMargin fillFlex>
      <SearchInput
        placeholder={_t('common.search', { defaultMessage: 'Search' })}
        bind:value={filter}
      />
      <CloseSearchButton bind:filter />
    </SearchBoxWrapper>
    <button
      class="row-button"
      on:click={handleNewQuery}
      title={`${_t('sqlEditor.newQuery', { defaultMessage: 'New query' })} (${formatKeyText('CtrlOrCommand+T')})`}
      data-testid="SqlEditorWidget_newQuery"
    >
      <FontIcon icon="icon plus" />
    </button>
  </div>

  <WidgetColumnBar storageName="sqlEditorWidget">
    <WidgetColumnBarItem
      title={_t('sqlEditor.savedQueries', { defaultMessage: 'Saved queries' })}
      name="savedQueries"
      height="45%"
    >
      <WidgetsInnerContainer>
        {#if ($sqlFiles || []).length == 0}
          <div class="empty">
            <FontIcon icon="icon sql-editor" />
            <div class="empty-title">{_t('sqlEditor.noSavedQueries', { defaultMessage: 'No saved queries yet' })}</div>
            <div class="empty-hint">
              {_t('sqlEditor.noSavedQueriesHint', {
                defaultMessage: 'Write a query and press {shortcut} to keep it here.',
                values: { shortcut: formatKeyText('CtrlOrCommand+S') },
              })}
            </div>
          </div>
        {:else}
          <AppObjectList list={$sqlFiles} module={savedFileAppObject} {filter} />
        {/if}
      </WidgetsInnerContainer>
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

  .search-row {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: 6px 6px 2px 10px;
    flex-shrink: 0;
  }
  .search-row :global(.search-box-wrapper) {
    border-radius: 7px;
    min-height: 28px;
  }
  .row-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-inlinebutton-foreground);
    font-size: 16px;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .row-button:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-inlinebutton-foreground-hover);
  }
  .row-button:active {
    transform: scale(0.94);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 24px 16px;
    text-align: center;
    color: var(--theme-generic-font-grayed);
    font-size: 12px;
  }
  .empty :global(.mdi) {
    font-size: 22px;
  }
  .empty-title {
    color: var(--theme-generic-font);
    font-weight: 500;
    font-size: 13px;
  }
</style>
