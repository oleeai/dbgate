<script lang="ts">

  import { currentDropDownMenu } from '../stores';

  import ToolStripButton from './ToolStripButton.svelte';

  export let menu;
  export let title = undefined;
  export let label;
  export let icon;
  export let component = ToolStripButton;

  function handleClick(e) {
    const rect = e.detail.target.getBoundingClientRect();
    const left = rect.left;
    const top = rect.top;
    // const top = rect.bottom;
    currentDropDownMenu.set({ left, bottom: window.innerHeight - top, items: menu });
  }
</script>

<svelte:component this={component} {title} {icon} iconAfter="icon chevron-down" on:click={handleClick} {...$$restProps}>
  {label}
</svelte:component>
