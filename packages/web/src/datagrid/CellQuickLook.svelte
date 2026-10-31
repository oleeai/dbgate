<script lang="ts" context="module">
  const GAP = 6;
  const MARGIN = 8;
  const NAVIGATION_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];

  const KIND_ICONS = {
    null: 'mdi mdi-null',
    missing: 'mdi mdi-null',
    boolean: 'mdi mdi-toggle-switch-outline',
    number: 'mdi mdi-pound',
    json: 'mdi mdi-code-json',
    uuid: 'mdi mdi-identifier',
    binary: 'mdi mdi-hexadecimal',
    date: 'mdi mdi-calendar-blank-outline',
    datetime: 'mdi mdi-calendar-clock',
    time: 'mdi mdi-clock-outline',
    text: 'mdi mdi-text-long',
  };

  function prefersReducedMotion() {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  // a critically damped spring (no overshoot) that settles at the end of the duration
  function springEasing(t) {
    const k = 6.6;
    return (1 - (1 + k * t) * Math.exp(-k * t)) / (1 - (1 + k) * Math.exp(-k));
  }

  // grows out of the cell; a reversed run (closing while opening) continues from where it is
  function materialize(node) {
    if (prefersReducedMotion()) {
      // a plain dissolve; it runs per frame because the app's reduced-motion rule cuts CSS animations short
      return {
        duration: 140,
        tick: t => {
          node.style.opacity = String(t);
        },
      };
    }
    return {
      duration: 280,
      easing: springEasing,
      css: (t, u) =>
        `opacity: ${Math.min(1, t * 1.6)}; transform: scale(${0.9 + 0.1 * t}); filter: blur(${(u * 6).toFixed(2)}px)`,
    };
  }
</script>

<script lang="ts">
  import _ from 'lodash';
  import { getContext, onDestroy } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import { _t } from '../translations';
  import { copyTextToClipboard } from '../utility/clipboard';
  import portal from '../utility/portal';
  import QuickLookJsonNode from './QuickLookJsonNode.svelte';
  import {
    TEXT_RENDER_LIMIT,
    HEX_PREVIEW_BYTES,
    countJsonNodes,
    detectImage,
    formatByteSize,
    formatCount,
    formatLocal,
    formatNumberText,
    formatReadableDate,
    formatReadableDateTime,
    formatRelativeDay,
    formatRelativeTime,
    formatUtc,
    getHexRows,
    getJsonSummary,
    getLocalTimeZoneName,
    getQuickLookPreview,
    getTextStats,
    getUuidInfo,
    parseDate,
    parseDateTime,
  } from './quickLookTools';

  export let open = false;
  export let rowData;
  export let column;
  export let rowIndex;
  export let colIndex;
  export let editorTypes = null;
  // the grid container, used to find the cell and to tell clicks in the grid from clicks elsewhere
  export let gridElement;
  export let onClose;
  // keyboard navigation pressed while the panel has focus goes back to the grid
  export let onGridKeyDown = null;

  const tabVisible: any = getContext('tabVisible');
  const localTimeZone = getLocalTimeZoneName();

  let domAnchor;
  let domPanel;
  let glide = false;
  let lastRect = null;
  let frame = null;
  let copied = false;
  let copiedTimer = null;
  let copying = false;

  $: visible = open && !!rowData && !!column;
  $: value = visible
    ? column.isStructured
      ? _.get(rowData, column.uniquePath)
      : rowData[column.uniqueNameShorten ?? column.uniqueName]
    : undefined;
  $: preview = visible ? getQuickLookPreview(value, column.dataType, editorTypes) : null;
  $: columnName = column?.uniquePath?.length > 1 ? column.uniquePath.join('.') : column?.columnName || column?.headerText;

  $: textStats = preview?.kind == 'text' ? getTextStats(preview.text) : null;
  $: numberText = preview?.kind == 'number' ? formatNumberText(preview.text) : null;
  $: uuidInfo = preview?.kind == 'uuid' ? getUuidInfo(preview.text) : null;
  $: dateTime = preview?.kind == 'datetime' ? parseDateTime(preview.text) : null;
  $: dateOnly = preview?.kind == 'date' ? parseDate(preview.text) : null;
  $: image = preview?.kind == 'binary' ? detectImage(preview.bytes) : null;
  $: hexRows = preview?.kind == 'binary' ? getHexRows(preview.bytes) : null;
  $: jsonSummary = preview?.kind == 'json' ? getJsonSummary(preview.json) : null;
  $: jsonExpandDepth = preview?.kind == 'json' ? (countJsonNodes(preview.json, 80) <= 80 ? Infinity : 2) : 2;
  $: width = preview?.kind == 'binary' ? 'extra-wide' : preview?.kind == 'json' || preview?.kind == 'text' ? 'wide' : '';
  $: icon = preview?.kind == 'binary' && image ? 'mdi mdi-image-outline' : KIND_ICONS[preview?.kind] || KIND_ICONS.text;
  $: canCopy = !!preview && preview.kind != 'null' && preview.kind != 'missing';

  // a fresh cell starts without the "Copied" state
  $: preview, resetCopied();

  $: if (!visible) {
    glide = false;
    lastRect = null;
  }

  // follow the grid's current cell
  $: if (visible) schedulePlace(rowIndex, colIndex);

  $: if (visible && tabVisible && $tabVisible === false) onClose(false);

  function resetCopied() {
    copied = false;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = null;
  }

  function getAnchorRect() {
    const cell = gridElement?.querySelector(`td[data-row="${rowIndex}"][data-col="${colIndex}"]`);
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    const bounds = gridElement.getBoundingClientRect();
    const left = Math.max(rect.left, bounds.left);
    const right = Math.min(rect.right, bounds.right);
    const top = Math.max(rect.top, bounds.top);
    const bottom = Math.min(rect.bottom, bounds.bottom);
    // scrolled out of view, the panel stays where it is
    if (right <= left || bottom <= top) return null;
    return { left, right, top, bottom };
  }

  // Under the cell, or above it when there is more room there; kept inside the window.
  function place() {
    frame = null;
    if (!domAnchor || !domPanel) return;
    const rect = getAnchorRect() ?? lastRect;
    if (!rect) return;
    lastRect = rect;

    domPanel.style.maxHeight = '';
    const width = domPanel.offsetWidth;
    let height = domPanel.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN;
    const spaceAbove = rect.top - GAP - MARGIN;
    const below = spaceBelow >= height || spaceBelow >= spaceAbove;
    const available = Math.max(140, below ? spaceBelow : spaceAbove);
    if (height > available) {
      domPanel.style.maxHeight = `${available}px`;
      height = available;
    }

    const top = below ? rect.bottom + GAP : rect.top - GAP - height;
    const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - width - MARGIN);
    const originX = _.clamp(Math.min(rect.left + 24, (rect.left + rect.right) / 2) - left, 0, width);

    domAnchor.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    domPanel.style.transformOrigin = `${Math.round(originX)}px ${below ? -GAP : Math.round(height + GAP)}px`;
  }

  function schedulePlace(..._deps) {
    if (!visible || frame) return;
    frame = requestAnimationFrame(place);
  }

  // places the panel before its first frame, then keeps it placed while its content changes size
  function placement(node) {
    domPanel = node;
    domAnchor = node.parentElement;
    place();
    const startGlide = requestAnimationFrame(() => (glide = true));
    const observer = new ResizeObserver(() => schedulePlace());
    observer.observe(node);
    return {
      destroy() {
        cancelAnimationFrame(startGlide);
        observer.disconnect();
      },
    };
  }

  function copyValue() {
    if (!canCopy) return;
    copying = true;
    copyTextToClipboard(preview.text);
    copying = false;
    resetCopied();
    copied = true;
    copiedTimer = setTimeout(() => (copied = false), 1400);
  }

  function handlePanelKeyDown(e) {
    if (e.key == 'Escape' || (e.key == ' ' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      return;
    }
    if (NAVIGATION_KEYS.includes(e.key) && !e.altKey && onGridKeyDown) {
      e.stopPropagation();
      onGridKeyDown(e);
    }
  }

  function handleWindowMouseDown(e) {
    if (!visible || domPanel?.contains(e.target) || gridElement?.contains(e.target)) return;
    onClose(false);
  }

  // focus leaving for an editor, a filter or another part of the app closes the panel
  function handleWindowFocusIn(e) {
    if (!visible || copying || domPanel?.contains(e.target)) return;
    if (gridElement?.contains(e.target) && e.target.classList?.contains('focus-field')) return;
    onClose(false);
  }

  onDestroy(() => {
    if (frame) cancelAnimationFrame(frame);
    if (copiedTimer) clearTimeout(copiedTimer);
  });

  function countLabel(count, one, many) {
    return count == 1 ? one : many;
  }
</script>

<svelte:window
  on:mousedown|capture={handleWindowMouseDown}
  on:focusin|capture={handleWindowFocusIn}
  on:resize={() => schedulePlace()}
  on:scroll|capture={() => schedulePlace()}
  on:wheel|capture|passive={() => schedulePlace()}
/>

{#if visible}
  <div class="anchor" class:glide use:portal>
    <div
      class="panel {width}"
      role="dialog"
      tabindex="-1"
      aria-label={_t('quickLook.title', { defaultMessage: 'Quick Look: {column}', values: { column: columnName } })}
      use:placement
      transition:materialize
      on:keydown={handlePanelKeyDown}
      data-testid="CellQuickLook_panel"
    >
      <div class="header">
        <span class="kind-icon"><FontIcon {icon} /></span>
        <div class="title">
          <span class="column-name" title={columnName}>{columnName}</span>
          {#if column.dataType}
            <span class="data-type" title={column.dataType}>{column.dataType}</span>
          {/if}
        </div>
        <button
          class="header-button"
          class:copied
          disabled={!canCopy}
          title={copied
            ? _t('quickLook.copied', { defaultMessage: 'Copied' })
            : _t('quickLook.copy', { defaultMessage: 'Copy value' })}
          aria-label={_t('quickLook.copy', { defaultMessage: 'Copy value' })}
          on:mousedown|preventDefault
          on:click={copyValue}
          data-testid="CellQuickLook_copy"
        >
          {#key copied}
            <span class="copy-icon"><FontIcon icon={copied ? 'icon check' : 'icon copy'} /></span>
          {/key}
        </button>
        <button
          class="header-button"
          title={_t('quickLook.close', { defaultMessage: 'Close (Space)' })}
          aria-label={_t('quickLook.closeLabel', { defaultMessage: 'Close' })}
          on:mousedown|preventDefault
          on:click={() => onClose(true)}
          data-testid="CellQuickLook_close"
        >
          <FontIcon icon="icon close" />
        </button>
      </div>

      <div class="body kind-{preview.kind}" data-testid="CellQuickLook_value">
        {#if preview.kind == 'null' || preview.kind == 'missing'}
          <div class="empty-state">
            <span class="null-pill">NULL</span>
            <span class="empty-hint">
              {preview.kind == 'missing'
                ? _t('quickLook.missing', { defaultMessage: 'This row has no such field' })
                : _t('quickLook.null', { defaultMessage: 'This cell has no value' })}
            </span>
          </div>
        {:else if preview.kind == 'boolean'}
          <div class="boolean" class:on={value === true}>
            <FontIcon icon={value === true ? 'mdi mdi-toggle-switch' : 'mdi mdi-toggle-switch-off-outline'} />
            <span>{preview.text}</span>
          </div>
        {:else if preview.kind == 'number'}
          <div class="number">{numberText}</div>
          {#if numberText != preview.text}
            <div class="detail mono">{preview.text}</div>
          {/if}
        {:else if preview.kind == 'uuid'}
          <div class="uuid">
            {#each preview.text.split('-') as part, index}{#if index > 0}<span class="dash">-</span>{/if}<span
                >{part}</span
              >{/each}
          </div>
          {#if uuidInfo}
            <div class="facts">
              <span class="fact-label">{_t('quickLook.uuid.version', { defaultMessage: 'Version' })}</span>
              <span class="fact-value">
                {#if uuidInfo.nil}
                  {_t('quickLook.uuid.nil', { defaultMessage: 'Nil UUID' })}
                {:else if uuidInfo.version == 4}
                  {_t('quickLook.uuid.v4', { defaultMessage: '4 · random' })}
                {:else if uuidInfo.version == 7}
                  {_t('quickLook.uuid.v7', { defaultMessage: '7 · time-ordered' })}
                {:else}
                  {uuidInfo.version}
                {/if}
              </span>
              {#if uuidInfo.createdAt && !isNaN(uuidInfo.createdAt.getTime())}
                <span class="fact-label">{_t('quickLook.uuid.created', { defaultMessage: 'Created' })}</span>
                <span class="fact-value"
                  >{formatReadableDateTime(uuidInfo.createdAt)}
                  <span class="relative">{formatRelativeTime(uuidInfo.createdAt)}</span></span
                >
              {/if}
            </div>
          {/if}
        {:else if preview.kind == 'datetime' && dateTime}
          <div class="primary mono">{preview.text}</div>
          <div class="readable">
            <span>{formatReadableDateTime(dateTime.date)}</span>
            <span class="relative">{formatRelativeTime(dateTime.date)}</span>
          </div>
          <div class="facts">
            <span class="fact-label">UTC</span>
            <span class="fact-value mono">{formatUtc(dateTime)}</span>
            <span class="fact-label">{_t('quickLook.date.local', { defaultMessage: 'Local' })}</span>
            <span class="fact-value">
              <span class="mono">{formatLocal(dateTime)}</span>
              {#if localTimeZone}
                <span class="zone">{localTimeZone}</span>
              {/if}
            </span>
          </div>
        {:else if preview.kind == 'date' && dateOnly}
          <div class="primary mono">{preview.text}</div>
          <div class="readable">
            <span>{formatReadableDate(dateOnly)}</span>
            <span class="relative">{formatRelativeDay(dateOnly)}</span>
          </div>
        {:else if preview.kind == 'time'}
          <div class="primary mono large">{preview.text}</div>
        {:else if preview.kind == 'json'}
          <div class="json mono">
            {#key `${rowIndex}:${colIndex}`}
              <QuickLookJsonNode value={preview.json} expandDepth={jsonExpandDepth} />
            {/key}
          </div>
        {:else if preview.kind == 'binary'}
          {#if image}
            <div class="image">
              <img src={image.src} alt={columnName} />
            </div>
          {/if}
          <div class="hex mono">
            {#each hexRows as row}
              <div class="hex-row">
                <span class="hex-offset">{row.offset}</span>
                <span class="hex-bytes">{row.hex}</span>
                <span class="hex-ascii">{row.ascii}</span>
              </div>
            {/each}
            {#if preview.bytes.length == 0}
              <div class="empty-hint">{_t('quickLook.binary.empty', { defaultMessage: 'No bytes' })}</div>
            {/if}
          </div>
        {:else if preview.text == ''}
          <div class="empty-state">
            <span class="empty-hint">{_t('quickLook.text.empty', { defaultMessage: 'Empty text' })}</span>
          </div>
        {:else}
          <div class="text">
            {preview.text.length > TEXT_RENDER_LIMIT ? preview.text.substring(0, TEXT_RENDER_LIMIT) : preview.text}
          </div>
        {/if}
      </div>

      <div class="footer">
        <span class="meta">
          {#if preview.kind == 'text' && textStats}
            {countLabel(
              textStats.characters,
              _t('quickLook.text.oneCharacter', { defaultMessage: '1 character' }),
              _t('quickLook.text.characters', {
                defaultMessage: '{count} characters',
                values: { count: formatCount(textStats.characters) },
              })
            )}
            {#if textStats.words > 0}
              <span class="dot">·</span>
              {countLabel(
                textStats.words,
                _t('quickLook.text.oneWord', { defaultMessage: '1 word' }),
                _t('quickLook.text.words', {
                  defaultMessage: '{count} words',
                  values: { count: formatCount(textStats.words) },
                })
              )}
            {/if}
            {#if textStats.lines > 1}
              <span class="dot">·</span>
              {_t('quickLook.text.lines', {
                defaultMessage: '{count} lines',
                values: { count: formatCount(textStats.lines) },
              })}
            {/if}
            {#if preview.text.length > TEXT_RENDER_LIMIT}
              <span class="dot">·</span>
              {_t('quickLook.text.truncated', { defaultMessage: 'Showing the start, Copy takes all of it' })}
            {/if}
          {:else if preview.kind == 'json' && jsonSummary}
            {jsonSummary.isArray
              ? _t('quickLook.json.array', { defaultMessage: 'Array' })
              : _t('quickLook.json.object', { defaultMessage: 'Object' })}
            <span class="dot">·</span>
            {jsonSummary.isArray
              ? countLabel(
                  jsonSummary.count,
                  _t('quickLook.json.oneItem', { defaultMessage: '1 item' }),
                  _t('quickLook.json.items', {
                    defaultMessage: '{count} items',
                    values: { count: formatCount(jsonSummary.count) },
                  })
                )
              : countLabel(
                  jsonSummary.count,
                  _t('quickLook.json.oneKey', { defaultMessage: '1 key' }),
                  _t('quickLook.json.keys', {
                    defaultMessage: '{count} keys',
                    values: { count: formatCount(jsonSummary.count) },
                  })
                )}
          {:else if preview.kind == 'binary'}
            {countLabel(
              preview.bytes.length,
              _t('quickLook.binary.oneByte', { defaultMessage: '1 byte' }),
              _t('quickLook.binary.bytes', {
                defaultMessage: '{count} bytes',
                values: { count: formatCount(preview.bytes.length) },
              })
            )}
            {#if formatByteSize(preview.bytes.length)}
              <span class="dot">·</span>
              {formatByteSize(preview.bytes.length)}
            {/if}
            {#if image}
              <span class="dot">·</span>
              {_t('quickLook.binary.image', { defaultMessage: '{format} image', values: { format: image.label } })}
            {/if}
            {#if preview.bytes.length > HEX_PREVIEW_BYTES}
              <span class="dot">·</span>
              {_t('quickLook.binary.firstBytes', {
                defaultMessage: 'Showing the first {count} bytes',
                values: { count: formatCount(HEX_PREVIEW_BYTES) },
              })}
            {/if}
          {:else if preview.kind == 'datetime' && dateTime}
            {dateTime.hasZone
              ? _t('quickLook.date.withZone', { defaultMessage: 'Stored with a time zone' })
              : _t('quickLook.date.withoutZone', { defaultMessage: 'No time zone stored, read as UTC' })}
          {:else if preview.kind == 'uuid'}
            UUID
          {:else if preview.kind == 'number'}
            {_t('quickLook.number', { defaultMessage: 'Number' })}
          {:else if preview.kind == 'boolean'}
            {_t('quickLook.boolean', { defaultMessage: 'Boolean' })}
          {:else if preview.kind == 'date'}
            {_t('quickLook.date', { defaultMessage: 'Date' })}
          {:else if preview.kind == 'time'}
            {_t('quickLook.time', { defaultMessage: 'Time' })}
          {/if}
        </span>
        <span class="row-number">
          {_t('quickLook.row', { defaultMessage: 'Row {row}', values: { row: formatCount(rowIndex + 1) } })}
        </span>
      </div>
    </div>
  </div>
{/if}

<style>
  .anchor {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 1000;
    pointer-events: none;
  }
  /* following the current cell: the same critically damped curve, retargeted when a new cell comes in */
  .anchor.glide {
    transition: transform 280ms var(--dim-ease-spring);
    transition-timing-function: linear(
      0 0%,
      0.044 5%,
      0.144 10%,
      0.263 15%,
      0.384 20%,
      0.496 25%,
      0.595 30%,
      0.678 35%,
      0.748 40%,
      0.85 50%,
      0.915 60%,
      0.954 70%,
      0.978 80%,
      0.992 90%,
      1 100%
    );
  }

  .panel {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    width: min(380px, calc(100vw - 16px));
    max-height: min(460px, calc(100vh - 16px));
    box-sizing: border-box;
    background: var(--theme-menu-background);
    backdrop-filter: blur(30px) saturate(180%);
    -webkit-backdrop-filter: blur(30px) saturate(180%);
    border: var(--theme-modal-border);
    border-radius: var(--dim-radius-lg);
    box-shadow: var(--theme-popup-shadow);
    color: var(--theme-generic-font);
    font-size: 13px;
    overflow: hidden;
    outline: none;
  }
  .panel.wide {
    width: min(460px, calc(100vw - 16px));
  }
  .panel.extra-wide {
    width: min(540px, calc(100vw - 16px));
  }

  @media (prefers-reduced-transparency: reduce) {
    .panel {
      background: var(--theme-modal-background);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .anchor.glide {
      transition: none;
    }
  }

  .mono {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, 'JetBrains Mono', Consolas, monospace;
  }

  .header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 7px 7px 12px;
    border-bottom: var(--theme-panel-border-subtle);
    min-width: 0;
  }
  .kind-icon {
    flex-shrink: 0;
    display: flex;
    font-size: 15px;
    color: var(--theme-ui-text-secondary);
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .column-name {
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .data-type {
    flex-shrink: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .header-button {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font-size: 15px;
    cursor: pointer;
    transition:
      color var(--dim-transition-fast),
      background-color var(--dim-transition-fast);
  }
  .header-button:hover:not(:disabled) {
    color: var(--theme-generic-font);
    background: var(--theme-ui-hover);
  }
  .header-button:active:not(:disabled) {
    background: var(--theme-ui-active);
  }
  .header-button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .header-button.copied {
    color: var(--theme-ui-accent-strong);
  }
  .copy-icon {
    display: flex;
    animation: quick-look-icon-in 220ms var(--dim-ease-spring);
  }
  @keyframes quick-look-icon-in {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .copy-icon {
      animation: none;
    }
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 14px 14px;
    user-select: text;
    cursor: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 0 6px;
  }
  .null-pill {
    padding: 3px 12px;
    border: 1px dashed var(--theme-ui-border-strong);
    border-radius: 999px;
    color: var(--theme-ui-text-secondary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
  }
  .empty-hint {
    color: var(--theme-generic-font-grayed);
    font-size: 12px;
  }

  .boolean {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-ui-text-secondary);
  }
  .boolean :global(.mdi) {
    font-size: 26px;
  }
  .boolean.on {
    color: var(--theme-generic-font);
  }
  .boolean.on :global(.mdi) {
    color: var(--theme-ui-accent);
  }

  .number {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    word-break: break-all;
  }
  .detail {
    margin-top: 4px;
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
    word-break: break-all;
  }

  .uuid {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, 'JetBrains Mono', Consolas, monospace;
    font-size: 14.5px;
    letter-spacing: 0.01em;
    word-break: break-all;
  }
  .uuid .dash {
    color: var(--theme-generic-font-grayed);
  }

  .primary {
    font-size: 14px;
    word-break: break-all;
  }
  .primary.large {
    font-size: 20px;
  }
  .readable {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin-top: 6px;
    color: var(--theme-ui-text-secondary);
    font-size: 12.5px;
  }
  .relative {
    display: inline-block;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--theme-ui-accent-soft);
    color: var(--theme-ui-accent-strong);
    font-size: 11.5px;
    font-weight: 500;
    line-height: 18px;
    white-space: nowrap;
  }

  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 14px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: var(--theme-panel-border-subtle);
    font-size: 12px;
  }
  .fact-label {
    color: var(--theme-generic-font-grayed);
  }
  .fact-value {
    min-width: 0;
    word-break: break-word;
  }
  .zone {
    display: block;
    color: var(--theme-generic-font-grayed);
    font-size: 11.5px;
  }

  .text {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.55;
  }

  .json {
    font-size: 12px;
  }

  .image {
    display: flex;
    justify-content: center;
    margin-bottom: 12px;
    padding: 10px;
    border-radius: var(--dim-radius-md);
    background: var(--theme-ui-hover);
  }
  .image img {
    max-width: 100%;
    max-height: 180px;
    min-width: 32px;
    object-fit: contain;
  }

  .hex {
    font-size: 11.5px;
    line-height: 18px;
  }
  .hex-row {
    display: flex;
    gap: 14px;
    white-space: pre;
  }
  .hex-offset {
    color: var(--theme-generic-font-grayed);
  }
  .hex-ascii {
    color: var(--theme-ui-text-secondary);
  }

  .footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 12px;
    border-top: var(--theme-panel-border-subtle);
    color: var(--theme-generic-font-grayed);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
  .meta {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    margin: 0 3px;
  }
  .row-number {
    flex-shrink: 0;
  }
</style>
