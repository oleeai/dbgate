<script lang="ts">
  import { getConnectionTags, getTagColor } from '../utility/connectionTags';

  export let connection;
  export let size: 'sm' | 'md' = 'sm';

  $: tags = getConnectionTags(connection);
</script>

{#if tags.length > 0}
  <span class="tags" class:md={size == 'md'} data-testid="ConnectionTags">
    {#each tags as tag (tag)}
      <span class="tag" style:--tag-color={getTagColor(tag)} title={tag}>{tag}</span>
    {/each}
  </span>
{/if}

<style>
  .tags {
    display: inline-flex;
    flex-shrink: 0;
    gap: 4px;
    min-width: 0;
  }
  .tag {
    display: inline-block;
    max-width: 96px;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 15px;
    letter-spacing: 0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: color-mix(in srgb, var(--tag-color) 72%, var(--theme-generic-font));
    background: color-mix(in srgb, var(--tag-color) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tag-color) 24%, transparent);
  }
  .tags.md .tag {
    font-size: 11px;
    line-height: 16px;
    padding: 1px 7px;
  }
</style>
