<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let type = 'button';
  export let disabled = false;
  export let value;
  export let title = null;
  export let skipWidth = false;
  export let outline = false;
  export let colorClass = '';

  function handleClick() {
    if (!disabled) dispatch('click');
  }

  let domButton;

  export function getBoundingClientRect() {
    return domButton.getBoundingClientRect();
  }
</script>

<input
  {type}
  {value}
  {title}
  class:disabled
  {...$$restProps}
  on:click={handleClick}
  bind:this={domButton}
  class:skipWidth
  class:outline
  class={colorClass}
  class:setBackgroundColor={!colorClass}
/>

<style>
  input {
    border: var(--theme-formbutton-border);
    padding: 6px 14px;
    margin: 2px;
    color: var(--theme-formbutton-foreground);
    border-radius: var(--dim-radius-md);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    letter-spacing: -0.005em;
    white-space: nowrap;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      color var(--dim-transition-fast),
      box-shadow var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }

  input:active:not(.disabled) {
    transform: scale(0.98);
  }

  .setBackgroundColor {
    background: var(--theme-formbutton-background);
    box-shadow: var(--theme-formbutton-shadow);
  }

  input:not(.skipWidth) {
    min-width: 100px;
  }

  input.setBackgroundColor:hover:not(.disabled):not(.outline) {
    background: var(--theme-formbutton-background-hover);
    border: var(--theme-formbutton-border-hover)
  }
  input.setBackgroundColor:active:not(.disabled):not(.outline) {
    background: var(--theme-formbutton-background-active);
    border: var(--theme-formbutton-border-active);
  }
  input.disabled {
    background: var(--theme-formbutton-background-disabled);
    color: var(--theme-formbutton-foreground-disabled);
    border: var(--theme-formbutton-border-disabled);
    cursor: not-allowed;
  }

  input.outline {
    background-color: var(--theme-outlinebutton-background);
    color: var(--theme-outlinebutton-foreground);
    border: var(--theme-outlinebutton-border);
  }

  input.outline:hover:not(.disabled) {
    background-color: var(--theme-outlinebutton-hover-background);
    color: var(--theme-outlinebutton-hover-foreground);
    border: var(--theme-outlinebutton-hover-border);
  }
</style>
