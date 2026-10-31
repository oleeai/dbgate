<script lang="ts">
  // Placeholder rows for a list that is still loading, shaped like the sidebar object list
  export let message = null;
  export let rowCount = 14;

  // fixed, varied name lengths so the placeholder doesn't jump between renders
  const WIDTHS = [62, 48, 74, 55, 68, 41, 58, 79, 50, 66, 45, 71, 53, 60];
</script>

<div class="skeleton" role="status" aria-busy="true" aria-label={message} data-testid="SkeletonList_container">
  {#if message}
    <div class="caption">{message}</div>
  {/if}
  <div class="group">
    <span class="bar group-bar" />
  </div>
  {#each Array(rowCount) as _, index}
    <div class="row">
      <span class="bar icon-bar" />
      <span class="bar name-bar" style={`width:${WIDTHS[index % WIDTHS.length]}%`} />
    </div>
  {/each}
</div>

<style>
  .skeleton {
    --skeleton-glint: color-mix(in srgb, var(--theme-ui-bg) 70%, transparent);
    padding: 4px 0 8px;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, #000 55%, transparent);
    -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent);
  }
  :global(.theme-type-dark) .skeleton {
    --skeleton-glint: color-mix(in srgb, var(--theme-ui-text) 9%, transparent);
  }

  .caption {
    padding: 2px 16px 8px;
    font-size: 11.5px;
    color: var(--theme-ui-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* a fast load never shows the caption */
    animation: skeleton-caption-in 240ms var(--dim-ease-out) 700ms both;
  }
  @keyframes skeleton-caption-in {
    from {
      opacity: 0;
    }
  }

  .group,
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    margin: 0 8px;
    padding: 0 8px;
  }
  .group {
    height: 26px;
  }

  .bar {
    display: block;
    flex-shrink: 0;
    border-radius: 4px;
    background-color: var(--theme-ui-active);
    background-image: linear-gradient(90deg, transparent 0, var(--skeleton-glint) 50%, transparent 100%);
    background-size: 160px 100%;
    background-repeat: no-repeat;
    background-position: -160px 0;
    animation: skeleton-sweep 1.8s var(--dim-ease-out) infinite;
  }
  .group-bar {
    width: 64px;
    height: 8px;
    opacity: 0.7;
  }
  .icon-bar {
    width: 14px;
    height: 14px;
    border-radius: 4px;
  }
  .name-bar {
    flex-shrink: 1;
    height: 9px;
    max-width: 220px;
  }

  @keyframes skeleton-sweep {
    to {
      background-position: 320px 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none;
      background-image: none;
    }
    .caption {
      animation: none;
    }
  }
</style>
