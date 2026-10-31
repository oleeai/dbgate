<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';
  import { onDestroy, onMount } from 'svelte';
  import FormStyledButton from '../buttons/FormStyledButton.svelte';
  import { openedSnackbars } from '../stores';
  import { formatKeyText } from '../utility/common';
  import { popoverIn, popoverOut } from '../utility/motion';
  import { _t } from '../translations';

  export let message;
  export let id;
  export let icon = null;
  export let autoClose = false;
  export let allowClose = false;
  export let buttons = [];
  export let progressMessage = null;
  // 'center' = compact toast at the bottom center with one inline action
  export let placement = 'corner';
  export let action = null;
  export let timeout = 3000;

  let timer = null;
  let remaining = timeout;
  let startedAt = 0;
  let hovered = false;
  let focused = false;

  function handleClose() {
    openedSnackbars.update(x => x.filter(x => x.id != id));
  }

  function handleAction() {
    action?.onClick?.();
    handleClose();
  }

  function startTimer() {
    if (!autoClose || timer || hovered || focused) return;
    startedAt = Date.now();
    timer = setTimeout(handleClose, remaining);
  }

  // the countdown waits while the pointer or the focus is on the snackbar, then gives a moment to read on
  function pauseTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    remaining = Math.max(remaining - (Date.now() - startedAt), 1500);
  }

  function setHovered(value) {
    hovered = value;
    if (value) pauseTimer();
    else startTimer();
  }

  function setFocused(value) {
    focused = value;
    if (value) pauseTimer();
    else startTimer();
  }

  onMount(startTimer);
  onDestroy(() => clearTimeout(timer));
</script>

{#if placement == 'center'}
  <div
    class="toast"
    role="status"
    aria-live="polite"
    in:popoverIn|global={{ rise: 12 }}
    out:popoverOut|global={{ rise: 12 }}
    on:mouseenter={() => setHovered(true)}
    on:mouseleave={() => setHovered(false)}
    on:focusin={() => setFocused(true)}
    on:focusout={() => setFocused(false)}
    data-testid="Snackbar_toast"
  >
    {#if icon}
      <span class="toast-icon"><FontIcon {icon} /></span>
    {/if}
    <span class="toast-message" title={message}>{message}</span>
    {#if action}
      <button class="toast-action" on:click={handleAction} data-testid="Snackbar_toastAction">
        {action.label}
        {#if action.keyText}
          <kbd class="toast-keycap">{formatKeyText(action.keyText).replace(/ /g, '')}</kbd>
        {/if}
      </button>
    {/if}
    {#if allowClose}
      <button
        class="toast-close"
        title={_t('common.close', { defaultMessage: 'Close' })}
        aria-label={_t('common.close', { defaultMessage: 'Close' })}
        on:click={handleClose}
        data-testid="Snackbar_toastClose"
      >
        <FontIcon icon="icon close" />
      </button>
    {/if}
  </div>
{:else}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="wrapper"
    in:popoverIn|global={{ rise: 8 }}
    out:popoverOut|global={{ rise: 8 }}
    on:mouseenter={() => setHovered(true)}
    on:mouseleave={() => setHovered(false)}
  >
    <div class="message">
      <FontIcon {icon} />
      {message}
    </div>
    {#if progressMessage}
      <div class="progress-message">
        {progressMessage}
      </div>
    {/if}

    {#if allowClose}
      <div class="close" on:click={handleClose}>
        <FontIcon icon="icon close" />
      </div>
    {/if}

    {#if buttons?.length > 0}
      <div class="buttons">
        {#each buttons as button}
          <div class="button">
            <FormStyledButton
              value={button.label}
              on:click={() => {
                if (button.autoClose) {
                  handleClose();
                }
                button.onClick?.();
              }}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrapper {
    width: 400px;
    max-width: calc(100vw - 20px);
    box-sizing: border-box;
    border: var(--theme-modal-border);
    border-radius: var(--dim-radius-lg);
    box-shadow: var(--theme-popup-shadow);
    background-color: var(--theme-menu-background);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    margin: 10px;
    position: relative;
    padding: 4px;
  }

  .message {
    margin: 10px;
    margin-right: 28px;
  }

  .close {
    position: absolute;
    right: 8px;
    top: 8px;
    cursor: pointer;
    color: var(--theme-generic-font-grayed);
    transition: color var(--dim-transition-fast);
  }

  .close:hover {
    color: var(--theme-generic-font-hover);
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
  }

  .button {
    margin: 5px;
  }

  .progress-message {
    color: var(--theme-generic-font-grayed);
    margin: 10px;
    margin-left: 30px;
  }

  .toast {
    /* toasts share one spot, so a replaced toast fades out under the new one */
    grid-area: 1 / 1;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    max-width: min(560px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 4px 5px 4px 16px;
    border: var(--theme-modal-border);
    border-radius: 12px;
    box-shadow: var(--theme-popup-shadow);
    background: var(--theme-menu-background);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    color: var(--theme-generic-font);
    font-size: 13px;
  }

  .toast-icon {
    flex-shrink: 0;
    color: var(--theme-ui-text-secondary);
  }

  .toast-message {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toast-action {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    margin-left: 8px;
    padding: 0 10px;
    border: none;
    border-radius: var(--dim-radius-md);
    background: var(--theme-ui-hover);
    color: var(--theme-ui-accent-strong);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      transform var(--dim-transition-press);
  }
  .toast-action:hover {
    background: var(--theme-ui-active);
  }
  .toast-action:active {
    transform: scale(var(--dim-press-scale));
  }

  .toast-keycap {
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--theme-ui-text-tertiary);
  }

  .toast-close {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-tertiary);
    font-size: 14px;
    cursor: pointer;
    transition:
      background-color var(--dim-transition-fast),
      color var(--dim-transition-fast);
  }
  .toast-close:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }

  @media (prefers-reduced-transparency: reduce) {
    .wrapper,
    .toast {
      background: var(--theme-modal-background);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
</style>
