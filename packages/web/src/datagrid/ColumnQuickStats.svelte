<script lang="ts">
  import { onMount, tick } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import portal from '../utility/portal';
  import { loadColumnQuickStats } from './columnQuickStats';
  import ColumnQuickStatsView from './ColumnQuickStatsView.svelte';
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

  <ColumnQuickStatsView {driver} {stats} {errorMessage} {isLoading} />
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
</style>
