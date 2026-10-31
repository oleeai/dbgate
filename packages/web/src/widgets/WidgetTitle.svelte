<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';

  export let clickable = false;
  export let onClose = null;
  export let altsidebar = false;
  export let collapsed = false;
  // folds the whole side panel away (not just this section)
  export let onFold = null;
  export let foldTitle = null;
</script>

<div on:click class:clickable {...$$restProps} class="wrapper" class:altsidebar>
  <div class="title-content">
    {#if clickable}
      <FontIcon icon={collapsed ? "icon chevron-right" : "icon chevron-down"} />
    {/if}
    <slot />
  </div>
  {#if onFold}
    <button
      type="button"
      class="fold"
      title={foldTitle}
      aria-label={foldTitle}
      on:click|stopPropagation={onFold}
      data-testid="WidgetTitle_fold"
    >
      <FontIcon icon="icon dock-left" />
    </button>
  {/if}
  {#if onClose}
    <div class="close" on:click={onClose}>
      <FontIcon icon="icon close" />
    </div>
  {/if}
</div>

<style>
  .wrapper {
    height: 27px;
    box-sizing: border-box;
    padding: 0 14px;
    font-weight: 600;
    font-size: 11.5px;
    background-color: var(--theme-sidebar-section-background);
    border: var(--theme-sidebar-section-border);
    border-top: var(--theme-sidebar-section-border-top);
    color: var(--theme-sidebar-section-foreground);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .wrapper.altsidebar {
    background-color: var(--theme-altsidebar-section-background);
    border: var(--theme-altsidebar-section-border);
    border-top: var(--theme-altsidebar-section-border-top);
    color: var(--theme-altsidebar-section-foreground);
  }

  .title-content {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .close {
    cursor: pointer;
  }

  .fold {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin-right: -6px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: none;
    color: var(--theme-generic-font-grayed);
    font-size: 14px;
    cursor: pointer;
    transition:
      background-color 80ms ease,
      color 80ms ease;
  }
  .fold:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }
  .fold:active {
    transform: scale(0.92);
  }
  .fold:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }
  .close:hover {
    color: var(--theme-generic-font-hover);
  }
  div.clickable {
    cursor: pointer;
  }
</style>
