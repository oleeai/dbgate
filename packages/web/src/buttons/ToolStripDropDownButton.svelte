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
    // opens away from the window edge the toolbar sits at, so the menu grows out of the button
    if (rect.top < window.innerHeight / 2) {
      currentDropDownMenu.set({ left, top: rect.bottom, items: menu });
    } else {
      currentDropDownMenu.set({ left, bottom: window.innerHeight - rect.top, items: menu });
    }
  }
</script>

<svelte:component this={component} {title} {icon} iconAfter="icon chevron-down" on:click={handleClick} {...$$restProps}>
  {label}
</svelte:component>
