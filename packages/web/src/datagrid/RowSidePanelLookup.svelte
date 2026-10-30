<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import { apiCall } from '../utility/api';
  import { _t } from '../translations';
  import { createLookupSelect, formatLabel, normalizeKeyValue } from './rowSidePanelTools';

  export let conid;
  export let database;
  export let refTable;
  export let keyColumn;
  export let labelColumns: string[] = [];
  export let value;
  export let style = '';
  export let anchor = null;
  export let onPick;
  export let onClose;

  const PAGE_SIZE = 50;

  let search = '';
  let rows = [];
  let isLoading = false;
  let errorMessage = null;
  let highlighted = 0;
  let domRoot;
  let domSearch;
  let domList;
  let loadCounter = 0;
  let searchTimer = null;

  $: currentKey = normalizeKeyValue(value);

  async function load() {
    const counter = ++loadCounter;
    isLoading = true;
    const response = await apiCall('database-connections/sql-select', {
      conid,
      database,
      select: createLookupSelect(refTable, keyColumn, labelColumns, { search, limit: PAGE_SIZE }),
      auditLogSessionGroup: 'lookup',
    });
    // a newer search already started, its rows win
    if (counter != loadCounter) return;
    isLoading = false;
    errorMessage = response?.errorMessage ?? null;
    rows = response?.rows ?? [];
    const currentIndex = rows.findIndex(row => normalizeKeyValue(row[keyColumn]) == currentKey);
    highlighted = search ? 0 : Math.max(currentIndex, 0);
    await tick();
    scrollHighlightedIntoView();
  }

  function handleSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 200);
  }

  function scrollHighlightedIntoView() {
    domList?.querySelector('.row.highlighted')?.scrollIntoView({ block: 'nearest' });
  }

  function pick(row) {
    onPick(row[keyColumn], row);
  }

  async function handleKeyDown(e) {
    if (e.key == 'ArrowDown') {
      highlighted = Math.min(highlighted + 1, rows.length - 1);
      e.preventDefault();
    } else if (e.key == 'ArrowUp') {
      highlighted = Math.max(highlighted - 1, 0);
      e.preventDefault();
    } else if (e.key == 'Enter') {
      if (rows[highlighted]) pick(rows[highlighted]);
      e.preventDefault();
    } else if (e.key == 'Escape') {
      onClose(true);
      e.preventDefault();
    } else {
      return;
    }
    // keys handled here must not reach the sheet (Esc would close it, arrows would change the row)
    e.stopPropagation();
    await tick();
    scrollHighlightedIntoView();
  }

  function handleWindowMouseDown(e) {
    if (domRoot?.contains(e.target) || anchor?.contains(e.target)) return;
    onClose(false);
  }

  onMount(() => {
    load();
    domSearch?.focus();
  });

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });
</script>

<svelte:window on:mousedown={handleWindowMouseDown} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="lookup" {style} bind:this={domRoot} on:keydown={handleKeyDown} data-testid="RowSidePanelLookup_popover">
  <div class="search">
    <FontIcon icon="icon search" />
    <input
      bind:this={domSearch}
      bind:value={search}
      on:input={handleSearchInput}
      placeholder={_t('rowPanel.lookup.search', {
        defaultMessage: 'Search {pureName}...',
        values: { pureName: refTable.pureName },
      })}
      data-testid="RowSidePanelLookup_search"
    />
    {#if isLoading}
      <span class="spinner"><FontIcon icon="icon loading" /></span>
    {/if}
  </div>

  <div class="list" bind:this={domList}>
    {#if errorMessage}
      <div class="empty error">{errorMessage}</div>
    {:else}
      {#each rows as row, index (normalizeKeyValue(row[keyColumn]) ?? index)}
        {@const labels = formatLabel(row, labelColumns)}
        {@const isCurrent = currentKey != null && normalizeKeyValue(row[keyColumn]) == currentKey}
        <button
          class="row"
          class:highlighted={index == highlighted}
          on:mouseenter={() => (highlighted = index)}
          on:click={() => pick(row)}
          data-testid={`RowSidePanelLookup_row_${normalizeKeyValue(row[keyColumn])}`}
        >
          <span class="key">{normalizeKeyValue(row[keyColumn]) ?? 'NULL'}</span>
          <span class="labels">
            <span class="label" class:empty-label={!labels[0]}
              >{labels[0] ?? _t('rowPanel.lookup.noLabel', { defaultMessage: 'No name' })}</span
            >
            {#if labels[1]}
              <span class="secondary">{labels[1]}</span>
            {/if}
          </span>
          {#if isCurrent}
            <span class="check"><FontIcon icon="icon check" /></span>
          {/if}
        </button>
      {:else}
        {#if !isLoading}
          <div class="empty">
            {search
              ? _t('rowPanel.lookup.noMatch', { defaultMessage: 'No matching rows' })
              : _t('rowPanel.lookup.noRows', { defaultMessage: 'The table is empty' })}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  <div class="footer">
    <span class="table-name">{refTable.pureName}</span>
    {#if rows.length >= PAGE_SIZE}
      <span
        >{_t('rowPanel.lookup.firstRows', {
          defaultMessage: 'First {count} rows · type to narrow',
          values: { count: PAGE_SIZE },
        })}</span
      >
    {:else if rows.length == 1}
      <span>{_t('rowPanel.lookup.oneRow', { defaultMessage: '1 row' })}</span>
    {:else}
      <span
        >{_t('rowPanel.lookup.rowCount', {
          defaultMessage: '{count} rows',
          values: { count: rows.length },
        })}</span
      >
    {/if}
  </div>
</div>

<style>
  .lookup {
    position: absolute;
    z-index: 20;
    display: flex;
    flex-direction: column;
    background: var(--theme-menu-background);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: var(--theme-modal-border);
    border-radius: 10px;
    box-shadow: var(--theme-popup-shadow);
    overflow: hidden;
    transform-origin: top center;
    animation: row-lookup-in 160ms var(--dim-ease-spring);
  }

  @keyframes row-lookup-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .lookup {
      background: var(--theme-modal-background);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lookup {
      animation: none;
    }
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
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
  .spinner {
    font-size: 13px;
  }

  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px;
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row.highlighted {
    background: var(--theme-menu-item-hover);
  }

  .key {
    flex-shrink: 0;
    min-width: 28px;
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .labels {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .label,
  .secondary {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label {
    flex-shrink: 0;
    max-width: 60%;
  }
  .label.empty-label {
    color: var(--theme-generic-font-grayed);
    font-style: italic;
  }
  .secondary {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }

  .check {
    flex-shrink: 0;
    color: var(--theme-ui-accent-strong);
  }

  .empty {
    padding: 12px 8px;
    color: var(--theme-generic-font-grayed);
  }
  .empty.error {
    color: var(--theme-generic-font-error);
  }

  .footer {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    border-top: var(--theme-modal-border);
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }
  .table-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
