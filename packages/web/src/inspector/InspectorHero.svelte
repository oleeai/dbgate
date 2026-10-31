<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';

  export let icon;
  export let title;
  export let titleHint = null;
  export let subtitle = null;
</script>

<header class="hero" data-testid={$$props['data-testid']}>
  <span class="hero-icon"><FontIcon {icon} /></span>
  <div class="hero-text">
    <div class="title-row">
      <span class="title" title={titleHint ?? title}>{title}</span>
      <slot name="chips" />
    </div>
    {#if subtitle || $$slots.subtitle}
      <div class="subtitle">
        <slot name="subtitle">{subtitle}</slot>
      </div>
    {/if}
  </div>
  {#if $$slots.trailing}
    <div class="trailing"><slot name="trailing" /></div>
  {/if}
</header>

<style>
  .hero {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 12px 12px 16px;
  }
  .hero-icon {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--theme-ui-accent-strong);
    background: var(--theme-ui-accent-soft);
  }
  .hero-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 1px;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .title {
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--theme-generic-font-grayed);
  }
  .trailing {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 1px;
  }
</style>
