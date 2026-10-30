<script lang="ts">
  import _ from 'lodash';
  import { tick } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import { showModal } from '../modals/modalTools';
  import ConfirmModal from '../modals/ConfirmModal.svelte';
  import { runOperationOnDatabase } from '../modals/ConfirmSqlModal.svelte';
  import InputTextModal from '../modals/InputTextModal.svelte';
  import { appliedCurrentSchema, currentDatabase } from '../stores';
  import { switchCurrentDatabase } from '../utility/common';
  import {
    extractDbNameFromComposite,
    extractSchemaNameFromComposite,
    filterName,
    findDefaultSchema,
  } from 'dbgate-tools';
  import { _t } from '../translations';

  export let schemaList;
  export let objectList;

  export let conid;
  export let database;
  export let connection;

  export let driver;

  let selectedSchema = null;

  let open = false;
  let filter = '';
  let highlighted = 0;
  let domTrigger;
  let domPopover;
  let domSearch;
  let popoverStyle = '';

  $: valueStorageKey = `selected-schema-${conid}-${database}`;

  $: {
    if (selectedSchema != null) {
      $appliedCurrentSchema = selectedSchema;
    } else {
      const usedSchemas = Object.keys(countBySchema);
      const defaultSchema = findDefaultSchema(schemaList, driver?.dialect);
      if (usedSchemas.length == 1 && usedSchemas[0] == defaultSchema) {
        $appliedCurrentSchema = usedSchemas[0];
      } else {
        $appliedCurrentSchema = null;
      }
    }
  }

  function computeCountBySchema(list) {
    const res = {};
    for (const item of list) {
      if (!item.schemaName) continue;
      if (!res[item.schemaName]) res[item.schemaName] = 0;
      res[item.schemaName] += 1;
    }
    return res;
  }

  $: realSchemaList = _.uniq(
    _.compact([selectedSchema, ...Object.keys(countBySchema), ...(schemaList?.map(x => x.schemaName) ?? [])])
  );
  $: countBySchema = computeCountBySchema(objectList ?? []);

  // value '' = all schemas
  $: options = connection?.useSeparateSchemas
    ? (schemaList ?? []).map(x => ({ value: x.schemaName, label: x.schemaName, count: countBySchema[x.schemaName] }))
    : [
        {
          value: '',
          label: _t('schema.allSchemasLabel', { defaultMessage: 'All schemas' }),
          count: objectList?.length ?? 0,
        },
        ...realSchemaList.map(x => ({ value: x, label: x, count: countBySchema[x] ?? 0 })),
      ];
  $: currentValue = selectedSchema ?? $appliedCurrentSchema ?? '';
  $: currentLabel = options.find(x => x.value == currentValue)?.label ?? currentValue;
  $: filteredOptions = options.filter(x => !filter || filterName(filter, x.label));
  $: if (highlighted >= filteredOptions.length) highlighted = Math.max(filteredOptions.length - 1, 0);

  function handleCreateSchema() {
    close();
    showModal(InputTextModal, {
      header: _t('schema.createSchema', { defaultMessage: 'Create schema' }),
      value: 'newschema',
      label: _t('schema.schemaName', { defaultMessage: 'Schema name' }),
      onConfirm: async name => {
        const dbid = { conid, database };
        await runOperationOnDatabase(
          dbid,
          {
            type: 'createSchema',
            schemaName: name,
          },
          'schema-list-changed'
        );
        if (selectedSchema) {
          selectedSchema = name;
        }
      },
    });
  }
  function handleDropSchema() {
    close();
    showModal(ConfirmModal, {
      message: `Really drop schema ${$appliedCurrentSchema}?`,
      onConfirm: async () => {
        const dbid = { conid, database };
        runOperationOnDatabase(
          dbid,
          {
            type: 'dropSchema',
            schemaName: $appliedCurrentSchema,
          },
          'schema-list-changed'
        );
        selectedSchema = null;
      },
    });
  }

  function handleResetToDefault() {
    close();
    selectedSchema = null;
    localStorage.removeItem(valueStorageKey);
  }

  function pick(value) {
    close();
    if (connection?.useSeparateSchemas) {
      switchCurrentDatabase({
        connection,
        name: `${extractDbNameFromComposite(database)}::${value}`,
      });
    } else {
      selectedSchema = value;
    }
    localStorage.setItem(valueStorageKey, value);
  }

  // The popover is fixed to the window, so the list's scroll container can't clip it.
  function placePopover() {
    const rect = domTrigger.getBoundingClientRect();
    popoverStyle = `top:${rect.bottom + 4}px;left:${rect.left}px;width:${Math.max(rect.width, 220)}px`;
  }

  async function toggle() {
    if (open) {
      close();
      return;
    }
    filter = '';
    placePopover();
    open = true;
    highlighted = Math.max(
      filteredOptions.findIndex(x => x.value == currentValue),
      0
    );
    await tick();
    domSearch?.focus();
  }

  function close() {
    open = false;
  }

  function handleSearchKeyDown(e) {
    if (e.key == 'ArrowDown') {
      highlighted = Math.min(highlighted + 1, filteredOptions.length - 1);
      e.preventDefault();
    } else if (e.key == 'ArrowUp') {
      highlighted = Math.max(highlighted - 1, 0);
      e.preventDefault();
    } else if (e.key == 'Enter' && filteredOptions[highlighted]) {
      pick(filteredOptions[highlighted].value);
      e.preventDefault();
    }
  }

  function handleWindowMouseDown(e) {
    if (open && !domPopover?.contains(e.target) && !domTrigger?.contains(e.target)) close();
  }

  function handleWindowKeyDown(e) {
    if (open && e.key == 'Escape') {
      close();
      domTrigger?.focus();
    }
  }

  $: if (connection?.useSeparateSchemas) {
    selectedSchema =
      extractSchemaNameFromComposite($currentDatabase?.name) ?? findDefaultSchema(schemaList, driver?.dialect);
  } else {
    selectedSchema = localStorage.getItem(valueStorageKey ?? '');
  }
</script>

<svelte:window on:mousedown={handleWindowMouseDown} on:keydown={handleWindowKeyDown} on:resize={close} />

{#if realSchemaList.length > 0}
  <button
    class="trigger"
    class:open
    bind:this={domTrigger}
    on:click={toggle}
    title={_t('common.schema', { defaultMessage: 'Schema' })}
    data-testid="SchemaSelector_trigger"
  >
    <span class="trigger-label">{_t('schema.triggerLabel', { defaultMessage: 'schema' })}</span>
    <span class="trigger-value">{currentLabel}</span>
    <span class="chevron"><FontIcon icon="icon unfold" /></span>
  </button>

  {#if open}
    <div class="popover" style={popoverStyle} bind:this={domPopover} data-testid="SchemaSelector_popover">
      <div class="search">
        <FontIcon icon="icon search" />
        <input
          bind:this={domSearch}
          bind:value={filter}
          on:input={() => (highlighted = 0)}
          on:keydown={handleSearchKeyDown}
          placeholder={_t('schema.findSchema', { defaultMessage: 'Find schema...' })}
        />
      </div>

      <div class="list">
        {#each filteredOptions as option, index (option.value)}
          <button
            class="row"
            class:highlighted={index == highlighted}
            on:mouseenter={() => (highlighted = index)}
            on:click={() => pick(option.value)}
          >
            <span class="check">
              {#if option.value == currentValue}
                <FontIcon icon="icon check" />
              {/if}
            </span>
            <span class="row-label" class:all={option.value == ''}>{option.label}</span>
            {#if option.count != null}
              <span class="row-meta">{option.count}</span>
            {/if}
          </button>
        {:else}
          <div class="empty">{_t('schema.noSchemaFound', { defaultMessage: 'No schema found' })}</div>
        {/each}
      </div>

      <div class="footer">
        <button class="row" on:click={handleCreateSchema}>
          <span class="check"><FontIcon icon="icon plus" /></span>
          <span class="row-label">{_t('schema.createNewSchema', { defaultMessage: 'Create a new schema' })}</span>
        </button>
        {#if selectedSchema != null && !connection?.useSeparateSchemas}
          <button class="row" on:click={handleResetToDefault}>
            <span class="check"><FontIcon icon="icon undo" /></span>
            <span class="row-label">{_t('schema.resetToDefault', { defaultMessage: 'Reset to default' })}</span>
          </button>
        {/if}
        {#if $appliedCurrentSchema}
          <button class="row danger" on:click={handleDropSchema}>
            <span class="check"><FontIcon icon="icon delete" /></span>
            <span class="row-label"
              >{_t('schema.deleteNamed', {
                defaultMessage: 'Delete schema {name}',
                values: { name: $appliedCurrentSchema },
              })}</span
            >
          </button>
        {/if}
      </div>
    </div>
  {/if}
{/if}

<style>
  .trigger {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px 0 10px;
    border: 1px solid var(--theme-ui-border);
    border-radius: var(--dim-radius-md);
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--dim-transition-fast),
      background-color var(--dim-transition-fast);
  }
  .trigger:hover {
    border-color: var(--theme-ui-border-strong);
  }
  .trigger.open,
  .trigger:focus-visible {
    outline: none;
    border-color: var(--theme-input-border-focus-color);
    box-shadow: var(--theme-input-focus-ring);
  }
  .trigger-label {
    color: var(--theme-generic-font-grayed);
  }
  .trigger-value {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chevron {
    flex-shrink: 0;
    color: var(--theme-generic-font-grayed);
    font-size: 14px;
  }

  .popover {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    max-height: min(420px, 60vh);
    background: var(--theme-menu-background);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: var(--theme-modal-border);
    border-radius: 10px;
    box-shadow: var(--theme-popup-shadow);
    overflow: hidden;
    transform-origin: top center;
    animation: schema-picker-in 160ms var(--dim-ease-spring);
  }

  @keyframes schema-picker-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .popover {
      background: var(--theme-modal-background);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .popover {
      animation: none;
    }
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: var(--theme-modal-border);
    color: var(--theme-generic-font-grayed);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
  }
  .search input::placeholder {
    color: var(--theme-input-placeholder);
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .footer {
    padding: 4px;
    border-top: var(--theme-modal-border);
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 4px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row.highlighted,
  .footer .row:hover {
    background: var(--theme-menu-item-hover);
  }
  .row.danger {
    color: var(--theme-generic-font-error);
  }

  .check {
    width: 18px;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    color: var(--theme-generic-font-grayed);
  }
  .list .check {
    color: var(--theme-ui-accent-strong);
  }

  .row-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-label.all {
    color: var(--theme-generic-font-grayed);
  }
  .row-meta {
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--theme-generic-font-grayed);
  }

  .empty {
    padding: 10px 8px;
    color: var(--theme-generic-font-grayed);
  }
</style>
