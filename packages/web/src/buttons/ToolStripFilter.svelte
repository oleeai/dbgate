<script lang="ts">
  import _ from 'lodash';
  import FontIcon from '../icons/FontIcon.svelte';

  export let value = '';
  export let placeholder = 'Filter';
  export let onChange: (value: string) => void;

  let text = value || '';
  let focused = false;

  // follow changes made elsewhere (e.g. the filters panel) unless the user is typing here
  $: if (!focused) text = value || '';

  const applyDebounced = _.debounce(v => onChange(v || null), 400);

  function handleInput() {
    applyDebounced(text);
  }

  function handleKeyDown(e) {
    if (e.key == 'Enter') {
      applyDebounced.cancel();
      onChange(text || null);
    }
    if (e.key == 'Escape') {
      handleClear();
    }
  }

  function handleClear() {
    applyDebounced.cancel();
    text = '';
    onChange(null);
  }
</script>

<div class="filter" class:hasValue={!!text}>
  <span class="icon"><FontIcon icon="icon search" /></span>
  <input
    type="text"
    autocomplete="off"
    spellcheck="false"
    bind:value={text}
    {placeholder}
    on:input={handleInput}
    on:keydown={handleKeyDown}
    on:focus={() => (focused = true)}
    on:blur={() => (focused = false)}
    data-testid={$$props['data-testid']}
  />
  {#if text}
    <button class="clear" on:click={handleClear} title="Clear"><FontIcon icon="icon close" /></button>
  {/if}
</div>

<style>
  .filter {
    flex: 1 1 240px;
    max-width: 440px;
    min-width: 160px;
    display: flex;
    align-items: center;
    gap: var(--dim-tb-gap);
    height: var(--dim-tb-height);
    box-sizing: border-box;
    padding: 0 6px 0 8px;
    border: 1px solid transparent;
    border-radius: var(--dim-radius-sm);
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      box-shadow var(--dim-transition-fast);
  }
  .filter:hover {
    background: var(--theme-ui-hover);
  }
  .filter:focus-within,
  .filter.hasValue {
    background: var(--theme-input-background);
    border-color: var(--theme-input-border-focus-color);
  }
  .filter:focus-within {
    box-shadow: var(--theme-input-focus-ring);
  }
  .icon {
    display: flex;
    width: var(--dim-tb-icon);
    height: var(--dim-tb-icon);
    font-size: var(--dim-tb-icon);
    line-height: 1;
    color: var(--theme-generic-font-grayed);
  }
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    font-size: 12.5px;
  }
  input::placeholder {
    color: var(--theme-input-placeholder);
  }
  .clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font-size: 13px;
    cursor: pointer;
  }
  .clear:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
</style>
