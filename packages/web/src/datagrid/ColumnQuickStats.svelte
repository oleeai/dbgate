<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { stringifyCellValue } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import portal from '../utility/portal';
  import { loadColumnQuickStats, QUICK_STATS_ROW_CAP } from './columnQuickStats';
  import { _t } from '../translations';

  export let conid;
  export let database;
  export let driver;
  export let column;
  // Element the popover hangs from (the column header)
  export let anchor;
  export let onClose;

  let domPopover;
  let popoverStyle = 'left:-9999px;top:0';
  let stats = null;
  let errorMessage = null;
  let isLoading = true;

  function placePopover() {
    if (!anchor || !domPopover) return;
    const rect = anchor.getBoundingClientRect();
    const width = domPopover.offsetWidth;
    const height = domPopover.offsetHeight;
    let left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    popoverStyle = `left:${left}px;top:${top}px`;
  }

  async function load() {
    isLoading = true;
    errorMessage = null;
    try {
      stats = await loadColumnQuickStats(conid, database, driver, column);
    } catch (err) {
      errorMessage = err?.message || String(err);
    }
    isLoading = false;
    await tick();
    placePopover();
  }

  function formatCount(value) {
    return value == null ? '—' : Number(value).toLocaleString();
  }

  // Same formatting as the grid cells, so decimals and dates read the same way
  function formatValue(value) {
    if (value == null) return '—';
    return stringifyCellValue(value, 'gridCellIntent', driver?.dataEditorTypesBehaviour).value;
  }

  $: nullPercent = stats?.totalRows > 0 ? (stats.nullCount / stats.totalRows) * 100 : null;
  $: nullPercentLabel =
    nullPercent == null ? '' : nullPercent > 0 && nullPercent < 0.1 ? '<0.1%' : `${nullPercent.toFixed(1)}%`;

  function handleWindowMouseDown(e) {
    if (!domPopover?.contains(e.target)) onClose();
  }

  function handleKeyDown(e) {
    if (e.key == 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  onMount(async () => {
    await tick();
    placePopover();
    domPopover?.focus();
    load();
  });
</script>

<svelte:window on:mousedown|capture={handleWindowMouseDown} on:resize={onClose} />

<div
  class="popover"
  role="dialog"
  tabindex="-1"
  aria-label={_t('columnStats.title', { defaultMessage: 'Quick stats' })}
  style={popoverStyle}
  bind:this={domPopover}
  use:portal
  on:keydown={handleKeyDown}
  data-testid="ColumnQuickStats_popover"
>
  <div class="header">
    <span class="header-icon"><FontIcon icon="mdi mdi-chart-box-outline" /></span>
    <div class="header-text">
      <span class="title">{column.columnName}</span>
      <span class="subtitle"
        >{_t('columnStats.title', { defaultMessage: 'Quick stats' })}{column.dataType
          ? ` · ${String(column.dataType).toLowerCase()}`
          : ''}</span
      >
    </div>
    <button class="close" on:click={onClose} title={_t('common.close', { defaultMessage: 'Close' })}>
      <FontIcon icon="icon close" />
    </button>
  </div>

  {#if errorMessage}
    <div class="error" data-testid="ColumnQuickStats_error">
      <FontIcon icon="img error" />
      <span>{errorMessage}</span>
    </div>
  {:else}
    <dl class="stats" class:loading={isLoading} aria-busy={isLoading}>
      <div class="stat">
        <dt>{_t('columnStats.rows', { defaultMessage: 'Rows' })}</dt>
        <dd data-testid="ColumnQuickStats_rows">
          {#if isLoading}<span class="skeleton" />{:else}{formatCount(stats.totalRows)}{stats.isCapped
              ? '+'
              : ''}{/if}
        </dd>
      </div>
      <div class="stat">
        <dt>{_t('columnStats.nulls', { defaultMessage: 'Null' })}</dt>
        <dd data-testid="ColumnQuickStats_nulls">
          {#if isLoading}<span class="skeleton" />{:else}{formatCount(stats.nullCount)}
            {#if nullPercentLabel}<span class="muted">{nullPercentLabel}</span>{/if}{/if}
        </dd>
      </div>
      {#if !isLoading && nullPercent != null}
        <div class="meter" aria-hidden="true">
          <span style={`width:${Math.min(100, Math.max(nullPercent, nullPercent > 0 ? 2 : 0))}%`} />
        </div>
      {/if}
      {#if isLoading || stats.distinctCount != null}
        <div class="stat">
          <dt>{_t('columnStats.distinct', { defaultMessage: 'Distinct' })}</dt>
          <dd data-testid="ColumnQuickStats_distinct">
            {#if isLoading}<span class="skeleton" />{:else}{formatCount(stats.distinctCount)}{/if}
          </dd>
        </div>
      {/if}
      {#if !isLoading && stats.hasRange}
        <div class="stat">
          <dt>{_t('columnStats.min', { defaultMessage: 'Min' })}</dt>
          <dd class="value" title={formatValue(stats.minValue)} data-testid="ColumnQuickStats_min">
            {formatValue(stats.minValue)}
          </dd>
        </div>
        <div class="stat">
          <dt>{_t('columnStats.max', { defaultMessage: 'Max' })}</dt>
          <dd class="value" title={formatValue(stats.maxValue)} data-testid="ColumnQuickStats_max">
            {formatValue(stats.maxValue)}
          </dd>
        </div>
      {/if}
    </dl>

    {#if !isLoading}
      <div class="footnote">
        {#if stats.isCapped}
          {_t('columnStats.cappedNote', {
            defaultMessage: 'From the first {count} rows',
            values: { count: QUICK_STATS_ROW_CAP.toLocaleString() },
          })}
        {:else}
          {_t('columnStats.wholeTableNote', { defaultMessage: 'Whole table, current filters ignored' })}
        {/if}
        {#if stats.partial}
          · {_t('columnStats.partialNote', { defaultMessage: 'distinct and range not available for this type' })}
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .popover {
    position: fixed;
    z-index: 1000;
    width: 264px;
    box-sizing: border-box;
    background: var(--theme-modal-background);
    border: var(--theme-modal-border);
    border-radius: 10px;
    box-shadow: var(--theme-popup-shadow);
    color: var(--theme-generic-font);
    font-size: 13px;
    outline: none;
    transform-origin: top left;
    animation: column-stats-in 160ms var(--dim-ease-spring);
  }

  @keyframes column-stats-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  @keyframes column-stats-fade {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .popover {
      animation: column-stats-fade 120ms linear;
    }
    .skeleton {
      animation: none !important;
    }
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 6px 8px 10px;
    border-bottom: var(--theme-modal-border);
  }
  .header-icon {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font-size: 16px;
    color: var(--theme-ui-accent-strong);
    background: var(--theme-ui-accent-soft);
  }
  .header-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .title {
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .close {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font-size: 14px;
    cursor: pointer;
  }
  .close:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }

  .stats {
    margin: 0;
    padding: 6px 12px 4px;
  }
  .stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
  }
  dt {
    flex-shrink: 0;
    color: var(--theme-generic-font-grayed);
  }
  dd {
    margin: 0;
    min-width: 0;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  dd.value {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted {
    margin-left: 4px;
    font-weight: 400;
    color: var(--theme-generic-font-grayed);
  }

  .meter {
    height: 4px;
    margin: 0 0 4px;
    border-radius: 2px;
    background: var(--theme-ui-hover);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--theme-ui-accent);
  }

  .skeleton {
    display: inline-block;
    width: 56px;
    height: 10px;
    border-radius: 4px;
    background: var(--theme-ui-active);
    animation: column-stats-pulse 1.1s ease-in-out infinite alternate;
  }
  @keyframes column-stats-pulse {
    to {
      opacity: 0.45;
    }
  }

  .footnote {
    padding: 6px 12px 9px;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }

  .error {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 12px 12px;
    font-size: 12px;
    color: var(--theme-generic-font-error);
    word-break: break-word;
  }
</style>
