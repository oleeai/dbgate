<script lang="ts" context="module">
  import { get } from 'svelte/store';
  import { writableWithStorage } from '../stores';

  const savedQueriesSettings = writableWithStorage(
    { sortBy: 'name', onlyCurrentDatabase: false },
    'savedQueriesSettings'
  );
</script>

<script lang="ts">
  import _ from 'lodash';
  import yaml from 'js-yaml';
  import { filterName, getSqlFrontMatter } from 'dbgate-tools';
  import CloseSearchButton from '../buttons/CloseSearchButton.svelte';
  import DropDownButton from '../buttons/DropDownButton.svelte';
  import SearchBoxWrapper from '../elements/SearchBoxWrapper.svelte';
  import SearchInput from '../elements/SearchInput.svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import ConfirmModal from '../modals/ConfirmModal.svelte';
  import InputTextModal from '../modals/InputTextModal.svelte';
  import { showModal } from '../modals/modalTools';
  import runQueryInTab from '../query/runQueryInTab';
  import { currentDatabase, currentDropDownMenu } from '../stores';
  import { _t } from '../translations';
  import { apiCall } from '../utility/api';
  import { formatKeyText } from '../utility/common';
  import contextMenu from '../utility/contextMenu';
  import hasPermission from '../utility/hasPermission';
  import { useConnectionList, useFiles } from '../utility/metadataLoaders';
  import openNewTab from '../utility/openNewTab';
  import { formatAgo, formatDateTime, getConnectionName } from '../utility/queryPanelTools';
  import { trackUsage } from '../utility/usageAnalytics';
  import UserAvatar from './UserAvatar.svelte';
  import WidgetsInnerContainer from './WidgetsInnerContainer.svelte';

  const files = useFiles({ folder: 'sql', parseFrontMatter: true, withMeta: true });
  const connections = useConnectionList();

  let filter = '';
  let collapsedGroups = {};

  $: currentConid = $currentDatabase?.connection?._id;
  $: currentDbName = $currentDatabase?.name;
  $: canWrite = hasPermission('files/sql/write');

  // A query pinned to a database in its front matter opens there; otherwise the database it was
  // saved for (savedFilesMeta in the API), which older files don't have
  function toItem(file) {
    const meta = file.fileMeta || {};
    const pinned = !!file.connectionId;
    return {
      file: file.file,
      conid: pinned ? file.connectionId : meta.conid,
      database: pinned ? file.databaseName : meta.database,
      group: meta.group || '',
      updatedBy: meta.updatedBy,
      updatedByName: meta.updatedByName,
      updatedAt: meta.updatedAt || file.modifiedAt,
    };
  }

  $: allItems = ($files || []).map(toItem);
  $: groupNames = _.sortBy(_.uniq(allItems.map(x => x.group).filter(x => x)), x => x.toLowerCase());
  $: visibleItems = _.orderBy(
    allItems.filter(
      item =>
        filterName(
          filter,
          item.file,
          item.group,
          item.database,
          item.updatedBy,
          item.updatedByName,
          getConnectionName($connections, item.conid)
        ) &&
        (!$savedQueriesSettings.onlyCurrentDatabase ||
          (item.conid == currentConid && item.database == currentDbName))
    ),
    $savedQueriesSettings.sortBy == 'edited' ? [x => x.updatedAt || 0] : [x => x.file.toLowerCase()],
    [$savedQueriesSettings.sortBy == 'edited' ? 'desc' : 'asc']
  );
  // folders first, then the queries in no folder
  $: groups = [
    ...groupNames
      .map(name => ({ name, items: visibleItems.filter(x => x.group == name) }))
      .filter(x => x.items.length > 0),
    { name: '', items: visibleItems.filter(x => !x.group) },
  ];

  function getTarget(item) {
    if (item.conid && item.database && ($connections || []).find(x => x._id == item.conid)) {
      return { conid: item.conid, database: item.database };
    }
    return currentConid ? { conid: currentConid, database: currentDbName } : null;
  }

  async function openQuery(item, run = false) {
    trackUsage({ feature: 'saved_file', action: run ? 'run' : 'open', param: 'sql' });
    const content = await apiCall('files/load', { folder: 'sql', file: item.file, format: 'text' });
    if (typeof content != 'string') return;
    const frontMatter = getSqlFrontMatter(content, yaml);
    const target = frontMatter?.connectionId
      ? { conid: frontMatter.connectionId, database: frontMatter.databaseName }
      : getTarget(item);
    const tab = {
      title: item.file,
      icon: 'img sql-file',
      tabComponent: 'QueryTab',
      tooltip: target ? `${getConnectionName($connections, target.conid) ?? ''}\n${target.database ?? ''}` : undefined,
      focused: true,
      props: {
        savedFile: item.file,
        savedFolder: 'sql',
        savedFormat: 'text',
        ...(target ? { conid: target.conid, database: target.database } : {}),
      },
    };
    if (run) await runQueryInTab(tab, { editor: content });
    else await openNewTab(tab, { editor: content });
  }

  function handleRename(item) {
    showModal(InputTextModal, {
      value: item.file,
      label: _t('savedQueries.newName', { defaultMessage: 'New name' }),
      header: _t('savedQueries.renameQuery', { defaultMessage: 'Rename query' }),
      onConfirm: newFile => {
        if (newFile && newFile != item.file) apiCall('files/rename', { folder: 'sql', file: item.file, newFile });
      },
    });
  }

  function handleDuplicate(item) {
    showModal(InputTextModal, {
      value: _t('savedQueries.copyName', { defaultMessage: '{name} copy', values: { name: item.file } }),
      label: _t('savedQueries.newName', { defaultMessage: 'New name' }),
      header: _t('savedQueries.duplicateQuery', { defaultMessage: 'Duplicate query' }),
      onConfirm: newFile => {
        if (newFile && newFile != item.file) apiCall('files/copy', { folder: 'sql', file: item.file, newFile });
      },
    });
  }

  function handleDelete(item) {
    showModal(ConfirmModal, {
      header: _t('savedQueries.deleteQuery', { defaultMessage: 'Delete query' }),
      message: _t('savedQueries.reallyDelete', {
        defaultMessage: 'Delete "{name}"? It is removed for everyone on the team.',
        values: { name: item.file },
      }),
      confirmLabel: _t('common.delete', { defaultMessage: 'Delete' }),
      onConfirm: () => apiCall('files/delete', { folder: 'sql', file: item.file }),
    });
  }

  function setGroup(item, group) {
    apiCall('files/set-group', { folder: 'sql', file: item.file, group });
  }

  function handleNewFolder(item) {
    showModal(InputTextModal, {
      value: '',
      label: _t('savedQueries.folderName', { defaultMessage: 'Folder name' }),
      header: _t('savedQueries.moveToNewFolder', { defaultMessage: 'Move to a new folder' }),
      onConfirm: group => group?.trim() && setGroup(item, group.trim()),
    });
  }

  function createMenu(item) {
    return [
      { text: _t('savedQueries.open', { defaultMessage: 'Open' }), onClick: () => openQuery(item) },
      { text: _t('savedQueries.run', { defaultMessage: 'Run' }), onClick: () => openQuery(item, true) },
      canWrite && { divider: true },
      canWrite && { text: _t('savedQueries.rename', { defaultMessage: 'Rename…' }), onClick: () => handleRename(item) },
      canWrite && {
        text: _t('savedQueries.duplicate', { defaultMessage: 'Duplicate…' }),
        onClick: () => handleDuplicate(item),
      },
      canWrite && {
        text: _t('savedQueries.moveToFolder', { defaultMessage: 'Move to folder' }),
        submenu: [
          ...groupNames
            .filter(name => name != item.group)
            .map(name => ({ text: name, onClick: () => setGroup(item, name) })),
          groupNames.some(name => name != item.group) && { divider: true },
          {
            text: _t('savedQueries.newFolder', { defaultMessage: 'New folder…' }),
            onClick: () => handleNewFolder(item),
          },
          item.group && {
            text: _t('savedQueries.removeFromFolder', { defaultMessage: 'Remove from folder' }),
            onClick: () => setGroup(item, ''),
          },
        ],
      },
      canWrite && { divider: true },
      canWrite && { text: _t('savedQueries.delete', { defaultMessage: 'Delete…' }), onClick: () => handleDelete(item) },
    ];
  }

  function showMenu(e, item) {
    const rect = e.currentTarget.getBoundingClientRect();
    currentDropDownMenu.set({ left: rect.left, top: rect.bottom, items: createMenu(item) });
  }

  function createSettingsMenu() {
    return [
      { label: _t('savedQueries.sortBy', { defaultMessage: 'Sort by:' }), isBold: true, disabled: true },
      {
        label: _t('savedQueries.sortByName', { defaultMessage: 'Name' }),
        switchOption: 'sortBy',
        switchOptionValue: 'name',
        switchOptionIsDefault: true,
        closeOnSwitchClick: true,
      },
      {
        label: _t('savedQueries.sortByEdited', { defaultMessage: 'Last edited' }),
        switchOption: 'sortBy',
        switchOptionValue: 'edited',
        closeOnSwitchClick: true,
      },
      { label: _t('savedQueries.show', { defaultMessage: 'Show:' }), isBold: true, disabled: true },
      {
        label: _t('savedQueries.onlyCurrentDatabase', { defaultMessage: 'Only queries for the current database' }),
        switchValue: 'onlyCurrentDatabase',
      },
    ].map(item => ({
      ...item,
      switchStore: savedQueriesSettings,
      switchStoreGetter: () => get(savedQueriesSettings),
    }));
  }

  function getTooltip(item) {
    return _.compact([
      item.file,
      item.database &&
        _t('savedQueries.savedFor', {
          defaultMessage: 'Saved for {database} on {connection}',
          values: { database: item.database, connection: getConnectionName($connections, item.conid) ?? item.conid },
        }),
      item.updatedAt &&
        (item.updatedBy
          ? _t('savedQueries.lastEditedBy', {
              defaultMessage: 'Last edited by {user}, {time}',
              values: { user: item.updatedByName || item.updatedBy, time: formatDateTime(item.updatedAt) },
            })
          : _t('savedQueries.lastEdited', {
              defaultMessage: 'Last edited {time}',
              values: { time: formatDateTime(item.updatedAt) },
            })),
    ]).join('\n');
  }

  function handleRowKeyDown(e, item) {
    if (e.target != e.currentTarget) return;
    if (e.key == 'Enter') openQuery(item, e.metaKey || e.ctrlKey);
  }
</script>

<div class="toolbar">
  <div class="search-row">
    <SearchBoxWrapper {filter} noMargin fillFlex>
      <SearchInput
        placeholder={_t('savedQueries.search', { defaultMessage: 'Search saved queries...' })}
        bind:value={filter}
        data-testid="SavedQueriesList_search"
      />
      <CloseSearchButton bind:filter />
    </SearchBoxWrapper>
    <span
      class="square-button"
      class:active={$savedQueriesSettings.onlyCurrentDatabase || $savedQueriesSettings.sortBy == 'edited'}
    >
      <DropDownButton
        icon="icon filter-variant"
        menu={createSettingsMenu}
        title={_t('savedQueries.sortAndFilter', { defaultMessage: 'Sort and filter' })}
        data-testid="SavedQueriesList_settings"
      />
    </span>
  </div>
</div>

<WidgetsInnerContainer>
  {#if allItems.length == 0}
    <div class="empty">
      <FontIcon icon="icon sql-editor" />
      <div class="empty-title">{_t('sqlEditor.noSavedQueries', { defaultMessage: 'No saved queries yet' })}</div>
      <div class="empty-hint">
        {_t('savedQueries.emptyHint', {
          defaultMessage: 'Write a query and press {shortcut}. Saved queries are shared with the whole team.',
          values: { shortcut: formatKeyText('CtrlOrCommand+S') },
        })}
      </div>
    </div>
  {:else if visibleItems.length == 0}
    <div class="empty">
      <div class="empty-hint">{_t('savedQueries.noMatch', { defaultMessage: 'No saved query matches' })}</div>
    </div>
  {:else}
    <div class="list" data-testid="SavedQueriesList_list">
      {#each groups as group (group.name)}
        {@const isCollapsed = !filter && !!collapsedGroups[group.name]}
        {#if group.name}
          <button
            class="group"
            on:click={() => (collapsedGroups = { ...collapsedGroups, [group.name]: !collapsedGroups[group.name] })}
            data-testid="SavedQueriesList_group"
          >
            <span class="group-chevron" class:collapsed={isCollapsed}><FontIcon icon="icon chevron-down" /></span>
            <FontIcon icon={isCollapsed ? 'mdi mdi-folder-outline' : 'mdi mdi-folder-open-outline'} />
            <span class="group-name">{group.name}</span>
            <span class="group-count">{group.items.length}</span>
          </button>
        {/if}
        {#if !isCollapsed}
          {#each group.items as item (item.file)}
            <div
              class="row"
              class:nested={!!group.name}
              role="button"
              tabindex="0"
              title={getTooltip(item)}
              on:click={() => openQuery(item)}
              on:keydown={e => handleRowKeyDown(e, item)}
              use:contextMenu={createMenu(item)}
              data-testid="SavedQueriesList_item"
            >
              <span class="row-icon"><FontIcon icon="mdi mdi-file-code-outline" /></span>
              <div class="row-text">
                <div class="row-title">
                  <span class="row-name">{item.file}</span>
                  <span class="row-actions">
                    <button
                      class="action"
                      title={_t('savedQueries.run', { defaultMessage: 'Run' })}
                      on:click|stopPropagation={() => openQuery(item, true)}
                      data-testid="SavedQueriesList_run"
                    >
                      <FontIcon icon="icon play" />
                    </button>
                    <button
                      class="action"
                      title={_t('savedQueries.actions', { defaultMessage: 'Actions' })}
                      on:click|stopPropagation={e => showMenu(e, item)}
                      data-testid="SavedQueriesList_menu"
                    >
                      <FontIcon icon="icon dots-horizontal" />
                    </button>
                  </span>
                </div>
                <div class="row-meta">
                  {#if item.database}
                    <span class="meta-db"><FontIcon icon="icon database" />{item.database}</span>
                  {/if}
                  {#if item.updatedBy}
                    <span class="meta-user">
                      <UserAvatar login={item.updatedBy} name={item.updatedByName} size={13} />
                      {item.updatedBy}
                    </span>
                  {/if}
                  {#if item.updatedAt}
                    <span class="meta-time">{formatAgo(item.updatedAt)}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      {/each}
    </div>
  {/if}
</WidgetsInnerContainer>

<style>
  .toolbar {
    padding: 6px 10px 4px;
    flex-shrink: 0;
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
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-md);
    color: var(--theme-generic-font-grayed);
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast);
  }
  .square-button :global(.outer) {
    width: 100%;
    height: 100%;
    padding: 0;
    align-items: center;
    color: inherit;
  }
  .square-button:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .square-button.active {
    border-color: var(--theme-ui-accent);
    color: var(--theme-ui-accent-strong);
  }

  .list {
    padding: 2px 0 8px;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 5px;
    width: calc(100% - 16px);
    margin: 4px 8px 1px;
    padding: 3px 8px 3px 2px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .group:hover {
    background: var(--theme-sidebar-background-hover);
  }
  .group :global(.mdi-folder-outline),
  .group :global(.mdi-folder-open-outline) {
    color: var(--theme-ui-accent-strong);
    font-size: 14px;
  }
  .group-chevron {
    display: flex;
    font-size: 13px;
    color: var(--theme-generic-font-grayed);
    transition: transform var(--dim-transition-fast);
  }
  .group-chevron.collapsed {
    transform: rotate(-90deg);
  }
  .group-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .group-count {
    font-weight: 400;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--theme-generic-font-grayed);
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0 8px;
    padding: 5px 6px 5px 8px;
    border-radius: var(--dim-radius-sm);
    cursor: pointer;
    transition: background-color 80ms ease;
  }
  .row.nested {
    padding-left: 22px;
  }
  .row:hover {
    background: var(--theme-sidebar-background-hover);
  }
  .row:focus-visible {
    outline: none;
    background: var(--theme-sidebar-background-focused);
  }
  .row-icon {
    flex-shrink: 0;
    display: flex;
    font-size: 16px;
    line-height: 20px;
    color: var(--theme-ui-accent-strong);
  }
  .row-text {
    flex: 1;
    min-width: 0;
  }
  .row-title {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 20px;
  }
  .row-name {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    color: var(--theme-sidebar-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-actions {
    display: none;
    flex-shrink: 0;
    gap: 2px;
  }
  .row:hover .row-actions,
  .row:focus-within .row-actions {
    display: flex;
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
    font-size: 15px;
    cursor: pointer;
  }
  .action:hover {
    background: var(--theme-ui-active);
    color: var(--theme-sidebar-foreground);
  }
  .action:first-child :global(.mdi-play) {
    color: var(--theme-ui-accent-strong);
  }

  .row-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    font-size: 11.5px;
    line-height: 16px;
    color: var(--theme-ui-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
  }
  .row-meta > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .row-meta > span + span::before {
    content: '·';
    margin-right: 1px;
  }
  .meta-db {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta-db :global(.mdi) {
    font-size: 12px;
  }
  .meta-user {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta-time {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
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
