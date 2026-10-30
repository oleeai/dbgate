<script lang="ts">
  export let checked = false;
  export let label;
  export let hint = null;
  export let disabled = false;
</script>

<label class="row" class:disabled>
  <span class="text">
    <span class="label">{label}</span>
    {#if hint}
      <span class="hint">{hint}</span>
    {/if}
  </span>
  <button
    type="button"
    role="switch"
    class="switch"
    aria-checked={checked}
    {disabled}
    on:click={() => (checked = !checked)}
    data-testid={$$props['data-testid']}
  >
    <span class="knob" />
  </button>
</label>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    cursor: pointer;
  }
  .row.disabled {
    cursor: default;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .label {
    font-weight: 500;
  }
  .row.disabled .label {
    color: var(--theme-generic-font-grayed);
  }
  .hint {
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }

  .switch {
    position: relative;
    flex-shrink: 0;
    width: 34px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: var(--theme-ui-border-strong);
    cursor: pointer;
    transition: background-color var(--dim-transition-fast);
  }
  .switch[aria-checked='true'] {
    background: var(--theme-ui-accent);
  }
  .switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    transition: transform 180ms var(--dim-ease-spring);
  }
  .switch[aria-checked='true'] .knob {
    transform: translateX(14px);
  }

  @media (prefers-reduced-motion: reduce) {
    .knob {
      transition: none;
    }
  }
</style>
