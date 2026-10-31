<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import { currentDropDownMenu } from '../stores';

  export let icon = null;
  export let title = null;
  export let disabled = false;
  // a toggle that is on, e.g. an open side panel
  export let active = false;
  // the label stays in the DOM (screen readers, text selectors), it is just not shown
  export let iconOnly = true;
  // quiet | destructive
  export let variant = 'quiet';
  // menu items, or a function returning them; the whole button opens the menu, or only the chevron with split
  export let menu = null;
  export let split = false;
  export let menuTitle = null;
  export let showChevron = true;

  const dispatch = createEventDispatcher();
  let domWrap;

  $: opensMenu = !!menu && !split;

  function openMenu() {
    if (disabled) return;
    const rect = domWrap.getBoundingClientRect();
    currentDropDownMenu.set({ left: rect.left, top: rect.bottom + 4, items: menu });
  }

  function handleClick(e) {
    if (disabled) return;
    if (opensMenu) {
      openMenu();
      return;
    }
    dispatch('click', { target: e.currentTarget });
  }
</script>

<span class="wrap" class:split={menu && split} bind:this={domWrap}>
  <button
    type="button"
    class={`button ${variant}`}
    class:active
    class:iconOnly
    class:opensMenu={opensMenu && showChevron}
    {disabled}
    {title}
    aria-pressed={active ? 'true' : undefined}
    aria-haspopup={opensMenu ? 'menu' : undefined}
    on:mousedown|preventDefault
    on:click={handleClick}
    data-testid={$$props['data-testid']}
  >
    {#if icon}
      <span class="icon"><FontIcon {icon} /></span>
    {/if}
    <span class="label" class:hidden={iconOnly}><slot /></span>
    {#if opensMenu && showChevron}
      <span class="chevron"><FontIcon icon="icon chevron-down" /></span>
    {/if}
  </button>
  {#if menu && split}
    <button
      type="button"
      class="button menu-part"
      {disabled}
      title={menuTitle}
      aria-label={menuTitle}
      aria-haspopup="menu"
      on:mousedown|preventDefault
      on:click={openMenu}
      data-testid={$$props['data-testid'] ? `${$$props['data-testid']}_menu` : undefined}
    >
      <FontIcon icon="icon chevron-down" />
    </button>
  {/if}
</span>

<style>
  .wrap {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: var(--dim-tb-height);
    min-width: var(--dim-tb-height);
    box-sizing: border-box;
    padding: 0 8px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-toolstrip-button-foreground-icon);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }
  .button.iconOnly {
    padding: 0;
  }
  .button.iconOnly.opensMenu {
    padding: 0 2px 0 6px;
    gap: 1px;
  }
  .button:hover:not(:disabled),
  .split:hover .button:not(:disabled) {
    background: var(--theme-ui-hover);
    color: var(--theme-toolstrip-button-foreground);
  }
  .button:active:not(:disabled) {
    background: var(--theme-ui-active);
    transform: scale(0.94);
  }
  .button.active,
  .split:hover .button.active:not(:disabled) {
    background: var(--theme-ui-active);
    color: var(--theme-toolstrip-button-foreground);
  }
  .button:focus-visible {
    outline: var(--theme-focus-outline);
    outline-offset: -1px;
  }
  .button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .button.destructive:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-generic-font-error) 12%, transparent);
    color: var(--theme-generic-font-error);
  }

  .split .button:first-child {
    border-radius: var(--dim-radius-sm) 0 0 var(--dim-radius-sm);
  }
  .split .button:first-child:not(.iconOnly) {
    padding-right: 4px;
  }
  .split .button.iconOnly:first-child {
    min-width: 0;
    width: 24px;
    padding-left: 2px;
  }
  .menu-part {
    width: 15px;
    min-width: 15px;
    padding: 0;
    border-radius: 0 var(--dim-radius-sm) var(--dim-radius-sm) 0;
    font-size: 12px;
  }
  .split .button:active:not(:disabled) {
    transform: none;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--dim-tb-icon);
    height: var(--dim-tb-icon);
    font-size: var(--dim-tb-icon);
    line-height: 1;
  }
  .chevron {
    display: flex;
    font-size: 12px;
    line-height: 1;
    opacity: 0.7;
  }
  .label.hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .button {
      transition: none;
    }
    .button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
