<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';

  export let icon = 'icon form';
  export let secondary = false;
</script>

<div
  on:click|stopPropagation|preventDefault
  on:mousedown|stopPropagation|preventDefault
  on:mouseup|stopPropagation|preventDefault
  class="showFormButtonMarker"
  class:secondary
>
  <FontIcon {icon} />
</div>

<style>
  div {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--dim-radius-sm);
    color: var(--theme-generic-font-grayed);
    background-color: var(--theme-toolstrip-button-background-hover);
    transition:
      opacity var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }

  .secondary {
    margin-right: 20px;
  }

  div:hover {
    color: var(--theme-generic-font);
    cursor: pointer;
  }
</style>
