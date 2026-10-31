<script lang="ts">
  import _ from 'lodash';
  import { tick } from 'svelte';
  import { extractDbNameFromComposite, filterName, getConnectionLabel } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import EngineLogo from '../icons/EngineLogo.svelte';
  import ConnectionSwitcherDatabases from './ConnectionSwitcherDatabases.svelte';
  import { openConnection } from '../appobj/ConnectionAppObject.svelte';
  import { currentDatabase, openedConnections } from '../stores';
  import { useConnectionList, useDatabaseStatus, useServerStatus } from '../utility/metadataLoaders';
  import { reopenConnection } from '../utility/connectionProblem';
  import { switchCurrentDatabase } from '../utility/common';
  import { getLocalStorage } from '../utility/storageCache';
  import runCommand from '../commands/runCommand';
  import { _t } from '../translations';

  export let showAllConnections = false;
  export let onShowAllConnections = null;

  let open = false;
  let filter = '';
  let domRoot;
  let domSearch;

  const connections = useConnectionList();
  const serverStatus = useServerStatus();

  $: currentConnection = $currentDatabase?.connection;
  $: currentConid = currentConnection?._id;
  $: currentDbName = $currentDatabase?.name ? extractDbNameFromComposite($currentDatabase.name) : null;
  $: currentSchema = $currentDatabase?.name?.includes('::') ? $currentDatabase.name.split('::')[1] : null;

  // a connection that failed to open (eg. its server is switched off) is marked offline
  $: currentDatabaseStatus = useDatabaseStatus({ conid: currentConid, database: $currentDatabase?.name });
  $: currentOffline =
    !!currentConnection &&
    ($currentDatabaseStatus?.name == 'error' || isServerOffline(currentConnection, $serverStatus, $openedConnections));

  $: title = currentConnection
    ? getConnectionLabel(currentConnection, { allowExplicitDatabase: false })
    : _t('connectionSwitcher.chooseDatabase', { defaultMessage: 'Choose a database' });
  $: subtitle = currentConnection
    ? _.compact([currentDbName, currentSchema, engineName(currentConnection)]).join(' · ')
    : _t('connectionSwitcher.noConnectionHint', { defaultMessage: 'No connection selected' });

  $: sortedConnections = _.sortBy(
    ($connections || []).filter(x => !x.unsaved),
    x => getConnectionLabel(x).toUpperCase()
  );
  $: filteredConnections = sortedConnections.filter(x => connectionMatches(x, filter));

  function engineName(connection) {
    const match = (connection?.engine || '').match(/^([^@]*)@/);
    return match ? match[1] : connection?.engine;
  }

  function isServerOffline(connection, statusMap, opened) {
    return opened.includes(connection._id) && statusMap?.[connection._id]?.name == 'error';
  }

  function isOffline(connection, statusMap, opened, currentOffline) {
    return (connection._id == currentConid && currentOffline) || isServerOffline(connection, statusMap, opened);
  }

  function cachedDatabaseNames(connection) {
    return (getLocalStorage(`database_list_${connection._id}`) || []).map(x => x.name);
  }

  function connectionMatches(connection, filter) {
    if (!filter) return true;
    return filterName(filter, getConnectionLabel(connection), engineName(connection), ...cachedDatabaseNames(connection));
  }

  async function toggle() {
    open = !open;
    filter = '';
    if (open) {
      await tick();
      domSearch?.focus();
    }
  }

  function close() {
    open = false;
  }

  function handlePickConnection(connection) {
    if (isOffline(connection, $serverStatus, $openedConnections, currentOffline)) {
      reopenConnection(connection._id, connection.singleDatabase ? connection.defaultDatabase : null, connection);
    }
    openConnection(connection);
    if (connection.singleDatabase || connection.defaultDatabase) close();
  }

  function handlePickDatabase(connection, name) {
    switchCurrentDatabase({ connection, name });
    close();
  }

  function handleNewConnection() {
    close();
    runCommand('new.connection');
  }

  function handleShowAll() {
    close();
    if (onShowAllConnections) onShowAllConnections();
    else showAllConnections = true;
  }

  function handleSearchKeyDown(e) {
    if (e.key == 'Enter' && filteredConnections.length > 0) {
      handlePickConnection(filteredConnections[0]);
    }
  }

  function handleWindowMouseDown(e) {
    if (open && domRoot && !domRoot.contains(e.target)) close();
  }

  function handleWindowKeyDown(e) {
    if (open && e.key == 'Escape') close();
  }
</script>

<svelte:window on:mousedown={handleWindowMouseDown} on:keydown={handleWindowKeyDown} />

<div class="switcher" bind:this={domRoot}>
  <button
    class="trigger"
    class:open
    class:placeholder={!currentConnection}
    on:click={toggle}
    data-testid="ConnectionSwitcher_trigger"
  >
    <span class="avatar" class:avatar-placeholder={!currentConnection}>
      {#if currentConnection}
        <EngineLogo connection={currentConnection} size={18} />
      {:else}
        <FontIcon icon="icon database-outline" />
      {/if}
      {#if currentOffline}
        <span class="offline-dot" data-testid="ConnectionSwitcher_offlineDot" />
      {/if}
    </span>
    <span class="text">
      <span class="title">{title}</span>
      {#if currentConnection}
        <span class="subtitle"
          >{#if currentOffline}<span class="offline-label"
              >{_t('connectionSwitcher.offline', { defaultMessage: 'Offline' })}</span
            > · {/if}{subtitle}</span
        >
      {/if}
    </span>
    <span class="chevron"><FontIcon icon="icon unfold" /></span>
  </button>

  {#if open}
    <div class="popover" data-testid="ConnectionSwitcher_popover">
      <div class="search">
        <FontIcon icon="icon search" />
        <input
          bind:this={domSearch}
          bind:value={filter}
          on:keydown={handleSearchKeyDown}
          placeholder={_t('connectionSwitcher.search', { defaultMessage: 'Find connection or database...' })}
        />
      </div>

      <div class="list">
        <div class="section-label">{_t('common.connections', { defaultMessage: 'Connections' })}</div>
        {#each filteredConnections as connection (connection._id)}
          {@const isCurrent = connection._id == currentConid}
          {@const offline = isOffline(connection, $serverStatus, $openedConnections, currentOffline)}
          <button
            class="row"
            class:active={isCurrent && connection.singleDatabase}
            title={offline
              ? _t('connectionSwitcher.offlineHint', { defaultMessage: "Can't reach this server. Click to try again." })
              : null}
            on:click={() => handlePickConnection(connection)}
          >
            <span class="avatar small" class:current={isCurrent}><EngineLogo {connection} size={14} /></span>
            <span class="row-label">{getConnectionLabel(connection)}</span>
            {#if offline}
              <span class="row-meta offline" data-testid="ConnectionSwitcher_offlineLabel">
                <span class="offline-dot inline" />{_t('connectionSwitcher.offline', { defaultMessage: 'Offline' })}
              </span>
            {:else}
              <span class="row-meta">{engineName(connection)}</span>
            {/if}
            {#if isCurrent && connection.singleDatabase}
              <span class="check"><FontIcon icon="icon check" /></span>
            {/if}
          </button>

          {#if !connection.singleDatabase && $openedConnections.includes(connection._id)}
            <ConnectionSwitcherDatabases conid={connection._id} let:databases>
              {@const labelMatches = !filter || filterName(filter, getConnectionLabel(connection))}
              {#each databases.filter(db => labelMatches || filterName(filter, db.name)) as db (db.name)}
                {@const isActive = isCurrent && db.name == currentDbName}
                <button class="row nested" class:active={isActive} on:click={() => handlePickDatabase(connection, db.name)}>
                  <span class="db-icon"><FontIcon icon="icon database" /></span>
                  <span class="row-label">{db.name}</span>
                  {#if isActive}
                    <span class="check"><FontIcon icon="icon check" /></span>
                  {/if}
                </button>
              {/each}
            </ConnectionSwitcherDatabases>
          {/if}
        {:else}
          <div class="empty">{_t('connectionSwitcher.empty', { defaultMessage: 'No connections found' })}</div>
        {/each}
      </div>

      <div class="footer">
        <button class="row" on:click={handleNewConnection}>
          <span class="db-icon"><FontIcon icon="icon plus" /></span>
          <span class="row-label">{_t('connectionSwitcher.newConnection', { defaultMessage: 'New connection' })}</span>
        </button>
        <button class="row" on:click={handleShowAll}>
          <span class="db-icon"><FontIcon icon="icon connection" /></span>
          <span class="row-label">{_t('connectionSwitcher.allConnections', { defaultMessage: 'All connections' })}</span>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .switcher {
    position: relative;
    padding: 10px 10px 2px;
    flex-shrink: 0;
  }

  .trigger {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 5px 10px 5px 6px;
    border: 1px solid transparent;
    border-radius: var(--dim-radius-md);
    background: transparent;
    color: var(--theme-sidebar-foreground);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }
  .trigger:hover,
  .trigger.open {
    background: var(--theme-sidebar-background-hover);
    border-color: var(--theme-ui-border);
  }
  .trigger:active {
    transform: scale(0.985);
  }
  .trigger:focus-visible {
    outline: none;
    border-color: var(--theme-input-border-focus-color);
    box-shadow: var(--theme-input-focus-ring);
  }

  .avatar {
    flex-shrink: 0;
    box-sizing: border-box;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--theme-ui-accent-strong);
    background: var(--theme-ui-surface-2);
    box-shadow:
      inset 0 0 0 1px var(--theme-ui-border),
      0 1px 2px rgb(0 0 0 / 0.12);
  }
  .avatar.avatar-placeholder {
    color: var(--theme-ui-text-tertiary);
    background: transparent;
    box-shadow: none;
    border: 1px dashed var(--theme-ui-border-strong);
    transition:
      color var(--dim-transition-fast),
      border-color var(--dim-transition-fast);
  }
  .trigger:hover .avatar.avatar-placeholder,
  .trigger.open .avatar.avatar-placeholder {
    color: var(--theme-ui-accent-strong);
    border-color: var(--theme-ui-accent);
  }
  .avatar.small {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    font-size: 13px;
    color: var(--theme-generic-font-grayed);
    background: var(--theme-ui-hover);
    box-shadow: none;
  }
  .avatar.small.current {
    box-shadow: inset 0 0 0 1px var(--theme-ui-accent);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .trigger.placeholder .title {
    font-weight: 500;
    color: var(--theme-ui-text-secondary);
  }
  .trigger.placeholder:hover .title {
    color: var(--theme-sidebar-foreground);
  }
  .subtitle {
    font-size: 11.5px;
    color: var(--theme-ui-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chevron {
    flex-shrink: 0;
    color: var(--theme-ui-text-tertiary);
    font-size: 13px;
    transition: color var(--dim-transition-fast);
  }
  .trigger:hover .chevron,
  .trigger.open .chevron {
    color: var(--theme-ui-text-secondary);
  }

  .popover {
    position: absolute;
    z-index: 1000;
    top: calc(100% + 4px);
    left: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    max-height: min(480px, 70vh);
    background: var(--theme-menu-background);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: var(--theme-modal-border);
    border-radius: 12px;
    box-shadow: var(--theme-popup-shadow);
    overflow: hidden;
    transform-origin: top center;
    animation: switcher-in 180ms var(--dim-ease-spring);
  }

  @keyframes switcher-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .popover {
      animation: none;
    }
    .trigger:active {
      transform: none;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .popover {
      background: var(--theme-modal-background);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: var(--theme-modal-border);
    color: var(--theme-generic-font-grayed);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
  }
  .search input::placeholder {
    color: var(--theme-input-placeholder);
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .section-label {
    padding: 8px 8px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--theme-generic-font-grayed);
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--theme-menu-item-hover);
  }
  .row.active {
    background: var(--theme-ui-accent-soft);
  }
  .row.nested {
    padding-left: 36px;
  }

  .row-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-meta {
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }
  .db-icon {
    width: 20px;
    display: flex;
    justify-content: center;
    color: var(--theme-generic-font-grayed);
  }
  .check {
    color: var(--theme-ui-accent-strong);
  }

  .empty {
    padding: 12px 8px;
    color: var(--theme-generic-font-grayed);
  }

  .footer {
    padding: 4px;
    border-top: var(--theme-modal-border);
  }

  .avatar {
    position: relative;
  }
  .offline-dot {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--theme-generic-font-error);
    box-shadow: 0 0 0 2px var(--theme-sidebar-background);
    animation: offline-dot-in 240ms var(--dim-ease-spring);
  }
  .offline-dot.inline {
    position: static;
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    box-shadow: none;
    vertical-align: 1px;
  }
  @keyframes offline-dot-in {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }
  .offline-label,
  .row-meta.offline {
    color: var(--theme-ui-text-secondary);
    font-weight: 500;
  }
  @media (prefers-reduced-motion: reduce) {
    .offline-dot {
      animation: none;
    }
  }
</style>
