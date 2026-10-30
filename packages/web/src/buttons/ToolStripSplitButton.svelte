<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';

  export let disabled = false;
  export let icon = null;
  export let title = null;
  export let splitIcon = 'icon chevron-down';
  export let iconOnly = false;

  const dispatch = createEventDispatcher();

  function handleClick(e) {
    if (disabled) return;
    dispatch('click', { target: e.target });
  }
  function handleSplitClick(e) {
    if (disabled) return;
    dispatch('splitclick', { target: e.target });
  }
</script>

<div class="button" class:disabled {title}>
  <div class="inner" class:disabled>
    <div class="main" class:disabled class:iconOnly on:click={handleClick} data-testid={$$props['data-testid']}>
      <span class="icon" class:disabled><FontIcon {icon} /></span>
      {#if !iconOnly}
        <slot />
      {/if}
    </div>
    <span class="split-icon" class:disabled on:click={handleSplitClick}><FontIcon icon={splitIcon} /></span>
  </div>
</div>

<style>
  .button {
    color: var(--theme-toolstrip-button-foreground);
    border: 0;
    align-self: stretch;
    display: flex;
    align-items: center;
    user-select: none;
  }
  .button.disabled {
    opacity: 0.45;
  }
  .inner {
    display: flex;
    white-space: nowrap;
    align-self: center;
    cursor: pointer;
    transition: transform 100ms var(--dim-ease-out);
  }
  .inner:active:not(.disabled) {
    transform: scale(0.97);
  }
  .main,
  .split-icon {
    display: flex;
    align-items: center;
    height: var(--dim-tb-height);
    box-sizing: border-box;
    background: var(--theme-toolstrip-button-background);
    border: var(--theme-toolstrip-button-border);
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .main {
    gap: var(--dim-tb-gap);
    padding: 0 4px 0 var(--dim-tb-padding);
    border-right: none;
    border-radius: var(--dim-radius-sm) 0 0 var(--dim-radius-sm);
    font-size: 12.5px;
    font-weight: 500;
  }
  .main.iconOnly {
    padding: 0 2px 0 6px;
  }
  .split-icon {
    justify-content: center;
    width: 22px;
    border-left: var(--theme-toolstrip-button-split-separator-border);
    border-radius: 0 var(--dim-radius-sm) var(--dim-radius-sm) 0;
    font-size: var(--dim-tb-chevron);
    line-height: 1;
    color: var(--theme-toolstrip-button-foreground-icon);
    opacity: 0.85;
  }
  .main:hover:not(.disabled),
  .split-icon:hover:not(.disabled) {
    background: var(--theme-toolstrip-button-background-hover);
  }
  .main:active:hover:not(.disabled),
  .split-icon:active:hover:not(.disabled) {
    background: var(--theme-toolstrip-button-background-active);
  }
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--dim-tb-icon);
    height: var(--dim-tb-icon);
    font-size: var(--dim-tb-icon);
    line-height: 1;
    color: var(--theme-toolstrip-button-foreground-icon);
    transition: color var(--dim-transition-fast);
  }
  .main:hover:not(.disabled) .icon {
    color: var(--theme-toolstrip-button-foreground);
  }
</style>
