<script lang="ts">
  import _ from 'lodash';
  import FontIcon from '../icons/FontIcon.svelte';
  import { _t } from '../translations';
  import { formatCount } from './quickLookTools';

  // children shown per object or array before a "show more" row
  const PAGE_SIZE = 200;

  export let value;
  export let label = null;
  export let isIndex = false;
  export let isLast = true;
  export let depth = 0;
  export let expandDepth = 2;

  let expanded = depth < expandDepth;
  let shownCount = PAGE_SIZE;

  $: isArray = _.isArray(value);
  $: isContainer = value !== null && typeof value == 'object';
  $: entries = isContainer ? (isArray ? value.map((item, index) => [index, item]) : Object.entries(value)) : [];
  $: canExpand = entries.length > 0;
  $: open = isArray ? '[' : '{';
  $: close = isArray ? ']' : '}';
  $: comma = isLast ? '' : ',';
  $: indent = `padding-left:${depth * 14}px`;
  $: valueClass =
    value === null
      ? 'null'
      : _.isString(value)
        ? 'string'
        : _.isNumber(value)
          ? 'number'
          : _.isBoolean(value)
            ? 'boolean'
            : 'other';
  $: countText = isArray
    ? entries.length == 1
      ? _t('quickLook.json.oneItem', { defaultMessage: '1 item' })
      : _t('quickLook.json.items', {
          defaultMessage: '{count} items',
          values: { count: formatCount(entries.length) },
        })
    : entries.length == 1
      ? _t('quickLook.json.oneKey', { defaultMessage: '1 key' })
      : _t('quickLook.json.keys', { defaultMessage: '{count} keys', values: { count: formatCount(entries.length) } });
</script>

<div class="line" style={indent}>
  {#if canExpand}
    <button
      class="disclosure"
      class:expanded
      tabindex="-1"
      aria-expanded={expanded}
      title={expanded
        ? _t('quickLook.json.collapse', { defaultMessage: 'Collapse' })
        : _t('quickLook.json.expand', { defaultMessage: 'Expand' })}
      on:mousedown|preventDefault
      on:click={() => (expanded = !expanded)}
      data-testid="QuickLookJsonNode_toggle"
    >
      <FontIcon icon="mdi mdi-menu-right" />
    </button>
  {:else}
    <span class="disclosure-space" />
  {/if}
  {#if label != null}
    {#if isIndex}
      <span class="index">{label}</span>
    {:else}
      <span class="key">"{label}"</span>
    {/if}<span class="punct">{': '}</span>
  {/if}
  {#if isContainer}
    {#if expanded && canExpand}
      <span class="punct">{open}</span>
    {:else}
      <span class="punct">{open}</span>{#if canExpand}<button
          class="ellipsis"
          tabindex="-1"
          on:mousedown|preventDefault
          on:click={() => (expanded = true)}>…</button
        >{/if}<span class="punct">{close}{comma}</span>
      {#if canExpand}
        <span class="count">{countText}</span>
      {/if}
    {/if}
  {:else}
    <span class={valueClass}>{valueClass == 'string' ? JSON.stringify(value) : String(value)}</span><span
      class="punct">{comma}</span
    >
  {/if}
</div>

{#if isContainer && expanded && canExpand}
  {#each entries.slice(0, shownCount) as [childLabel, childValue], index (childLabel)}
    <svelte:self
      value={childValue}
      label={childLabel}
      isIndex={isArray}
      isLast={index == entries.length - 1}
      depth={depth + 1}
      {expandDepth}
    />
  {/each}
  {#if entries.length > shownCount}
    <div class="line" style={`padding-left:${(depth + 1) * 14}px`}>
      <span class="disclosure-space" />
      <button class="more" tabindex="-1" on:mousedown|preventDefault on:click={() => (shownCount += PAGE_SIZE)}>
        {_t('quickLook.json.showMore', {
          defaultMessage: 'Show {count} more',
          values: { count: formatCount(Math.min(PAGE_SIZE, entries.length - shownCount)) },
        })}
      </button>
    </div>
  {/if}
  <div class="line" style={indent}>
    <span class="disclosure-space" />
    <span class="punct">{close}{comma}</span>
  </div>
{/if}

<style>
  .line {
    display: flex;
    align-items: flex-start;
    min-height: 19px;
    line-height: 19px;
  }
  .line > span {
    flex-shrink: 0;
  }

  .disclosure,
  .disclosure-space {
    display: inline-block;
    flex-shrink: 0;
    width: 16px;
    height: 19px;
    margin-left: -2px;
    margin-right: 1px;
  }
  .disclosure {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--theme-json-tree-arrow-color);
    font-size: 15px;
    cursor: pointer;
  }
  .disclosure:hover {
    color: var(--theme-generic-font);
    background: var(--theme-ui-hover);
  }
  .disclosure :global(.mdi) {
    display: inline-block;
    transition: transform 200ms var(--dim-ease-spring);
  }
  .disclosure.expanded :global(.mdi) {
    transform: rotate(90deg);
  }

  .key {
    color: var(--theme-json-tree-label-color);
  }
  .index {
    color: var(--theme-generic-font-grayed);
  }
  .punct {
    color: var(--theme-generic-font-grayed);
    white-space: pre;
  }
  .line > .string {
    flex-shrink: 1;
    min-width: 0;
    color: var(--theme-json-tree-string-color);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .number {
    color: var(--theme-json-tree-number-color);
  }
  .boolean {
    color: var(--theme-json-tree-boolean-color);
  }
  .null,
  .other {
    color: var(--theme-json-tree-null-color);
    font-style: italic;
  }
  .count {
    margin-left: 8px;
    font-size: 11px;
    color: var(--theme-generic-font-grayed);
  }

  .ellipsis,
  .more {
    padding: 0 4px;
    margin: 0 1px;
    border: none;
    border-radius: 4px;
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font-grayed);
    font: inherit;
    line-height: 16px;
    cursor: pointer;
  }
  .ellipsis:hover,
  .more:hover {
    background: var(--theme-ui-active);
    color: var(--theme-generic-font);
  }
  .more {
    font-family: inherit;
    font-size: 11.5px;
    padding: 0 8px;
  }

  @media (prefers-reduced-motion: reduce) {
    .disclosure :global(.mdi) {
      transition: none;
    }
  }
</style>
