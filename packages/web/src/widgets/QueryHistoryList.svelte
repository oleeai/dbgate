<script lang="ts" context="module">
  import { get } from 'svelte/store';
  import { writableWithStorage } from '../stores';

  // scope: mine | everyone; database: all | current | JSON [conid, database]
  const historySettings = writableWithStorage({ scope: 'mine', database: 'all' }, 'queryHistorySettings');

  const PAGE_SIZE = 100;

  const SQL_KEYWORDS =
    'select|from|where|and|or|not|in|is|null|as|on|join|left|right|inner|outer|full|cross|group|by|order|having|' +
    'limit|offset|insert|into|values|update|set|delete|create|alter|drop|table|view|index|with|union|all|' +
    'distinct|case|when|then|else|end|asc|desc|like|ilike|between|exists|returning|begin|commit|rollback|truncate';
  const SQL_TOKEN_REGEX = new RegExp(
    `(--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|'(?:[^']|'')*'?|\\b(?:${SQL_KEYWORDS})\\b|\\b\\d+(?:\\.\\d+)?\\b)`,
    'gi'
  );

  // a light highlight for the preview - keywords, strings, numbers and comments
  function tokenizeSql(sql: string) {
    return sql.split(SQL_TOKEN_REGEX).map((text, index) => {
      if (index % 2 == 0) return { text, kind: '' };
      if (text.startsWith('--') || text.startsWith('/*')) return { text, kind: 'comment' };
      if (text.startsWith("'")) return { text, kind: 'string' };
      if (/^\d/.test(text)) return { text, kind: 'number' };
      return { text, kind: 'keyword' };
    });
  }
</script>

<script lang="ts">
  import _ from 'lodash';
  import moment from 'moment';
  import { onMount } from 'svelte';
  import CloseSearchButton from '../buttons/CloseSearchButton.svelte';
  import SearchBoxWrapper from '../elements/SearchBoxWrapper.svelte';
  import SearchInput from '../elements/SearchInput.svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import SaveFileModal from '../modals/SaveFileModal.svelte';
  import { showModal } from '../modals/modalTools';
  import runQueryInTab from '../query/runQueryInTab';
  import { currentDatabase, currentDropDownMenu } from '../stores';
  import { _t } from '../translations';
  import { apiCall, apiOff, apiOn } from '../utility/api';
  import { copyTextToClipboard } from '../utility/clipboard';
  import contextMenu from '../utility/contextMenu';
  import hasPermission from '../utility/hasPermission';
  import { getConnectionInfo, useConfig, useConnectionList } from '../utility/metadataLoaders';
  import openNewTab from '../utility/openNewTab';
  import {
    formatDateTime,
    formatDay,
    formatDuration,
    formatRowCount,
    getConnectionName,
    getSqlPreview,
  } from '../utility/queryPanelTools';
  import { showSnackbarSuccess } from '../utility/snackbar';
  import { trackUsage } from '../utility/usageAnalytics';
  import UserAvatar from './UserAvatar.svelte';
  import WidgetsInnerContainer from './WidgetsInnerContainer.svelte';

  const config = useConfig();
  const connections = useConnectionList();

  let filter = '';
  let search = '';
  let limit = PAGE_SIZE;
  let historyItems = [];
  let loaded = false;
  let loadNumber = 0;

  // the user the API saw on our requests - without one (local use) there is no "mine"
  $: requestUser = $config?.requestUser;
  $: onlyMine = !!requestUser && $historySettings.scope == 'mine';
  $: dbFilter = getDbFilter($historySettings.database, $currentDatabase);
  $: queryKey = JSON.stringify({ search, limit, onlyMine, ...dbFilter });
  $: if (queryKey) reloadItems();

  function getDbFilter(value, current) {
    if (value == 'current') {
      const conid = current?.connection?._id;
      return conid ? { conid, database: current.name } : {};
    }
    if (value?.startsWith('[')) {
      try {
        const [conid, database] = JSON.parse(value);
        return { conid, database };
      } catch {
        return {};
      }
    }
    return {};
  }

  async function reloadItems() {
    const number = ++loadNumber;
    const resp = await apiCall('query-history/read', { filter: search, limit, onlyMine, ...dbFilter });
    if (number != loadNumber) return;
    historyItems = _.isArray(resp) ? resp : [];
    loaded = true;
  }

  const setDebouncedSearch = _.debounce(value => {
    search = value;
    limit = PAGE_SIZE;
  }, 300);
  $: setDebouncedSearch(filter);

  onMount(() => {
    apiOn('query-history-changed', reloadItems);
    return () => {
      apiOff('query-history-changed', reloadItems);
    };
  });

  $: rows = historyItems.map((item, index) => ({
    item,
    day: index == 0 || formatDay(historyItems[index - 1].date) != formatDay(item.date) ? formatDay(item.date) : null,
  }));

  function setSetting(name, value) {
    historySettings.update(x => ({ ...x, [name]: value }));
    limit = PAGE_SIZE;
  }

  /** The executed SQL is never sent, only that a history item was opened. */
  async function trackHistoryOpen(item, action) {
    let engine;
    try {
      engine = (await getConnectionInfo({ conid: item.conid }))?.engine;
    } catch {
      // Analytics must not depend on metadata loading.
    }
    trackUsage({ feature: 'query_history', action, engine });
  }

  // the entry's database while its connection still exists, else the current one
  function getTarget(item) {
    if (item.conid && ($connections || []).find(x => x._id == item.conid)) {
      return { conid: item.conid, database: item.database };
    }
    const conid = $currentDatabase?.connection?._id;
    return conid ? { conid, database: $currentDatabase.name } : {};
  }

  function openItem(item, run = false) {
    trackHistoryOpen(item, run ? 'run' : 'open');
    const tab = {
      title: _t('database.queryDesigner', { defaultMessage: 'Query #' }),
      icon: 'img sql-file',
      tabComponent: 'QueryTab',
      focused: true,
      props: getTarget(item),
    };
    if (run) runQueryInTab(tab, { editor: item.sql });
    else openNewTab(tab, { editor: item.sql });
  }

  function copyItem(item) {
    copyTextToClipboard(item.sql);
    showSnackbarSuccess(_t('queryHistory.copied', { defaultMessage: 'Query copied' }));
  }

  function suggestName(sql) {
    const table = (sql || '').match(/\b(?:from|into|update|table)\s+["`[]?([\w.]+)/i)?.[1];
    return table
      ? _t('queryHistory.tableQueryName', { defaultMessage: '{table} query', values: { table: table.split('.').pop() } })
      : _t('queryHistory.newQueryName', { defaultMessage: 'New query' });
  }

  function saveItem(item) {
    const target = getTarget(item);
    showModal(SaveFileModal, {
      data: item.sql,
      folder: 'sql',
      format: 'text',
      fileExtension: 'sql',
      name: suggestName(item.sql),
      conid: target.conid,
      database: target.database,
      onSave: name =>
        showSnackbarSuccess(_t('queryHistory.savedAs', { defaultMessage: 'Saved as "{name}"', values: { name } })),
    });
  }

  function createItemMenu(item) {
    return [
      { text: _t('queryHistory.openInEditor', { defaultMessage: 'Open in editor' }), onClick: () => openItem(item) },
      { text: _t('queryHistory.run', { defaultMessage: 'Run' }), onClick: () => openItem(item, true) },
      { text: _t('queryHistory.copy', { defaultMessage: 'Copy query' }), onClick: () => copyItem(item) },
      hasPermission('files/sql/write') && {
        text: _t('queryHistory.saveAsQuery', { defaultMessage: 'Save as query…' }),
        onClick: () => saveItem(item),
      },
      item.conid && item.database && { divider: true },
      item.conid &&
        item.database && {
          text: _t('queryHistory.onlyOn', {
            defaultMessage: 'Only queries on {database}',
            values: { database: item.database },
          }),
          onClick: () => setSetting('database', databaseKey(item.conid, item.database)),
        },
    ];
  }

  function databaseKey(conid, database) {
    return JSON.stringify([conid, database]);
  }

  // all, the current database, then the databases of the listed entries
  function showDatabaseMenu(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const currentDbName = $currentDatabase?.name;
    const listed = _.uniqBy(
      historyItems.filter(x => x.conid && x.database),
      x => databaseKey(x.conid, x.database)
    ).slice(0, 10);
    const option = (value, text) => ({
      text,
      switchOption: 'database',
      switchOptionValue: value,
      switchStore: historySettings,
      switchStoreGetter: () => get(historySettings),
      closeOnSwitchClick: true,
      onClick: () => (limit = PAGE_SIZE),
    });
    currentDropDownMenu.set({
      left: rect.left,
      top: rect.bottom,
      items: [
        option('all', _t('queryHistory.allDatabases', { defaultMessage: 'All databases' })),
        currentDbName &&
          option(
            'current',
            _t('queryHistory.currentDatabase', {
              defaultMessage: 'Current database ({database})',
              values: { database: currentDbName },
            })
          ),
        listed.length > 0 && { divider: true },
        ...listed.map(x =>
          option(
            databaseKey(x.conid, x.database),
            `${x.database} · ${getConnectionName($connections, x.conid) ?? x.conid}`
          )
        ),
      ],
    });
  }

  $: databaseLabel =
    $historySettings.database == 'current' || $historySettings.database?.startsWith('[') ? dbFilter.database : null;

  function formatTime(time) {
    const minutes = (Date.now() - time) / 60000;
    if (minutes < 1) return _t('queryPanel.justNow', { defaultMessage: 'now' });
    if (minutes < 60) {
      return _t('queryPanel.minutesAgo', { defaultMessage: '{n}m', values: { n: Math.floor(minutes) } });
    }
    return moment(time).format('HH:mm');
  }

  function getTooltip(item) {
    return _.compact([
      getSqlPreview(item.sql).substring(0, 1000),
      item.database && `\n${item.database} · ${getConnectionName($connections, item.conid) ?? item.conid}`,
      formatDateTime(item.date),
      item.user &&
        _t('queryHistory.runBy', {
          defaultMessage: 'Run by {user}',
          values: { user: item.userName ? `${item.userName} (${item.user})` : item.user },
        }),
    ]).join('\n');
  }

  function handleRowKeyDown(e, item) {
    if (e.target != e.currentTarget) return;
    if (e.key == 'Enter') openItem(item, e.metaKey || e.ctrlKey);
  }
</script>

<div class="toolbar">
  {#if requestUser}
    <div class="scope-row">
      <div class="segmented" role="tablist" data-testid="QueryHistoryList_scope">
        <button
          class="segment"
          class:selected={onlyMine}
          role="tab"
          aria-selected={onlyMine}
          on:click={() => setSetting('scope', 'mine')}
          data-testid="QueryHistoryList_mine">{_t('queryHistory.mine', { defaultMessage: 'Mine' })}</button
        >
        <button
          class="segment"
          class:selected={!onlyMine}
          role="tab"
          aria-selected={!onlyMine}
          on:click={() => setSetting('scope', 'everyone')}
          data-testid="QueryHistoryList_everyone">{_t('queryHistory.everyone', { defaultMessage: 'Everyone' })}</button
        >
      </div>
      <span
        class="signed-in"
        title={_t('queryHistory.signedInAs', {
          defaultMessage: 'Signed in as {user}',
          values: { user: requestUser.name ? `${requestUser.name} (${requestUser.login})` : requestUser.login },
        })}
        data-testid="QueryHistoryList_signedIn"
      >
        <UserAvatar login={requestUser.login} name={requestUser.name} size={16} />
        <span class="signed-in-name">{requestUser.login}</span>
      </span>
    </div>
  {/if}
  <div class="search-row">
    <SearchBoxWrapper {filter} noMargin fillFlex>
      <SearchInput
        placeholder={_t('history.searchQueryHistory', { defaultMessage: 'Search query history' })}
        bind:value={filter}
        data-testid="QueryHistoryList_search"
      />
      <CloseSearchButton
        bind:filter
        on:click={() => {
          search = '';
        }}
      />
    </SearchBoxWrapper>
    <button
      class="square-button"
      class:active={!!databaseLabel}
      on:click={showDatabaseMenu}
      title={databaseLabel
        ? _t('queryHistory.onlyOn', { defaultMessage: 'Only queries on {database}', values: { database: databaseLabel } })
        : _t('queryHistory.filterByDatabase', { defaultMessage: 'Filter by database' })}
      data-testid="QueryHistoryList_databaseFilter"
    >
      <FontIcon icon="icon database" />
    </button>
  </div>
  {#if databaseLabel}
    <div class="filter-chip-row">
      <span class="filter-chip" data-testid="QueryHistoryList_databaseChip">
        <FontIcon icon="icon database" />
        <span class="filter-chip-label">{databaseLabel}</span>
        <button
          class="filter-chip-clear"
          title={_t('queryHistory.allDatabases', { defaultMessage: 'All databases' })}
          on:click={() => setSetting('database', 'all')}><FontIcon icon="icon close" /></button
        >
      </span>
    </div>
  {/if}
</div>

<WidgetsInnerContainer>
  {#if loaded && historyItems.length == 0}
    <div class="empty">
      <FontIcon icon="icon history" />
      {#if search || databaseLabel}
        <div class="empty-hint">{_t('queryHistory.noMatch', { defaultMessage: 'No query matches' })}</div>
      {:else if onlyMine}
        <div class="empty-title">{_t('queryHistory.noOwnQueries', { defaultMessage: 'No queries run yet' })}</div>
        <div class="empty-hint">
          {_t('queryHistory.noOwnQueriesHint', {
            defaultMessage: 'Queries you run show up here. Switch to Everyone to see the whole team.',
          })}
        </div>
      {:else}
        <div class="empty-title">{_t('queryHistory.empty', { defaultMessage: 'No queries run yet' })}</div>
      {/if}
    </div>
  {:else}
    <div class="list" data-testid="QueryHistoryList_list">
      {#each rows as { item, day }}
        {@const isMine = !!requestUser && item.user == requestUser.login}
        {#if day}
          <div class="day">{day}</div>
        {/if}
        <div
          class="entry"
          role="button"
          tabindex="0"
          title={getTooltip(item)}
          on:click={() => openItem(item)}
          on:keydown={e => handleRowKeyDown(e, item)}
          use:contextMenu={createItemMenu(item)}
          data-testid="QueryHistoryList_item"
        >
          <div class="sql">
            {#each tokenizeSql(getSqlPreview(item.sql).substring(0, 400)) as token}{#if token.kind}<span
                  class={token.kind}>{token.text}</span
                >{:else}{token.text}{/if}{/each}
          </div>
          <div class="meta">
            {#if item.database}
              <span class="meta-db"><FontIcon icon="icon database" />{item.database}</span>
            {/if}
            {#if item.user && !onlyMine}
              <span class="meta-user" class:mine={isMine}>
                <UserAvatar login={item.user} name={item.userName} size={13} />
                {isMine ? _t('queryHistory.you', { defaultMessage: 'you' }) : item.user}
              </span>
            {/if}
            <span class="meta-fixed">{formatTime(item.date)}</span>
            {#if item.durationMs != null}
              <span class="meta-fixed">{formatDuration(item.durationMs)}</span>
            {/if}
            {#if item.failed}
              <span class="meta-fixed failed"
                ><FontIcon icon="icon error" />{_t('queryHistory.failed', { defaultMessage: 'Failed' })}</span
              >
            {:else if item.rowCount != null}
              <span class="meta-fixed">{formatRowCount(item.rowCount)}</span>
            {/if}
            <span class="actions">
              {#if hasPermission('files/sql/write')}
                <button
                  class="action"
                  title={_t('queryHistory.saveAsQuery', { defaultMessage: 'Save as query…' })}
                  on:click|stopPropagation={() => saveItem(item)}
                  data-testid="QueryHistoryList_save"
                >
                  <FontIcon icon="mdi mdi-bookmark-plus-outline" />
                </button>
              {/if}
              <button
                class="action"
                title={_t('queryHistory.copy', { defaultMessage: 'Copy query' })}
                on:click|stopPropagation={() => copyItem(item)}
                data-testid="QueryHistoryList_copy"
              >
                <FontIcon icon="icon copy" />
              </button>
              <button
                class="action run"
                title={_t('queryHistory.run', { defaultMessage: 'Run' })}
                on:click|stopPropagation={() => openItem(item, true)}
                data-testid="QueryHistoryList_run"
              >
                <FontIcon icon="icon play" />
              </button>
            </span>
          </div>
        </div>
      {/each}
      {#if historyItems.length >= limit}
        <button class="more" on:click={() => (limit += PAGE_SIZE)} data-testid="QueryHistoryList_more">
          {_t('queryHistory.showMore', { defaultMessage: 'Show more' })}
        </button>
      {/if}
    </div>
  {/if}
</WidgetsInnerContainer>

<style>
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 10px 4px;
    flex-shrink: 0;
  }

  .scope-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .segmented {
    flex: 1;
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-md);
  }
  .segment {
    flex: 1;
    height: 22px;
    padding: 0 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .segment:hover:not(.selected) {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .segment.selected {
    background: var(--theme-ui-accent-soft);
    color: var(--theme-ui-accent-strong);
    font-weight: 600;
  }
  .segment:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }
  .signed-in {
    min-width: 0;
    max-width: 45%;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--theme-ui-text-tertiary);
    cursor: default;
  }
  .signed-in-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .search-row :global(.search-box-wrapper) {
    min-width: 0;
    height: 28px;
    border-radius: var(--dim-radius-md);
    border: 1px solid var(--theme-ui-border);
    background-color: transparent;
  }
  .search-row :global(.search-box-wrapper.hasFilter) {
    background-color: var(--theme-searchbox-background-filtered);
  }
  .square-button {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-md);
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font-size: 15px;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast);
  }
  .square-button:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .square-button.active {
    border-color: var(--theme-ui-accent);
    color: var(--theme-ui-accent-strong);
  }

  .filter-chip-row {
    display: flex;
  }
  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    height: 22px;
    padding: 0 2px 0 8px;
    border-radius: 11px;
    background: var(--theme-ui-accent-soft);
    color: var(--theme-ui-accent-strong);
    font-size: 11.5px;
    font-weight: 500;
  }
  .filter-chip-label {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .filter-chip-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .filter-chip-clear:hover {
    background: var(--theme-ui-accent-soft);
  }

  .list {
    padding: 0 0 8px;
  }

  .day {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 8px 18px 3px;
    background: var(--theme-sidebar-background);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--theme-ui-text-secondary);
  }

  .entry {
    margin: 0 8px 1px;
    padding: 6px 8px 5px;
    border-radius: var(--dim-radius-sm);
    cursor: pointer;
    transition: background-color 80ms ease;
  }
  .entry:hover {
    background: var(--theme-sidebar-background-hover);
  }
  .entry:focus-visible {
    outline: none;
    background: var(--theme-sidebar-background-focused);
  }

  .sql {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, 'JetBrains Mono', Consolas, monospace;
    font-size: 11.5px;
    line-height: 16px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--theme-sidebar-foreground);
  }
  .sql .keyword {
    color: var(--token-keyword);
  }
  .sql .string {
    color: var(--token-string);
  }
  .sql .number {
    color: var(--token-number);
  }
  .sql .comment {
    color: var(--token-comment);
  }

  .meta {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    height: 20px;
    margin-top: 3px;
    font-size: 11.5px;
    color: var(--theme-ui-text-tertiary);
    white-space: nowrap;
  }
  .meta > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .meta > span:not(.actions) + span:not(.actions)::before {
    content: '·';
    margin-right: 1px;
  }
  .meta-db,
  .meta-user {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta-db :global(.mdi) {
    font-size: 12px;
  }
  .meta-user.mine {
    color: var(--theme-ui-text-secondary);
  }
  .meta-fixed {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .meta-fixed.failed {
    color: var(--theme-generic-font-error);
  }

  /* over the end of the meta line, so hovering never squeezes it - the background is the hovered
     row's (the translucent hover color over the sidebar) and fades in from the left */
  .meta > .actions {
    display: none;
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    align-items: center;
    gap: 2px;
    padding-left: 16px;
    background:
      linear-gradient(var(--theme-sidebar-background-hover), var(--theme-sidebar-background-hover)),
      var(--theme-sidebar-background);
    -webkit-mask-image: linear-gradient(to right, transparent, #000 14px);
    mask-image: linear-gradient(to right, transparent, #000 14px);
  }
  .entry:hover .meta > .actions,
  .entry:focus-within .meta > .actions {
    display: inline-flex;
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--theme-sidebar-foreground-button);
    font-size: 14px;
    cursor: pointer;
  }
  .action:hover {
    background: var(--theme-ui-active);
    color: var(--theme-sidebar-foreground);
  }
  .action.run {
    color: var(--theme-ui-accent-strong);
    font-size: 15px;
  }

  .more {
    display: block;
    margin: 6px auto 0;
    padding: 4px 12px;
    border: 1px solid var(--theme-ui-border);
    border-radius: 12px;
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .more:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
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
