<script lang="ts" context="module">
  // The segment just left, so the switch in the tab that opens next can slide on from there.
  let handoff: { key: string; from: string; time: number } = null;
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import { lastUsedDefaultActions } from '../stores';
  import { getBoolSettingsValue } from '../settings/settingsTools';
  import openNewTab from '../utility/openNewTab';
  import { _t } from '../translations';

  export let conid;
  export let database;
  export let schemaName;
  export let pureName;
  // tables | views | matviews
  export let objectTypeField = 'tables';
  // data | structure | sql | details
  export let active;
  export let tabPreviewMode = false;
  // icons only, for a narrow toolbar
  export let compact = false;
  // data-testid per segment, to keep ids the tabs had before; default TableViewSwitch_<segment>
  export let testIds = {};

  interface Segment {
    key: string;
    label: string;
    title?: string;
    icon: string;
    tabComponent: string;
    tabIcon: string;
    defaultActionId?: string;
    props?: object;
  }

  function getSegments(objectTypeField): Segment[] {
    const isTable = objectTypeField == 'tables';
    const res: Segment[] = [
      {
        key: 'data',
        label: _t('common.data', { defaultMessage: 'Data' }),
        icon: 'icon table',
        tabComponent: isTable ? 'TableDataTab' : 'ViewDataTab',
        tabIcon: isTable ? 'img table' : 'img view',
        defaultActionId: 'openTable',
        // the left list opens table data with isRawMode: false, so this finds that tab again
        props: isTable ? { isRawMode: false } : {},
      },
      {
        key: 'structure',
        label: _t('datagrid.structure', { defaultMessage: 'Structure' }),
        icon: 'icon table-cog',
        tabComponent: 'TableStructureTab',
        tabIcon: 'img table-structure',
        defaultActionId: 'openStructure',
      },
      {
        key: 'sql',
        label: _t('tableViewSwitch.sql', { defaultMessage: 'SQL' }),
        icon: 'icon code',
        tabComponent: 'SqlObjectTab',
        tabIcon: 'img sql-file',
        defaultActionId: 'showSql',
      },
    ];
    if (isTable) {
      res.push({
        key: 'details',
        label: _t('tableData.details', { defaultMessage: 'Details' }),
        title: _t('tableData.detailsHint', { defaultMessage: 'Indexes, triggers, policies and enums' }),
        icon: 'icon table-details',
        tabComponent: 'TableDetailsTab',
        tabIcon: 'img table-details',
      });
    }
    return res;
  }

  // Every segment opens its tab the way the old toolbar buttons did: a preview tab replaces the
  // current preview tab (so it feels like one tab switching views), a pinned tab stays and the
  // sibling is opened or focused next to it.
  $: segments = getSegments(objectTypeField);

  $: tableKey = [conid, database, schemaName, pureName].join('\u0001');

  let pending = null;
  $: shown = pending ?? active;

  let domRoot: HTMLElement;
  let domThumb: HTMLElement;
  let domSegments = {};
  let thumb = null;
  let animate = false;

  function place(key) {
    const el = domSegments[key];
    if (el) thumb = { left: el.offsetLeft, width: el.offsetWidth };
  }

  async function open(segment: Segment) {
    if (segment.key == active || pending) return;
    if (tabPreviewMode && segment.defaultActionId && getBoolSettingsValue('defaultAction.useLastUsedAction', true)) {
      lastUsedDefaultActions.update(actions => ({
        ...actions,
        [objectTypeField]: segment.defaultActionId,
      }));
    }
    handoff = { key: tableKey, from: active, time: Date.now() };
    pending = segment.key;
    place(segment.key);
    try {
      await openNewTab({
        title: pureName,
        icon: segment.tabIcon,
        tabComponent: segment.tabComponent,
        tabPreviewMode: true,
        props: {
          schemaName,
          pureName,
          conid,
          database,
          objectTypeField,
          ...(segment.defaultActionId ? { defaultActionId: segment.defaultActionId } : {}),
          ...segment.props,
        },
      });
    } finally {
      // this tab may stay open (pinned) and show again later
      pending = null;
      if (domRoot) place(active);
    }
  }

  function handleKeyDown(e, index) {
    let next = null;
    if (e.key == 'ArrowRight') next = (index + 1) % segments.length;
    if (e.key == 'ArrowLeft') next = (index - 1 + segments.length) % segments.length;
    if (e.key == 'Home') next = 0;
    if (e.key == 'End') next = segments.length - 1;
    if (next == null) return;
    e.preventDefault();
    domSegments[segments[next].key]?.focus();
  }

  onMount(() => {
    const from =
      handoff && handoff.key == tableKey && handoff.from != active && Date.now() - handoff.time < 1500
        ? handoff.from
        : null;
    handoff = null;
    place(from ?? active);

    (async () => {
      await tick();
      // commit the start position, then let the thumb travel to this tab's segment
      domThumb?.getBoundingClientRect();
      animate = true;
      place(active);
    })();

    // labels change width when fonts load or the toolbar goes compact
    const resizeObserver = new ResizeObserver(() => place(pending ?? active));
    resizeObserver.observe(domRoot);
    return () => resizeObserver.disconnect();
  });
</script>

<div
  class="switch"
  class:compact
  role="tablist"
  aria-label={_t('tableViewSwitch.label', { defaultMessage: 'Table views' })}
  bind:this={domRoot}
  data-testid="TableViewSwitch_container"
>
  {#if thumb}
    <span
      class="thumb"
      class:animate
      bind:this={domThumb}
      style:width={`${thumb.width}px`}
      style:transform={`translateX(${thumb.left}px)`}
    />
  {/if}
  {#each segments as segment, index (segment.key)}
    <button
      type="button"
      class="segment"
      class:selected={segment.key == shown}
      role="tab"
      aria-selected={segment.key == shown}
      tabindex={segment.key == active ? 0 : -1}
      title={segment.title ?? segment.label}
      aria-label={segment.label}
      bind:this={domSegments[segment.key]}
      on:mousedown|preventDefault
      on:click={() => open(segment)}
      on:keydown={e => handleKeyDown(e, index)}
      data-testid={testIds[segment.key] ?? `TableViewSwitch_${segment.key}`}
    >
      {#if compact}
        <FontIcon icon={segment.icon} />
      {:else}
        {segment.label}
      {/if}
    </button>
  {/each}
</div>

<style>
  .switch {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: stretch;
    height: var(--dim-tb-height);
    box-sizing: border-box;
    padding: 2px;
    border-radius: var(--dim-radius-md);
    background: var(--theme-segmented-background, var(--theme-ui-hover));
    user-select: none;
  }

  .thumb {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 0;
    border-radius: var(--dim-radius-sm);
    background: var(--theme-segmented-thumb, var(--theme-toolstrip-button-background));
    box-shadow: var(--theme-segmented-thumb-shadow, none);
    pointer-events: none;
  }
  .thumb.animate {
    transition:
      transform 320ms var(--dim-ease-spring),
      width 320ms var(--dim-ease-spring);
  }

  .segment {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 11px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-ui-text-secondary);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      color var(--dim-transition-fast),
      transform 100ms var(--dim-ease-out);
  }
  .compact .segment {
    width: 30px;
    padding: 0;
    font-size: 15px;
  }
  .segment:hover:not(.selected) {
    color: var(--theme-generic-font);
  }
  .segment:active:not(.selected) {
    transform: scale(0.96);
  }
  .segment.selected {
    color: var(--theme-generic-font);
    cursor: default;
  }
  .segment:focus-visible {
    outline: var(--theme-focus-outline);
    outline-offset: -1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb.animate,
    .segment {
      transition: none;
    }
    .segment:active:not(.selected) {
      transform: none;
    }
  }
</style>
