<script lang="ts">
  import { onMount, tick } from 'svelte';

  // How many steps the toolbar can fold away. The slot gets the current step as `level`
  // and decides what each step hides (into a "more" menu) or shrinks.
  export let maxLevel = 0;

  let level = 0;
  // still too wide with everything folded: let it take a second line rather than cut anything off
  let wrapped = false;
  let domBar: HTMLElement;
  let domRuler: HTMLElement;
  let fitting = false;
  let fitAgain = false;
  let lastWidth = -1;
  let mutationObserver: MutationObserver = null;

  function overflows() {
    return domBar.scrollWidth > domBar.clientWidth + 1;
  }

  // Runs in microtasks before the next paint, so the steps in between are never shown.
  // fromStart: unfold everything first (the bar got wider or its content changed).
  async function fit(fromStart: boolean) {
    if (!domBar) return;
    if (fitting) {
      fitAgain = true;
      return;
    }
    fitting = true;
    const focusedId = domBar.contains(document.activeElement)
      ? document.activeElement.getAttribute('data-testid')
      : null;
    try {
      if (fromStart && (level > 0 || wrapped)) {
        level = 0;
        wrapped = false;
        await tick();
      }
      while (domBar && level < maxLevel && overflows()) {
        level += 1;
        await tick();
      }
      if (domBar && !wrapped && overflows()) {
        wrapped = true;
        await tick();
      }
    } finally {
      // our own re-render is not a content change
      mutationObserver?.takeRecords();
      fitting = false;
    }
    if (focusedId && domBar && !domBar.contains(document.activeElement)) {
      (domBar.querySelector(`[data-testid="${focusedId}"]`) as HTMLElement)?.focus();
    }
    if (fitAgain) {
      fitAgain = false;
      fit(true);
    }
  }

  onMount(() => {
    // the ruler has the bar's width and no height, so folding never resizes what is observed
    const resizeObserver = new ResizeObserver(entries => {
      const width = entries[entries.length - 1].contentRect.width;
      if (width == lastWidth) return;
      const grew = width > lastWidth;
      lastWidth = width;
      fit(grew);
    });
    resizeObserver.observe(domRuler);

    // buttons that show up later (hideDisabled commands, a pending Save) can make it overflow;
    // parts marked data-fit-ignore (a filter field typing chips) keep their width, so they don't count
    mutationObserver = new MutationObserver(records => {
      if (fitting) return;
      const counts = records.some(record => {
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        return !element?.closest('[data-fit-ignore]');
      });
      if (counts) fit(true);
    });
    mutationObserver.observe(domBar, { childList: true, subtree: true, characterData: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      mutationObserver = null;
    };
  });
</script>

<div class="bar" class:wrapped bind:this={domBar} data-testid="ToolStripFit_bar">
  <div class="ruler" bind:this={domRuler} />
  <slot {level} />
</div>

<style>
  .bar {
    position: relative;
    flex: 1 1 0;
    /* no min-content width of its own, so the tab can get narrower than the full toolbar */
    width: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bar.wrapped {
    flex-wrap: wrap;
    row-gap: 6px;
    padding: 6px 0;
  }
  .ruler {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 0;
    visibility: hidden;
    pointer-events: none;
  }
</style>
