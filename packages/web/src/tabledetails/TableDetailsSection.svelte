<script lang="ts">
  import { onDestroy } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import FontIcon from '../icons/FontIcon.svelte';
  import SqlHighlighter from '../elements/SqlHighlighter.svelte';
  import { copyTextToClipboard } from '../utility/clipboard';
  import { getLocalStorage, setLocalStorage } from '../utility/storageCache';
  import { _t } from '../translations';

  export let id;
  export let title;
  export let count = null;
  export let sql = '';
  export let loading = false;
  export let error = null;
  export let emptyMessage = '';

  let collapsed = !!getLocalStorage(`tableDetails_collapsed_${id}`, false);
  let showSql = false;
  let copied = false;
  let copiedTimer = null;

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const slideParams = { duration: reducedMotion ? 0 : 180, easing: cubicOut };

  function toggle() {
    collapsed = !collapsed;
    setLocalStorage(`tableDetails_collapsed_${id}`, collapsed);
  }

  function copySql() {
    copyTextToClipboard(sql);
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1400);
  }

  onDestroy(() => clearTimeout(copiedTimer));
</script>

<section class="section" data-testid={`TableDetailsSection_${id}`}>
  <div class="header">
    <button
      class="toggle"
      aria-expanded={!collapsed}
      on:click={toggle}
      data-testid={`TableDetailsSection_toggle_${id}`}
    >
      <span class="chevron" class:collapsed><FontIcon icon="icon chevron-down" /></span>
      <span class="title">{title}</span>
      {#if count != null && !loading && !error}
        <span class="count">{count}</span>
      {/if}
    </button>
    <div class="header-extra"><slot name="header" /></div>
    {#if sql && !loading && !collapsed}
      <button
        class="sql-button"
        class:active={showSql}
        aria-pressed={showSql}
        title={_t('tableDetails.showSqlHint', { defaultMessage: 'Show the SQL definition' })}
        on:click={() => (showSql = !showSql)}
        data-testid={`TableDetailsSection_sql_${id}`}
      >
        <FontIcon icon="icon code" />
        SQL
      </button>
    {/if}
  </div>

  {#if !collapsed}
    <div class="body" transition:slide={slideParams}>
      {#if showSql && sql && !loading}
        <div class="code" transition:slide={slideParams}>
          <button
            class="copy"
            class:copied
            on:click={copySql}
            title={_t('tableDetails.copySql', { defaultMessage: 'Copy SQL' })}
            data-testid={`TableDetailsSection_copy_${id}`}
          >
            <FontIcon icon={copied ? 'icon check' : 'icon copy'} />
            {copied
              ? _t('tableDetails.copied', { defaultMessage: 'Copied' })
              : _t('tableDetails.copy', { defaultMessage: 'Copy' })}
          </button>
          <div class="code-scroll"><SqlHighlighter code={sql} /></div>
        </div>
      {/if}

      {#if loading}
        <div class="state">
          <span class="spinner"><FontIcon icon="icon loading" /></span>
          {_t('tableDetails.loading', { defaultMessage: 'Loading...' })}
        </div>
      {:else if error}
        <div class="state error">{error}</div>
      {:else if count === 0}
        <div class="state">{emptyMessage}</div>
      {:else}
        <slot name="before" />
        <div class="card"><slot /></div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .section {
    padding-top: 22px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    margin-bottom: 8px;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px 2px 2px;
    margin-left: -2px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    cursor: pointer;
    transition: background-color var(--dim-transition-fast);
  }
  .toggle:hover {
    background: var(--theme-ui-hover);
  }
  .toggle:focus-visible,
  .sql-button:focus-visible,
  .copy:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }

  .chevron {
    display: flex;
    width: 16px;
    justify-content: center;
    color: var(--theme-generic-font-grayed);
    transition: transform 180ms var(--dim-ease-out);
  }
  .chevron.collapsed {
    transform: rotate(-90deg);
  }

  .title {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .count {
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    box-sizing: border-box;
    border-radius: 9px;
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 18px;
    text-align: center;
  }

  .header-extra {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sql-button,
  .copy {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .sql-button:hover,
  .copy:hover {
    background: var(--theme-ui-hover);
    border-color: var(--theme-ui-border-strong);
    color: var(--theme-generic-font);
  }
  .sql-button.active {
    background: var(--theme-ui-accent-soft);
    border-color: transparent;
    color: var(--theme-ui-accent-strong);
  }

  .code {
    position: relative;
    margin-bottom: 10px;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-md);
    background: var(--theme-ui-bg);
    overflow: hidden;
  }
  .code-scroll {
    max-height: 340px;
    overflow: auto;
    padding: 10px 84px 10px 12px;
  }
  .code :global(pre) {
    margin: 0;
    padding: 0;
    background: transparent;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .copy {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--theme-ui-bg);
  }
  .copy.copied {
    color: var(--theme-generic-font-success);
  }

  .card {
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-lg);
    background: var(--theme-ui-bg);
    overflow: hidden;
  }

  .state {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border: 1px dashed var(--theme-ui-border);
    border-radius: var(--dim-radius-lg);
    color: var(--theme-generic-font-grayed);
  }
  .state.error {
    border-style: solid;
    border-color: color-mix(in srgb, var(--theme-generic-font-error) 40%, transparent);
    color: var(--theme-generic-font-error);
    white-space: pre-wrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron,
    .toggle,
    .sql-button,
    .copy {
      transition: none;
    }
  }
</style>
