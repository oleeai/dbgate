<script context="module">
  import { __t } from '../translations';
  registerCommand({
    id: 'commandPalette.show',
    category: __t('command.commandPalette', { defaultMessage: 'Command palette' }),
    name: __t('command.commandPalette.show', { defaultMessage: 'Show' }),
    toolbarName: __t('command.commandPalette', { defaultMessage: 'Command palette' }),
    toolbarOrder: 0,
    keyText: 'F1 | CtrlOrCommand+Shift+P',
    toolbar: true,
    showDisabled: true,
    icon: 'icon menu',
    onClick: () => visibleCommandPalette.set('menu'),
    testEnabled: () => getVisibleCommandPalette() != 'menu',
  });

  // Cmd+K / Ctrl+K: one search over tables, tabs, actions and databases; pressed again, it closes the panel
  registerCommand({
    id: 'commandPalette.search',
    category: __t('command.commandPalette', { defaultMessage: 'Command palette' }),
    name: __t('command.commandPalette.search', { defaultMessage: 'Quick search' }),
    toolbarName: __t('command.commandPalette.search', { defaultMessage: 'Quick search' }),
    keyText: 'CtrlOrCommand+K',
    icon: 'icon search',
    onClick: () => visibleCommandPalette.update(x => (x == 'search' ? null : 'search')),
  });

  registerCommand({
    id: 'database.search',
    category: __t('command.database', { defaultMessage: 'Database' }),
    toolbarName: __t('command.database.databaseSearch', { defaultMessage: 'Database search' }),
    name: __t('command.database.search', { defaultMessage: 'Search' }),
    keyText: isElectronAvailable() ? 'CtrlOrCommand+P' : 'F3',
    onClick: () => visibleCommandPalette.set('database'),
    testEnabled: () => getVisibleCommandPalette() != 'database',
  });

  // critically damped spring: no overshoot, settles fast
  const springOut = t => 1 - (1 + 9 * t) * Math.exp(-9 * t);

  // bidirectional, so a close interrupted by reopening reverses from where it is
  function panel(node) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return { duration: 120, css: t => `opacity: ${t}` };
    }
    return {
      duration: 220,
      easing: springOut,
      css: t => `opacity: ${Math.min(1, t * 1.5)}; transform: scale(${0.95 + 0.05 * t})`,
    };
  }

  function backdrop(node) {
    return { duration: 160, css: t => `opacity: ${t}` };
  }

  const GROUP_LIMITS = { objects: 6, tabs: 3, actions: 5, connections: 3 };
  const EMPTY_QUERY_TAB_LIMIT = 6;
  const RECENT_DATABASE_LIMIT = 4;
  const RENDER_LIMIT = 300;

  const KEY_SYMBOLS = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: '↵',
    Escape: 'esc',
    Tab: '⇥',
  };

  // the first alternative of a shortcut ("F1 | Ctrl+Shift+P" -> F1), split into key caps
  function keyCaps(keyText) {
    const first = (keyText || '').split('|')[0].trim();
    if (!first) return [];
    const formatted = formatKeyText(first);
    const parts = isMac() ? formatted.split(/\s+/) : formatted.split(/\+(?=.)/);
    return parts.filter(x => x).map(x => KEY_SYMBOLS[x] ?? x);
  }
</script>

<script>
  import _ from 'lodash';
  import { onDestroy, onMount, tick } from 'svelte';
  import { extractDbNameFromComposite } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import EngineLogo from '../icons/EngineLogo.svelte';
  import { runWithCommandSource } from './commandSource';
  import {
    commandsCustomized,
    currentDatabase,
    getVisibleCommandPalette,
    lastUsedDefaultActions,
    openedTabs,
    recentDatabases,
    visibleCommandPalette,
  } from '../stores';
  import { isElectronAvailable } from '../utility/getElectron';
  import { useConnectionList, useDatabaseInfo } from '../utility/metadataLoaders';
  import registerCommand from './registerCommand';
  import { formatKeyText, isCtrlOrCommandKey, isMac } from '../utility/common';
  import { _tval, _t } from '../translations';
  import {
    buildActionItems,
    buildConnectionItems,
    buildObjectItems,
    buildRecentDatabaseItems,
    buildSubCommandItems,
    buildTabItems,
    matchItems,
  } from './quickSearchItems';

  let domRoot;
  let domInput;
  let oldFocus = null;
  let filter = '';
  let selectedIndex = 0;
  let lastPointer = null;
  const domItems = {};
  const modKey = isMac() ? '⌘' : 'Ctrl';

  // kept while the panel animates out, so its content doesn't change under the closing animation
  let scope = $visibleCommandPalette;
  $: if ($visibleCommandPalette) scope = $visibleCommandPalette;
  $: parentCommand = _.isPlainObject(scope) ? scope : null;

  $: conid = $currentDatabase?.connection?._id;
  $: database = $currentDatabase?.name;
  $: databaseLabel = database ? extractDbNameFromComposite(database) : null;
  $: databaseInfo = useDatabaseInfo({ conid, database });
  $: connectionList = useConnectionList();

  $: objectItems = buildObjectItems($databaseInfo, conid, database, $lastUsedDefaultActions);
  $: tabItems = buildTabItems($openedTabs, $connectionList);
  $: actionItems = buildActionItems($commandsCustomized);
  $: connectionItems = buildConnectionItems($connectionList, $currentDatabase);
  $: recentDatabaseItems = buildRecentDatabaseItems(
    $recentDatabases,
    $currentDatabase,
    $connectionList,
    RECENT_DATABASE_LIMIT
  );

  $: query = filter.trim();
  $: sections = buildSections(scope, parentCommand, query, databaseLabel, {
    objects: objectItems,
    tabs: tabItems,
    actions: actionItems,
    connections: connectionItems,
    recent: recentDatabaseItems,
  });
  $: items = sections.flatMap(section => section.items);
  $: selectedItem = items[selectedIndex];

  // a new query or scope starts at the top
  $: {
    query;
    scope;
    selectedIndex = 0;
  }
  $: if (selectedIndex >= items.length && items.length > 0) selectedIndex = items.length - 1;
  $: scrollToSelected(selectedIndex);

  $: scopeLabel = getScopeLabel(scope, parentCommand, databaseLabel);
  $: placeholder = getPlaceholder(scope, parentCommand);

  function groupLabel(group) {
    switch (group) {
      case 'objects':
        return _t('commandPalette.groupObjects', { defaultMessage: 'Tables & views' });
      case 'tabs':
        return _t('commandPalette.groupTabs', { defaultMessage: 'Tabs' });
      case 'actions':
        return _t('commandPalette.groupActions', { defaultMessage: 'Actions' });
      case 'connections':
        return _t('commandPalette.groupConnections', { defaultMessage: 'Connections & databases' });
      case 'recent':
        return _t('commandPalette.groupRecentDatabases', { defaultMessage: 'Recent databases' });
    }
    return null;
  }

  function getScopeLabel(scope, parentCommand, databaseLabel) {
    if (parentCommand) return _tval(parentCommand.name) || _tval(parentCommand.text);
    if (scope == 'menu') return groupLabel('actions');
    if (scope == 'database') return databaseLabel || _t('common.database', { defaultMessage: 'Database' });
    if (scope == 'objects' || scope == 'tabs' || scope == 'connections') return groupLabel(scope);
    return null;
  }

  function getPlaceholder(scope, parentCommand) {
    if (parentCommand) return _t('commandPalette.searchOptions', { defaultMessage: 'Search options' });
    switch (scope) {
      case 'menu':
        return _t('commandPalette.searchActions', { defaultMessage: 'Search actions' });
      case 'database':
        return _t('commandPalette.searchInDatabase', { defaultMessage: 'Search in database' });
      case 'objects':
        return _t('commandPalette.searchObjects', { defaultMessage: 'Search tables and views' });
      case 'tabs':
        return _t('commandPalette.searchTabs', { defaultMessage: 'Search tabs' });
      case 'connections':
        return _t('commandPalette.searchConnections', { defaultMessage: 'Search connections and databases' });
    }
    return _t('commandPalette.searchEverything', { defaultMessage: 'Search tables, tabs, actions and databases' });
  }

  // limit > 0 shows the best few and a "Show all" row; 0 shows all of them (up to the render limit)
  function section(id, list, { label = null, detail = null, limit = 0 } = {}) {
    if (!list.length) return null;
    const shown = list.slice(0, limit || RENDER_LIMIT);
    if (limit && list.length > limit) {
      const title = _t('commandPalette.showAll', {
        defaultMessage: 'Show all {count} results',
        values: { count: list.length },
      });
      shown.push({
        key: `more:${id}`,
        group: 'more',
        title,
        segments: [{ text: title, highlighted: false }],
        icon: 'icon dots-horizontal',
        enterScope: id == 'actions' ? 'menu' : id,
        actionLabel: _t('commandPalette.showAllAction', { defaultMessage: 'Show all' }),
      });
    }
    return { id, label, detail, items: shown, hiddenCount: limit ? 0 : list.length - shown.length };
  }

  function buildSections(scope, parentCommand, query, databaseLabel, sources) {
    const objects = () => matchItems(sources.objects, query);
    const tabs = () => matchItems(sources.tabs, query);
    const actions = () => matchItems(sources.actions, query);
    const connections = () => matchItems(sources.connections, query);

    let res;
    if (parentCommand) {
      res = [section('sub', matchItems(buildSubCommandItems(parentCommand), query))];
    } else if (scope == 'menu') {
      res = [section('actions', actions())];
    } else if (scope == 'objects') {
      res = [section('objects', objects())];
    } else if (scope == 'tabs') {
      res = [section('tabs', tabs())];
    } else if (scope == 'connections') {
      res = [section('connections', connections())];
    } else if (scope == 'database') {
      res = [
        section('objects', objects(), { label: groupLabel('objects') }),
        section('connections', connections(), { label: groupLabel('connections') }),
      ];
    } else if (!query) {
      res = [
        section('tabs', tabs(), { label: groupLabel('tabs'), limit: EMPTY_QUERY_TAB_LIMIT }),
        section('recent', matchItems(sources.recent, ''), { label: groupLabel('recent') }),
      ];
    } else {
      res = [
        section('objects', objects(), {
          label: groupLabel('objects'),
          detail: databaseLabel,
          limit: GROUP_LIMITS.objects,
        }),
        section('tabs', tabs(), { label: groupLabel('tabs'), limit: GROUP_LIMITS.tabs }),
        section('actions', actions(), { label: groupLabel('actions'), limit: GROUP_LIMITS.actions }),
        section('connections', connections(), { label: groupLabel('connections'), limit: GROUP_LIMITS.connections }),
      ];
    }

    let index = 0;
    return _.compact(res).map(sec => ({
      ...sec,
      items: sec.items.map((item, position) => ({ ...item, index: index++, first: position == 0 })),
    }));
  }

  async function scrollToSelected(index) {
    await tick();
    domItems[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function setScope(value, clearFilter = false) {
    if (clearFilter) filter = '';
    visibleCommandPalette.set(value);
    domInput?.focus();
  }

  function restoreFocus() {
    if (!domRoot?.contains(document.activeElement)) return;
    if (oldFocus && oldFocus != document.body && oldFocus.isConnected && !domRoot.contains(oldFocus)) {
      oldFocus.focus();
    }
    if (domRoot.contains(document.activeElement)) document.activeElement['blur']?.();
  }

  function close() {
    restoreFocus();
    visibleCommandPalette.set(null);
  }

  function runItem(item, alternate = false) {
    if (!item) return;
    if (item.subCommandsOf) {
      setScope(item.subCommandsOf, true);
      return;
    }
    if (item.enterScope) {
      setScope(item.enterScope);
      return;
    }
    const action = alternate && item.runAlt ? item.runAlt : item.run;
    close();
    if (action) runWithCommandSource('palette', () => action());
  }

  function move(delta) {
    if (!items.length) return;
    selectedIndex = Math.max(0, Math.min(items.length - 1, selectedIndex + delta));
  }

  function handleKeyDown(e) {
    const macCtrl = isMac() && e.ctrlKey && !e.metaKey;
    if (e.key == 'ArrowDown' || (e.key == 'Tab' && !e.shiftKey) || (macCtrl && e.key == 'n')) move(1);
    else if (e.key == 'ArrowUp' || (e.key == 'Tab' && e.shiftKey) || (macCtrl && e.key == 'p')) move(-1);
    else if (e.key == 'PageDown') move(8);
    else if (e.key == 'PageUp') move(-8);
    else if (e.key == 'Enter') runItem(selectedItem, isCtrlOrCommandKey(e));
    else if (e.key == 'Escape') close();
    else if (e.key == 'Backspace' && !filter && scope != 'search') setScope('search');
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function handleInput(e) {
    // ">" switches to the actions, as in other command palettes
    const value = e.target.value || '';
    if (scope == 'search' && value.startsWith('>')) {
      filter = value.slice(1).trimStart();
      setScope('menu');
    }
  }

  function handlePointerMove(e, item) {
    // a scroll under a resting pointer must not move the selection
    const pointer = `${e.clientX}:${e.clientY}`;
    if (pointer == lastPointer) return;
    lastPointer = pointer;
    if (item.index != selectedIndex) selectedIndex = item.index;
  }

  // reopened while still animating out: take the focus back
  $: handleVisibility($visibleCommandPalette);
  async function handleVisibility(value) {
    if (!domRoot) return;
    if (value) {
      if (!domRoot.contains(document.activeElement)) oldFocus = document.activeElement;
      // an element animating out is inert; wait until the reversed transition has made it interactive again
      await tick();
      domInput?.focus();
    } else {
      restoreFocus();
    }
  }

  onMount(() => {
    oldFocus = document.activeElement;
    domInput.focus();
  });

  onDestroy(() => restoreFocus());
</script>

<div class="main" class:closing={!$visibleCommandPalette} bind:this={domRoot} data-testid="CommandPalette_main">
  <div class="overlay" role="presentation" transition:backdrop|global on:mousedown={close} />
  <div
    class="palette"
    role="dialog"
    aria-modal="true"
    aria-label={_t('commandPalette.title', { defaultMessage: 'Quick search' })}
    transition:panel|global
  >
    <div class="search">
      <span class="search-icon"><FontIcon icon="icon search" /></span>
      {#if scopeLabel}
        <button
          class="scope"
          title={_t('commandPalette.searchEverywhere', { defaultMessage: 'Search everywhere' })}
          on:mousedown|preventDefault
          on:click={() => setScope('search')}
          data-testid="CommandPalette_scope"
        >
          <span class="scope-label">{scopeLabel}</span>
          <FontIcon icon="icon close" />
        </button>
      {/if}
      <input
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="command-palette-list"
        aria-activedescendant={selectedItem ? `command-palette-item-${selectedIndex}` : undefined}
        autocomplete="off"
        spellcheck="false"
        bind:this={domInput}
        bind:value={filter}
        on:input={handleInput}
        on:keydown={handleKeyDown}
        {placeholder}
        data-testid="CommandPalette_input"
      />
    </div>

    <div class="content" id="command-palette-list" role="listbox">
      {#each sections as section (section.id)}
        {#if section.label}
          <div class="section-label">
            <span>{section.label}</span>
            {#if section.detail}
              <span class="section-detail">{section.detail}</span>
            {/if}
          </div>
        {/if}
        {#each section.items as item (item.key)}
          <div
            class="command"
            class:selected={item.index == selectedIndex}
            class:first={item.first && !!section.label}
            class:dimmed={item.dimmed}
            class:more={item.group == 'more'}
            id="command-palette-item-{item.index}"
            role="option"
            tabindex="-1"
            aria-selected={item.index == selectedIndex}
            bind:this={domItems[item.index]}
            on:mousemove={e => handlePointerMove(e, item)}
            on:mousedown|preventDefault
            on:click={e => runItem(item, isCtrlOrCommandKey(e))}
            data-testid="CommandPalette_item"
          >
            <span class="icon" class:quiet={item.quietIcon}>
              {#if item.connection}
                <EngineLogo connection={item.connection} size={16} />
              {:else if item.icon}
                <FontIcon icon={item.icon} />
              {/if}
            </span>
            <!-- one line on purpose: whitespace between the segments would show up between the characters -->
            <span class="title">{#each item.segments as seg}{#if seg.highlighted}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
            {#if item.meta}
              <span class="meta">{item.meta}</span>
            {/if}
            <span class="trail">
              {#if item.checked}
                <span class="check"><FontIcon icon="icon check" /></span>
              {/if}
              {#if item.keyText}
                <span class="keys">
                  {#each keyCaps(item.keyText) as cap}
                    <kbd>{cap}</kbd>
                  {/each}
                </span>
              {/if}
              {#if item.subCommandsOf || item.enterScope}
                <span class="chevron"><FontIcon icon="icon chevron-right" /></span>
              {/if}
            </span>
          </div>
        {/each}
        {#if section.hiddenCount > 0}
          <div class="note">
            {_t('commandPalette.moreHidden', {
              defaultMessage: '{count} more, type to narrow down',
              values: { count: section.hiddenCount },
            })}
          </div>
        {/if}
      {/each}

      {#if items.length == 0}
        <div class="empty" data-testid="CommandPalette_empty">
          <span class="empty-icon"><FontIcon icon="icon search" /></span>
          {#if query}
            <div class="empty-title">
              {_t('commandPalette.noResults', { defaultMessage: 'No results for “{query}”', values: { query } })}
            </div>
            <div class="empty-text">
              {#if (scope == 'search' || scope == 'objects' || scope == 'database') && !conid}
                {_t('commandPalette.noResultsNoDatabase', {
                  defaultMessage: 'Choose a database to search its tables and views too.',
                })}
              {:else if scope == 'search'}
                {_t('commandPalette.noResultsHint', {
                  defaultMessage: 'Try part of a table, tab, action or database name.',
                })}
              {:else}
                {_t('commandPalette.noResultsScopeHint', {
                  defaultMessage: 'Press Backspace in the empty field to search everywhere.',
                })}
              {/if}
            </div>
          {:else if (scope == 'objects' || scope == 'database') && !conid}
            <div class="empty-title">
              {_t('commandPalette.noDatabase', { defaultMessage: 'No database selected' })}
            </div>
            <div class="empty-text">
              {_t('commandPalette.noDatabaseHint', {
                defaultMessage: 'Choose a database to search its tables and views.',
              })}
            </div>
          {:else}
            <div class="empty-title">
              {_t('commandPalette.startTitle', { defaultMessage: 'Search everything' })}
            </div>
            <div class="empty-text">
              {_t('commandPalette.startHint', {
                defaultMessage: 'Tables and views, tabs, actions, connections and databases. Start with > to search actions only.',
              })}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="footer">
      <span class="hint navigate">
        <kbd>↑</kbd><kbd>↓</kbd>
        {_t('commandPalette.navigate', { defaultMessage: 'Navigate' })}
      </span>
      <span class="footer-spacer" />
      {#if selectedItem?.actionLabel}
        <span class="hint">
          <kbd>↵</kbd>
          {selectedItem.actionLabel}
        </span>
      {/if}
      {#if selectedItem?.altActionLabel}
        <span class="hint">
          <kbd>{modKey}</kbd><kbd>↵</kbd>
          {selectedItem.altActionLabel}
        </span>
      {/if}
      <span class="hint">
        <kbd>esc</kbd>
        {_t('commandPalette.close', { defaultMessage: 'Close' })}
      </span>
    </div>
  </div>
</div>

<style>
  .main {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    box-sizing: border-box;
    padding: 12vh 16px 16px;
  }
  .main.closing {
    pointer-events: none;
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--theme-modal-overlay-background) 45%, transparent);
  }

  .palette {
    position: relative;
    width: 640px;
    max-width: 100%;
    max-height: min(560px, 76vh);
    display: flex;
    flex-direction: column;
    background: var(--theme-menu-background);
    backdrop-filter: blur(32px) saturate(180%);
    -webkit-backdrop-filter: blur(32px) saturate(180%);
    border: var(--theme-modal-border);
    border-radius: var(--dim-radius-xl);
    box-shadow: var(--theme-modal-shadow);
    color: var(--theme-generic-font);
    overflow: hidden;
    transform-origin: center;
  }

  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .palette {
      background: var(--theme-modal-background);
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .palette {
      background: var(--theme-modal-background);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 56px;
    padding: 0 18px;
    flex-shrink: 0;
    border-bottom: var(--theme-modal-border);
  }
  .search-icon {
    display: flex;
    font-size: 20px;
    color: var(--theme-ui-text-tertiary);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    font-size: 18px;
    letter-spacing: -0.01em;
  }
  .search input::placeholder {
    color: var(--theme-input-placeholder);
  }

  .scope {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    max-width: 45%;
    height: 24px;
    padding: 0 5px 0 9px;
    border: none;
    border-radius: 6px;
    background: var(--theme-ui-accent-soft);
    color: var(--theme-ui-accent-strong);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color var(--dim-transition-fast);
  }
  .scope:hover {
    background: color-mix(in srgb, var(--theme-ui-accent) 28%, transparent);
  }
  .scope-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px;
  }

  .section-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 10px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--theme-ui-text-tertiary);
  }
  .section-label:first-child {
    padding-top: 4px;
  }
  .section-detail {
    min-width: 0;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .command {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 10px;
    border-radius: var(--dim-radius-md);
    color: var(--theme-generic-font);
    font-size: 13px;
    cursor: pointer;
    scroll-margin: 6px 0;
  }
  /* scrolling up to the first row of a group also shows the group label */
  .command.first {
    scroll-margin-top: 32px;
  }
  .command.selected {
    background: var(--theme-ui-accent-soft);
  }

  .icon {
    width: 18px;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    font-size: 16px;
    color: var(--theme-ui-text-secondary);
  }
  .icon.quiet {
    color: var(--theme-ui-text-tertiary);
  }
  .title {
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title mark {
    background: none;
    color: var(--theme-ui-accent-strong);
    font-weight: 600;
  }
  .meta {
    flex: 1 1 0;
    min-width: 0;
    font-size: 12px;
    color: var(--theme-ui-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .command.dimmed .title,
  .command.more .title {
    color: var(--theme-ui-text-secondary);
  }
  .command.dimmed .icon {
    opacity: 0.6;
  }

  .trail {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    margin-left: auto;
  }
  .check {
    display: flex;
    color: var(--theme-ui-accent-strong);
  }
  .chevron {
    display: flex;
    color: var(--theme-ui-text-tertiary);
  }
  .keys {
    display: flex;
    gap: 3px;
  }

  kbd {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 4px;
    background: var(--theme-ui-hover);
    box-shadow: inset 0 0 0 1px var(--theme-ui-border);
    color: var(--theme-ui-text-secondary);
    font: inherit;
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
  }

  .note {
    padding: 8px 10px 6px;
    font-size: 12px;
    color: var(--theme-ui-text-tertiary);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 36px 24px 40px;
    text-align: center;
  }
  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin-bottom: 6px;
    border-radius: 50%;
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-tertiary);
    font-size: 22px;
  }
  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--theme-generic-font);
  }
  .empty-text {
    max-width: 380px;
    font-size: 12.5px;
    color: var(--theme-ui-text-secondary);
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 36px;
    padding: 0 14px;
    flex-shrink: 0;
    border-top: var(--theme-modal-border);
    font-size: 11.5px;
    color: var(--theme-ui-text-tertiary);
  }
  .footer-spacer {
    flex: 1;
  }
  .hint {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }
  .hint kbd:last-of-type {
    margin-right: 3px;
  }

  @media (max-width: 560px) {
    .meta,
    .hint.navigate {
      display: none;
    }
  }
</style>
