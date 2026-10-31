<script lang="ts">
  import { getConnectionLabel } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import { useConnectionInfo } from '../utility/metadataLoaders';
  import { describeConnectionProblem, reopenConnection } from '../utility/connectionProblem';
  import { _t } from '../translations';

  export let conid;
  export let database = null;
  // the raw error from the driver or the SSH tunnel, shown under Details
  export let message;
  // custom "Try again"; by default the connection is reopened
  export let onRetry = null;
  // a reconnect is in progress (eg. the connection status is pending again)
  export let busy = false;
  // narrow layout for the sidebar
  export let compact = false;

  let retrying = false;
  let detailsOpen = false;
  const detailsId = `offline-details-${Math.random().toString(36).slice(2)}`;

  // while reconnecting the status has no message; the card keeps telling what failed last time
  let lastMessage = null;
  $: if (message) lastMessage = message;
  $: shownMessage = message || lastMessage;

  $: connection = useConnectionInfo({ conid });
  $: problem = describeConnectionProblem(shownMessage);
  $: name = $connection ? getConnectionLabel($connection, { allowExplicitDatabase: false }) : database || conid;
  $: title =
    problem.kind == 'auth' || problem.kind == 'sshAuth'
      ? _t('connectionProblem.titleSignIn', { defaultMessage: "Can't sign in to {name}", values: { name } })
      : problem.kind == 'unknown'
        ? _t('connectionProblem.titleOpen', { defaultMessage: "Couldn't open {name}", values: { name } })
        : _t('connectionProblem.title', { defaultMessage: "Can't reach {name}", values: { name } });
  $: isBusy = busy || retrying;

  async function handleRetry() {
    if (isBusy) return;
    retrying = true;
    const started = Date.now();
    try {
      if (onRetry) await onRetry();
      else await reopenConnection(conid, database, $connection);
    } finally {
      // the status turns to pending a moment later; hold the busy look so the button doesn't blink back
      const rest = 1500 - (Date.now() - started);
      if (rest > 0) await new Promise(resolve => setTimeout(resolve, rest));
      retrying = false;
    }
  }
</script>

<div class="card" class:compact role="status" data-testid="ConnectionOfflineCard_container">
  <div class="symbol">
    <FontIcon icon={problem.icon} />
    <span class="badge" />
  </div>
  <div class="title" data-testid="ConnectionOfflineCard_title">{title}</div>
  <div class="reason">{problem.reason}</div>

  <div class="actions">
    <button
      class="retry"
      class:busy={isBusy}
      aria-disabled={isBusy}
      on:click={handleRetry}
      data-testid="ConnectionOfflineCard_retry"
    >
      {#if isBusy}
        <FontIcon icon="icon loading" />
        <span>{_t('connectionProblem.connecting', { defaultMessage: 'Connecting…' })}</span>
      {:else}
        <FontIcon icon="icon refresh" />
        <span>{_t('connectionProblem.tryAgain', { defaultMessage: 'Try again' })}</span>
      {/if}
    </button>
    {#if shownMessage}
      <button
        class="disclosure"
        class:open={detailsOpen}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        on:click={() => (detailsOpen = !detailsOpen)}
        data-testid="ConnectionOfflineCard_details"
      >
        <span>{_t('connectionProblem.details', { defaultMessage: 'Details' })}</span>
        <span class="chevron"><FontIcon icon="icon chevron-down" /></span>
      </button>
    {/if}
  </div>

  {#if shownMessage}
    <div class="details" class:open={detailsOpen} id={detailsId} inert={!detailsOpen}>
      <div class="details-inner">
        <div class="raw" data-testid="ConnectionOfflineCard_detailsText">{shownMessage}</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 360px;
    padding: 24px 22px 16px;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-lg);
    background: color-mix(in srgb, var(--theme-ui-surface-2) 78%, transparent);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--theme-ui-text) 6%, transparent);
    color: var(--theme-generic-font);
    text-align: center;
    animation: offline-card-in 280ms var(--dim-ease-spring);
  }
  .card.compact {
    max-width: none;
    padding: 18px 14px 12px;
  }

  @keyframes offline-card-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.985);
    }
  }

  .symbol {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin-bottom: 12px;
    border-radius: 50%;
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
    font-size: 22px;
  }
  .compact .symbol {
    width: 38px;
    height: 38px;
    margin-bottom: 10px;
    font-size: 19px;
  }
  .badge {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--theme-generic-font-error);
    box-shadow: 0 0 0 2px var(--theme-ui-surface-2);
  }

  .title {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .reason {
    margin-top: 4px;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--theme-ui-text-secondary);
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
  }

  .retry {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 116px;
    height: 28px;
    padding: 0 14px;
    border: none;
    border-radius: var(--dim-radius-md);
    background: var(--theme-ui-accent);
    color: var(--theme-ui-accent-contrast);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      opacity var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }
  .retry:hover {
    background: var(--theme-ui-accent-hover);
  }
  .retry:active {
    background: var(--theme-ui-accent-active);
    transform: scale(0.97);
  }
  .retry:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }
  .retry.busy {
    opacity: 0.8;
    cursor: default;
  }
  .retry.busy:hover,
  .retry.busy:active {
    background: var(--theme-ui-accent);
    transform: none;
  }

  .disclosure {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 22px;
    padding: 0 6px 0 8px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-tertiary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .disclosure:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
  }
  .disclosure:focus-visible {
    outline: none;
    box-shadow: var(--theme-input-focus-ring);
  }
  .chevron {
    display: inline-flex;
    font-size: 14px;
    transition: transform 240ms var(--dim-ease-spring);
  }
  .disclosure.open .chevron {
    transform: rotate(180deg);
  }

  /* grid rows 0fr -> 1fr: the height follows the content and a second click reverses from where it is */
  .details {
    display: grid;
    grid-template-rows: 0fr;
    width: 100%;
    opacity: 0;
    transition:
      grid-template-rows 260ms var(--dim-ease-spring),
      opacity 180ms var(--dim-ease-out);
  }
  .details.open {
    grid-template-rows: 1fr;
    opacity: 1;
  }
  .details-inner {
    min-height: 0;
    overflow: hidden;
  }
  .raw {
    box-sizing: border-box;
    margin-top: 8px;
    max-height: 140px;
    overflow: auto;
    padding: 8px 10px;
    border: 1px solid var(--theme-ui-border-subtle);
    border-radius: var(--dim-radius-sm);
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.45;
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
    cursor: text;
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
    .retry,
    .chevron,
    .details {
      transition: none;
    }
    .retry:active {
      transform: none;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .card {
      background: var(--theme-ui-surface-2);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
</style>
