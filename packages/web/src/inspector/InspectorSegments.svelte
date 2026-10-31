<script lang="ts">
  export let items: { id: string; label: string; title?: string; disabled?: boolean }[] = [];
  export let value;
  export let onSelect;

  $: index = items.findIndex(x => x.id == value);

  function handleKeyDown(e) {
    if (e.key != 'ArrowLeft' && e.key != 'ArrowRight') return;
    const enabled = items.filter(x => !x.disabled);
    const position = enabled.findIndex(x => x.id == value);
    const next = enabled[position + (e.key == 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    onSelect(next.id);
    e.currentTarget.querySelector(`[data-id="${next.id}"]`)?.focus();
  }
</script>

<!-- svelte-ignore a11y-interactive-supports-focus -->
<div
  class="segments"
  role="tablist"
  style={`--count:${items.length}; --index:${Math.max(index, 0)}`}
  on:keydown={handleKeyDown}
  data-testid={$$props['data-testid']}
>
  <span class="thumb" class:hidden={index < 0} aria-hidden="true" />
  {#each items as item (item.id)}
    <button
      class="segment"
      class:selected={item.id == value}
      role="tab"
      aria-selected={item.id == value}
      tabindex={item.id == value ? 0 : -1}
      disabled={item.disabled}
      title={item.title ?? item.label}
      data-id={item.id}
      on:click={() => onSelect(item.id)}
      data-testid={`TableInspector_section_${item.id}`}
    >
      {item.label}
    </button>
  {/each}
</div>

<style>
  .segments {
    position: relative;
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
    height: 28px;
    padding: 2px;
    box-sizing: border-box;
    border-radius: 8px;
    background: var(--theme-ui-hover);
    box-shadow: inset 0 0 0 0.5px var(--theme-ui-border);
  }
  .thumb {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc((100% - 4px) / var(--count));
    border-radius: 6px;
    background: var(--theme-ui-overlay);
    box-shadow:
      0 0 0 0.5px var(--theme-ui-border-strong),
      0 1px 3px color-mix(in srgb, #000 12%, transparent);
    transform: translateX(calc(var(--index) * 100%));
    transition: transform 320ms var(--dim-ease-spring);
  }
  .thumb.hidden {
    opacity: 0;
  }
  :global(.theme-type-dark) .thumb {
    background: var(--theme-ui-border-strong);
    box-shadow: 0 1px 3px color-mix(in srgb, #000 30%, transparent);
  }
  .segment {
    position: relative;
    z-index: 1;
    min-width: 0;
    padding: 0 6px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: color var(--dim-transition-fast);
  }
  .segment:hover:not(:disabled):not(.selected) {
    color: var(--theme-generic-font);
  }
  .segment.selected {
    color: var(--theme-generic-font);
    font-weight: 600;
  }
  .segment:disabled {
    color: var(--theme-ui-text-tertiary);
    opacity: 0.55;
    cursor: default;
  }
  .segment:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb {
      transition: none;
    }
  }
</style>
