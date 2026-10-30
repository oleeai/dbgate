<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';

  export let disabled = false;
  export let icon = null;
  export let title = null;
  export let iconAfter = null;
  // secondary | ghost | primary | destructive
  export let variant = 'secondary';
  export let iconOnly = false;
  export let active = false;

  const dispatch = createEventDispatcher();

  function handleClick(e) {
    if (disabled) return;
    dispatch('click', { target: e.target });
  }
</script>

<div class="button" class:disabled {title}>
  <div
    class={`inner ${variant}`}
    class:disabled
    class:iconOnly
    class:hasAfter={!!iconAfter && !iconOnly}
    class:active
    on:click={handleClick}
    data-testid={$$props['data-testid']}
  >
    {#if icon}
      <span class="icon" class:disabled><FontIcon {icon} /></span>
    {/if}
    {#if !iconOnly}
      <slot />
    {/if}
    {#if iconAfter && !iconOnly}
      <span class="icon after" class:disabled><FontIcon icon={iconAfter} /></span>
    {/if}
  </div>
</div>

<style>
  .button {
    display: flex;
    align-items: center;
    align-self: stretch;
    user-select: none;
  }
  .inner {
    display: flex;
    align-items: center;
    gap: var(--dim-tb-gap);
    height: var(--dim-tb-height);
    box-sizing: border-box;
    padding: 0 var(--dim-tb-padding);
    border: var(--theme-toolstrip-button-border);
    border-radius: var(--dim-radius-sm);
    background: var(--theme-toolstrip-button-background);
    color: var(--theme-toolstrip-button-foreground);
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      color var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }
  .inner:hover:not(.disabled) {
    background: var(--theme-toolstrip-button-background-hover);
    border: var(--theme-toolstrip-button-border-hover);
  }
  .inner:active:not(.disabled) {
    transform: scale(0.97);
  }
  .inner.hasAfter {
    padding-right: 6px;
  }
  .inner.iconOnly {
    width: var(--dim-tb-height);
    padding: 0;
    justify-content: center;
  }
  .inner.active {
    background: var(--theme-toolstrip-button-background-active);
    border: var(--theme-toolstrip-button-border-hover);
  }
  .inner.ghost {
    border-color: transparent;
    background: transparent;
  }
  .inner.ghost:hover:not(.disabled) {
    border-color: transparent;
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
  .inner:hover:not(.disabled) .icon,
  .inner.active .icon {
    color: var(--theme-toolstrip-button-foreground);
  }
  .icon.after {
    width: var(--dim-tb-chevron);
    height: var(--dim-tb-chevron);
    font-size: var(--dim-tb-chevron);
    margin-left: -2px;
    opacity: 0.6;
  }

  .inner.primary {
    border-color: var(--theme-ui-accent);
    background: var(--theme-ui-accent);
    color: var(--theme-ui-accent-contrast);
    box-shadow: 0 1px 2px color-mix(in srgb, #000 10%, transparent);
  }
  .inner.primary:hover:not(.disabled) {
    border: 1px solid var(--theme-ui-accent-hover);
    background: var(--theme-ui-accent-hover);
  }
  .inner.primary .icon,
  .inner.primary:hover:not(.disabled) .icon {
    color: var(--theme-ui-accent-contrast);
  }

  .inner.destructive:hover:not(.disabled) {
    background: color-mix(in srgb, var(--theme-generic-font-error) 12%, transparent);
    color: var(--theme-generic-font-error);
  }
  .inner.destructive:hover:not(.disabled) .icon {
    color: var(--theme-generic-font-error);
  }

  .disabled {
    opacity: 0.45;
    cursor: default;
  }
  .icon.disabled {
    opacity: 1;
  }
</style>
