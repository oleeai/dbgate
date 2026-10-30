<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';

  export let noMargin = false;
  export let altsearchbox = false;
  export let filter = null;
  export let fillFlex = false;
</script>

<div class="search-box-wrapper" class:useMargin={!noMargin} class:altsearchbox class:hasFilter={!!filter} class:fillFlex>
  <span class="search-icon"><FontIcon icon="icon search" /></span>
  <slot />
</div>

<style>
  div {
    display: flex;
    align-items: center;
    border-bottom: var(--theme-searchbox-border);
    background-color: var(--theme-searchbox-background);
    border: var(--theme-searchbox-border);
    transition:
      border-color var(--dim-transition-fast),
      box-shadow var(--dim-transition-fast);
  }

  div.altsearchbox {
    background-color: var(--theme-altsearchbox-background);
    border: var(--theme-altsearchbox-border);
  }

  div:focus-within {
    border-color: var(--theme-input-border-focus-color);
    background-color: var(--theme-input-background);
  }

  .search-icon {
    display: flex;
    padding-left: 8px;
    font-size: 14px;
    color: var(--theme-searchbox-placeholder);
  }

  div.useMargin {
    border-radius: 7px;
    margin: 6px 10px;
    min-height: 28px;
    overflow: hidden;
  }

  div.useMargin:focus-within {
    box-shadow: var(--theme-input-focus-ring);
  }
  div.hasFilter {
    background-color: var(--theme-searchbox-background-filtered);
  }

  .fillFlex {
    flex: 1;
  }
</style>
