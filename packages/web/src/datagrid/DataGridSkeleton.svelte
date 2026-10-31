<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { dataGridRowHeight } from './DataGridRowHeightMeter.svelte';

  // Placeholder rows while the grid loads. Inside a rendered grid the rows line up with its real header
  // cells (measured from the DOM, so they follow any header style); without a grid yet (structure still
  // loading) a generic header is drawn too. With `append`, a few rows are added under the last loaded row.
  export let message = null;
  export let withHeader = false;
  export let append = false;

  const DEFAULT_CELLS = [40, 90, 160, 140, 180, 120, 150, 130].map((width, index, all) => ({
    left: all.slice(0, index).reduce((sum, x) => sum + x, 0),
    width,
  }));
  // fixed, varied value lengths so the placeholder doesn't jump between renders
  const FILL = [0.62, 0.45, 0.78, 0.55, 0.7, 0.38, 0.66, 0.5, 0.74, 0.58, 0.42, 0.69];
  const MAX_ROWS = 40;
  const APPEND_ROWS = 3;

  let domRoot;
  let cells = DEFAULT_CELLS;
  let top = 0;
  let height = 0;
  let observer: ResizeObserver = null;

  $: rowHeight = Math.max(18, $dataGridRowHeight || 24);
  $: headerHeight = withHeader ? rowHeight + 2 : 0;
  $: rowCount = append
    ? APPEND_ROWS
    : Math.min(MAX_ROWS, Math.max(6, Math.ceil((height - headerHeight) / rowHeight)));

  function measure() {
    const container = domRoot?.parentElement;
    const thead = withHeader ? null : container?.querySelector('thead');
    if (!thead) return;
    const base = container.getBoundingClientRect();
    // the row-number cell and the data columns (not eg. the add-column cell)
    const headerCells = Array.from(thead.querySelectorAll('tr:first-child > [data-col]')) as Element[];
    const measured = headerCells
      .map(cell => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left - base.left, width: rect.width };
      })
      .filter(cell => cell.width > 0 && cell.left < base.width);
    if (measured.length > 0) cells = measured;
    const lastRow = append ? container.querySelector('tbody tr:last-child') : null;
    top = (lastRow || thead).getBoundingClientRect().bottom - base.top;
  }

  function fillFor(row, col) {
    return FILL[(row * 7 + col * 3) % FILL.length];
  }

  onMount(() => {
    measure();
    const thead = domRoot?.parentElement?.querySelector('thead');
    if (thead && !withHeader && typeof ResizeObserver != 'undefined') {
      observer = new ResizeObserver(() => measure());
      observer.observe(thead);
    }
  });

  onDestroy(() => observer?.disconnect());
</script>

<div
  class="skeleton"
  class:with-header={withHeader}
  class:append
  style={`top:${top}px`}
  bind:this={domRoot}
  bind:clientHeight={height}
  role="status"
  aria-busy="true"
  aria-label={message}
  data-testid="DataGridSkeleton_container"
>
  <div class="rows">
    {#if withHeader}
      <div class="row header" style={`height:${headerHeight}px`}>
        {#each cells as cell, col}
          <span class="cell" style={`left:${cell.left}px; width:${cell.width}px`}>
            {#if col > 0}
              <span class="bar" style={`--x:${cell.left}px; width:${Math.round(cell.width * 0.5)}px`} />
            {/if}
          </span>
        {/each}
      </div>
    {/if}
    {#each Array(rowCount) as _, row}
      <div class="row" style={`height:${rowHeight}px`}>
        {#each cells as cell, col}
          <span class="cell" style={`left:${cell.left}px; width:${cell.width}px`}>
            {#if col == 0}
              <span class="bar number" style={`--x:${cell.left}px`} />
            {:else}
              <span
                class="bar"
                style={`--x:${cell.left}px; width:${Math.round((cell.width - 16) * fillFor(row, col))}px`}
              />
            {/if}
          </span>
        {/each}
      </div>
    {/each}
  </div>
  {#if message && !append}
    <div class="caption">{message}</div>
  {/if}
</div>

<style>
  .skeleton {
    --skeleton-glint: color-mix(in srgb, var(--theme-ui-bg) 70%, transparent);
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    overflow: hidden;
    pointer-events: none;
  }
  .skeleton.with-header {
    top: 0;
  }
  .skeleton.append {
    bottom: auto;
  }
  :global(.theme-type-dark) .skeleton {
    --skeleton-glint: color-mix(in srgb, var(--theme-ui-text) 9%, transparent);
  }

  .rows {
    mask-image: linear-gradient(to bottom, #000 45%, transparent);
    -webkit-mask-image: linear-gradient(to bottom, #000 45%, transparent);
  }
  .with-header .rows {
    height: 100%;
    background: var(--theme-datagrid-background);
  }
  .append .rows {
    mask-image: linear-gradient(to bottom, #000, transparent);
    -webkit-mask-image: linear-gradient(to bottom, #000, transparent);
  }

  .row {
    position: relative;
    box-sizing: border-box;
    border-bottom: 1px solid var(--theme-ui-border-subtle);
  }
  .row.header {
    background: var(--theme-datagrid-headercell-background);
    border-bottom-color: var(--theme-ui-border);
  }
  .cell {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    padding: 0 8px;
    box-sizing: border-box;
  }

  .bar {
    display: block;
    height: 8px;
    max-width: 100%;
    border-radius: 4px;
    background-color: var(--theme-ui-active);
    /* one wide glint shared by all bars: each bar shifts it by its own x, so the sweep crosses the grid in a line */
    background-image: linear-gradient(90deg, transparent 0, var(--skeleton-glint) 50%, transparent 100%);
    background-size: 280px 100%;
    background-repeat: no-repeat;
    background-position: calc(-280px - var(--x, 0px)) 0;
    animation: grid-skeleton-sweep 2s var(--dim-ease-out) infinite;
  }
  .bar.number {
    width: 14px;
    margin-left: auto;
    opacity: 0.6;
  }
  .header .bar {
    height: 9px;
    opacity: 0.85;
  }

  @keyframes grid-skeleton-sweep {
    to {
      background-position: calc(1600px - var(--x, 0px)) 0;
    }
  }

  .caption {
    position: absolute;
    left: 50%;
    top: 40%;
    transform: translateX(-50%);
    padding: 5px 12px;
    border: 1px solid var(--theme-ui-border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-ui-surface-2) 85%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--theme-ui-text-secondary);
    font-size: 11.5px;
    white-space: nowrap;
    /* a fast load never shows the caption */
    animation: grid-skeleton-caption-in 240ms var(--dim-ease-out) 900ms both;
  }
  @keyframes grid-skeleton-caption-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(2px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none;
      background-image: none;
    }
    .caption {
      animation: none;
    }
  }
</style>
