<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';
  import { _t } from '../translations';

  export let offset: number;
  export let limit: number;
  export let pageSizes: number[];
  export let loadedCount = 0;
  export let isLoadedAll = false;
  // null while unknown (not counted yet, or the count failed)
  export let totalCount: number = null;
  export let countError: string = null;
  export let isCounting = false;

  export let onSetPage: (offset: number) => void;
  export let onSetLimit: (limit: number) => void;
  export let onReloadCount: () => void;

  // [{ label, format }]; empty when the user can't export
  export let exportFormats = [];
  export let onExport = null;
  export let onExportAdvanced = null;

  let domPageInput;
  let pageInput = '';

  $: page = Math.floor(offset / limit) + 1;
  $: pageCount = totalCount != null ? Math.max(1, Math.ceil(totalCount / limit)) : null;
  $: hasPrevious = offset > 0;
  // without a count, a page that came back short is the last one
  $: hasNext = totalCount != null ? offset + limit < totalCount : !(isLoadedAll && loadedCount < limit);
  $: isEmpty = totalCount == 0 || (offset == 0 && isLoadedAll && loadedCount == 0);
  $: lastRow =
    totalCount != null ? Math.min(offset + limit, totalCount) : offset + (isLoadedAll ? loadedCount : limit);
  // without a count, at least the rows up to this page exist
  $: totalText = totalCount != null ? format(totalCount) : `${format(lastRow)}+`;
  $: sizeOptions = pageSizes.includes(limit) ? pageSizes : [...pageSizes, limit].sort((a, b) => a - b);
  $: pageInput = String(page);

  function format(value: number) {
    return value.toLocaleString();
  }

  function commitPageInput() {
    const value = parseInt(pageInput, 10);
    if (!Number.isFinite(value)) {
      pageInput = String(page);
      return;
    }
    const target = Math.max(1, pageCount != null ? Math.min(value, pageCount) : value);
    pageInput = String(target);
    if (target != page) onSetPage((target - 1) * limit);
  }

  function handlePageKeyDown(e) {
    if (e.key == 'Enter') {
      commitPageInput();
      domPageInput.select();
      e.preventDefault();
    } else if (e.key == 'Escape') {
      pageInput = String(page);
      domPageInput.blur();
      e.preventDefault();
    }
  }
</script>

<div class="footer" data-testid="DataGridPagingFooter_container">
  <div class="rows" data-testid="DataGridPagingFooter_rows">
    {#if isEmpty}
      <span class="label">{_t('datagrid.paging.noRows', { defaultMessage: 'No rows' })}</span>
    {:else}
      <span class="label rows-word">{_t('datagrid.paging.rows', { defaultMessage: 'Rows' })}</span>
      <span class="value" data-testid="DataGridPagingFooter_range">{format(offset + 1)}–{format(lastRow)}</span>
      <span class="label">{_t('datagrid.paging.of', { defaultMessage: 'of' })}</span>
      {#if isCounting}
        <span class="counting" title={_t('datagrid.paging.counting', { defaultMessage: 'Counting rows...' })}>
          <FontIcon icon="icon loading" />
        </span>
      {:else}
        <span
          class="value"
          class:unknown={totalCount == null}
          title={countError ?? ''}
          data-testid="DataGridPagingFooter_total">{totalText}</span
        >
      {/if}
    {/if}
    {#if !isCounting}
      <button
        class="icon-button"
        class:attention={totalCount == null}
        title={totalCount == null
          ? _t('datagrid.paging.countAllRows', { defaultMessage: 'Count all rows' })
          : _t('datagrid.paging.recountRows', { defaultMessage: 'Count rows again' })}
        aria-label={_t('datagrid.paging.countAllRows', { defaultMessage: 'Count all rows' })}
        on:click={onReloadCount}
        data-testid="DataGridPagingFooter_refreshCount"
      >
        <FontIcon icon="icon refresh" />
      </button>
    {/if}
  </div>

  <div class="pager">
    <button
      class="icon-button"
      disabled={!hasPrevious}
      title={_t('datagrid.paging.firstPage', { defaultMessage: 'First page' })}
      aria-label={_t('datagrid.paging.firstPage', { defaultMessage: 'First page' })}
      on:click={() => onSetPage(0)}
      data-testid="DataGridPagingFooter_first"
    >
      <FontIcon icon="icon chevron-double-left" />
    </button>
    <button
      class="icon-button"
      disabled={!hasPrevious}
      title={_t('datagrid.paging.previousPage', { defaultMessage: 'Previous page' })}
      aria-label={_t('datagrid.paging.previousPage', { defaultMessage: 'Previous page' })}
      on:click={() => onSetPage(Math.max(0, offset - limit))}
      data-testid="DataGridPagingFooter_previous"
    >
      <FontIcon icon="icon chevron-left" />
    </button>

    <label class="page">
      <span class="label">{_t('datagrid.paging.page', { defaultMessage: 'Page' })}</span>
      <input
        type="text"
        inputmode="numeric"
        bind:this={domPageInput}
        bind:value={pageInput}
        on:keydown={handlePageKeyDown}
        on:blur={commitPageInput}
        on:focus={() => domPageInput.select()}
        style={`width: calc(${Math.max(2, String(pageCount ?? page).length)}ch + 14px)`}
        aria-label={_t('datagrid.paging.pageNumber', { defaultMessage: 'Page number' })}
        data-testid="DataGridPagingFooter_pageInput"
      />
      {#if pageCount != null}
        <span class="label">{_t('datagrid.paging.of', { defaultMessage: 'of' })}</span>
        <span class="value" data-testid="DataGridPagingFooter_pageCount">{format(pageCount)}</span>
      {/if}
    </label>

    <button
      class="icon-button"
      disabled={!hasNext}
      title={_t('datagrid.paging.nextPage', { defaultMessage: 'Next page' })}
      aria-label={_t('datagrid.paging.nextPage', { defaultMessage: 'Next page' })}
      on:click={() => onSetPage(offset + limit)}
      data-testid="DataGridPagingFooter_next"
    >
      <FontIcon icon="icon chevron-right" />
    </button>
    <button
      class="icon-button"
      disabled={!hasNext || pageCount == null}
      title={_t('datagrid.paging.lastPage', { defaultMessage: 'Last page' })}
      aria-label={_t('datagrid.paging.lastPage', { defaultMessage: 'Last page' })}
      on:click={() => onSetPage((pageCount - 1) * limit)}
      data-testid="DataGridPagingFooter_last"
    >
      <FontIcon icon="icon chevron-double-right" />
    </button>

    <label class="page-size">
      <span class="label per-page-label">{_t('datagrid.paging.perPage', { defaultMessage: 'Per page' })}</span>
      <span class="select">
        <select
          value={limit}
          on:change={e => onSetLimit(parseInt(e.currentTarget.value, 10))}
          aria-label={_t('datagrid.paging.rowsPerPage', { defaultMessage: 'Rows per page' })}
          data-testid="DataGridPagingFooter_pageSize"
        >
          {#each sizeOptions as size}
            <option value={size}>{format(size)}</option>
          {/each}
        </select>
        <span class="chevron"><FontIcon icon="icon chevron-down" /></span>
      </span>
    </label>
  </div>

  <div class="export">
    {#if exportFormats.length > 0 || onExportAdvanced}
      <span class="label export-label">{_t('datagrid.paging.export', { defaultMessage: 'Export' })}</span>
      {#each exportFormats as item (item.label)}
        <button
          class="text-button"
          title={_t('datagrid.paging.exportAs', {
            defaultMessage: 'Export all rows that match the filter as {format}',
            values: { format: item.label },
          })}
          on:click={() => onExport(item.format)}
          data-testid={`DataGridPagingFooter_export${item.label}`}
        >
          <FontIcon icon="icon download" />
          {item.label}
        </button>
      {/each}
      {#if onExportAdvanced}
        <button
          class="text-button"
          title={_t('datagrid.paging.exportMoreTitle', { defaultMessage: 'Other formats and export options' })}
          on:click={onExportAdvanced}
          data-testid="DataGridPagingFooter_exportMore"
        >
          {_t('datagrid.paging.exportMore', { defaultMessage: 'More...' })}
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .footer {
    container-type: inline-size;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 32px;
    flex-shrink: 0;
    padding: 0 8px 0 12px;
    box-sizing: border-box;
    border-top: 1px solid var(--theme-ui-border);
    background: var(--theme-datagrid-headercell-background);
    color: var(--theme-generic-font);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    user-select: none;
  }

  .rows,
  .export {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .rows {
    overflow: hidden;
  }
  .export {
    justify-content: flex-end;
    gap: 2px;
  }
  .pager {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .label {
    color: var(--theme-generic-font-grayed);
  }
  .value {
    font-weight: 500;
  }
  .value.unknown {
    color: var(--theme-ui-text-secondary);
  }
  .counting {
    display: inline-flex;
    align-items: center;
    font-size: 14px;
    color: var(--theme-ui-text-secondary);
  }

  .icon-button,
  .text-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 24px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font: inherit;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .icon-button {
    width: 24px;
    padding: 0;
    font-size: 15px;
  }
  .text-button {
    padding: 0 7px;
  }
  .icon-button:hover:not(:disabled),
  .text-button:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .icon-button:active:not(:disabled),
  .text-button:active {
    background: var(--theme-ui-active);
  }
  .icon-button:disabled {
    color: var(--theme-generic-font-grayed);
    opacity: 0.45;
    cursor: default;
  }
  .rows .icon-button {
    width: 20px;
    height: 20px;
    margin-left: 2px;
    font-size: 13px;
    color: var(--theme-generic-font-grayed);
  }
  .rows .icon-button.attention {
    color: var(--theme-ui-accent-strong);
  }

  .page,
  .page-size {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 6px;
  }
  .page-size {
    margin-left: 10px;
  }

  input,
  select {
    box-sizing: border-box;
    height: 22px;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-sm);
    background: var(--theme-input-background);
    color: var(--theme-generic-font);
    font: inherit;
    font-variant-numeric: tabular-nums;
    transition:
      border-color var(--dim-transition-fast),
      box-shadow var(--dim-transition-fast);
  }
  input {
    padding: 0 6px;
    text-align: center;
  }
  input:hover,
  select:hover {
    border-color: var(--theme-ui-border-strong);
  }
  input:focus,
  select:focus {
    outline: none;
    border-color: var(--theme-input-border-focus-color);
    box-shadow: var(--theme-input-focus-ring);
  }

  .select {
    position: relative;
    display: inline-flex;
  }
  select {
    appearance: none;
    -webkit-appearance: none;
    padding: 0 22px 0 8px;
    cursor: pointer;
  }
  .chevron {
    position: absolute;
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    font-size: 13px;
    color: var(--theme-generic-font-grayed);
    pointer-events: none;
  }

  @container (max-width: 760px) {
    .per-page-label,
    .export-label {
      display: none;
    }
  }
  @container (max-width: 600px) {
    .rows-word,
    .export {
      display: none;
    }
  }
</style>
