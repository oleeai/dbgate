<script lang="ts">
  /** Small line icons for the table cards, drawn with currentColor so they follow the theme. */
  export let name: 'table' | 'key' | 'link';
  export let size = 12;
</script>

<svg
  class="erd-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name == 'table'}
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M9.5 9.5V20" />
  {:else if name == 'key'}
    <circle cx="8" cy="15.5" r="4.5" />
    <path d="M11.3 12.2 20.5 3M16.5 7l2.75 2.75M19 4.5l2.25 2.25" />
  {:else if name == 'link'}
    <path d="M9.5 16.5H7.5a4.5 4.5 0 0 1 0-9h2M14.5 7.5h2a4.5 4.5 0 0 1 0 9h-2M8.5 12h7" />
  {/if}
</svg>

<style>
  .erd-icon {
    display: block;
    flex-shrink: 0;
  }
</style>
