<script lang="ts">
  import _ from 'lodash';
  import { tick } from 'svelte';
  import { detectSqlFilterBehaviour, filterName, standardFilterBehaviours } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import {
    combineFilterTerms,
    getFilterOperators,
    getValuePrompt,
    isFilterValid,
    parseFilterTerms,
  } from '../utility/gridFilterBuilder';
  import { _t } from '../translations';

  // [{ uniqueName, columnName, dataType }] of the table
  export let columns = [];
  export let filters = {};
  export let disabledFilterColumns = [];
  export let multiColumnFilter = null;
  export let disabledMultiColumnFilter = false;
  export let driver = null;
  export let placeholder = 'Filter rows...';
  export let setColumnFilter: (uniqueName: string, value: string) => void;
  export let setMultiColumnFilter: (value: string) => void;

  const OPERATOR_GROUPS = {
    comparison: _t('filterBuilder.groupComparison', { defaultMessage: 'Comparison' }),
    pattern: _t('filterBuilder.groupPattern', { defaultMessage: 'Pattern matching' }),
    date: _t('filterBuilder.groupDate', { defaultMessage: 'Date' }),
    other: _t('filterBuilder.groupOther', { defaultMessage: 'Other' }),
  };

  const operators = getFilterOperators();
  const operatorById = _.keyBy(operators, 'id');

  // the free-text search across all columns (config.multiColumnFilter)
  const anyColumn = {
    isAny: true,
    uniqueName: null,
    columnName: _t('filterBuilder.anyColumn', { defaultMessage: 'any column' }),
    behaviour: null,
  };
  const anyOperator = {
    ...operatorById.contains,
    id: 'search',
    hint: _t('filterBuilder.searchHint', { defaultMessage: 'Searches every column of the table' }),
  };

  let query = '';
  // 'columns' | 'operators' | 'value'
  let menu = null;
  let highlighted = 0;
  // { chipKey, column, operator, stage: 'operator' | 'value' }
  let draft = null;
  let draftText = '';
  let draftInvalid = false;

  let domField;
  let domQuery;
  let domDraft;
  let domDraftInput;
  let domPopover;
  let popoverStyle = '';
  let popoverAbove = false;

  $: columnInfos = (columns || []).map(col => ({
    ...col,
    behaviour:
      driver?.getFilterBehaviour?.(col.dataType, standardFilterBehaviours) ?? detectSqlFilterBehaviour(col.dataType),
  }));
  $: columnsByName = _.keyBy(columnInfos, 'uniqueName');
  $: operatorOptions = { supportsIlike: !!driver?.dialect?.ilike };

  $: chips = buildChips(filters, disabledFilterColumns, multiColumnFilter, disabledMultiColumnFilter, columnsByName);

  function buildChips(filters, disabledFilterColumns, multiColumnFilter, disabledMultiColumnFilter, columnsByName) {
    const res = [];
    for (const uniqueName of Object.keys(filters || {})) {
      const text = filters[uniqueName];
      if (!text || !text.trim()) continue;
      const column = columnsByName[uniqueName] ?? { uniqueName, columnName: uniqueName, behaviour: null };
      const terms = column.behaviour
        ? parseFilterTerms(text, column.behaviour)
        : [{ operatorId: 'expression', value: text.trim(), text: text.trim() }];
      const invalid = !!column.behaviour && !isFilterValid(text, column.behaviour);
      terms.forEach((term, index) =>
        res.push({
          key: `${uniqueName}#${index}`,
          column,
          index,
          term,
          operator: operatorById[term.operatorId],
          disabled: (disabledFilterColumns || []).includes(uniqueName),
          invalid,
        })
      );
    }
    if (multiColumnFilter) {
      res.push({
        key: '*',
        column: anyColumn,
        index: 0,
        term: { operatorId: 'search', value: multiColumnFilter, text: multiColumnFilter },
        operator: anyOperator,
        disabled: disabledMultiColumnFilter,
        invalid: false,
      });
    }
    return res;
  }

  // column menu
  $: matchingColumns = columnInfos.filter(col => !query.trim() || filterName(query.trim(), col.columnName));
  $: columnItems = [
    ...matchingColumns.map(column => ({ type: 'column', column })),
    ...(query.trim() ? [{ type: 'search', column: null }] : []),
  ];

  // operator menu
  function operatorsForColumn(column, operatorOptions) {
    if (!column?.behaviour) return operators.filter(op => op.id == 'expression');
    return operators.filter(op => op.isAvailable(column.behaviour, operatorOptions));
  }

  $: availableOperators = operatorsForColumn(draft?.column, operatorOptions);
  $: operatorItems = filterOperators(availableOperators, menu == 'operators' ? draftText : '');

  function filterOperators(list, text) {
    const filter = (text || '').trim().toLowerCase();
    if (!filter) return list;
    const bySymbol = list.filter(op => op.symbol && op.symbol.startsWith(filter));
    if (bySymbol.length > 0 && /^[<>=!~%']/.test(filter)) return bySymbol;
    return list.filter(op => op.label.toLowerCase().includes(filter) || op.symbol?.toLowerCase() == filter);
  }

  $: menuItems = menu == 'columns' ? columnItems : menu == 'operators' ? operatorItems : [];
  $: if (highlighted >= menuItems.length) highlighted = Math.max(menuItems.length - 1, 0);

  $: if (menu) placeAfterUpdate(menu, chips, draft, draftText, query);

  // the arguments only tell Svelte when to place the popover again
  async function placeAfterUpdate(...deps) {
    await tick();
    placePopover();
  }

  // The popover is fixed to the window, so the toolbar can't clip it. It opens upwards when the toolbar sits
  // at the bottom of the window.
  function placePopover() {
    const anchor = menu == 'columns' ? domQuery : domDraft;
    if (!anchor || !domField) return;
    const rect = anchor.getBoundingClientRect();
    const fieldRect = domField.getBoundingClientRect();
    // the value hint sizes to its text
    const width = menu == 'value' ? 240 : 300;
    const left = Math.max(8, Math.min(Math.max(rect.left - 10, fieldRect.left), window.innerWidth - width - 8));
    const size = menu == 'value' ? `min-width:${width}px` : `width:${width}px`;
    const spaceBelow = window.innerHeight - fieldRect.bottom - 12;
    const spaceAbove = fieldRect.top - 12;
    popoverAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
    const vertical = popoverAbove
      ? `bottom:${window.innerHeight - fieldRect.top + 6}px;max-height:${Math.min(380, spaceAbove)}px`
      : `top:${fieldRect.bottom + 6}px;max-height:${Math.min(380, spaceBelow)}px`;
    popoverStyle = `left:${left}px;${size};${vertical}`;
  }

  function scrollHighlightedIntoView() {
    tick().then(() => domPopover?.querySelector('.highlighted')?.scrollIntoView({ block: 'nearest' }));
  }

  function moveHighlight(diff) {
    if (menuItems.length == 0) return;
    highlighted = (highlighted + diff + menuItems.length) % menuItems.length;
    scrollHighlightedIntoView();
  }

  function openColumnMenu() {
    if (draft) return;
    if (menu != 'columns') highlighted = 0;
    menu = 'columns';
  }

  async function focusDraftInput() {
    await tick();
    domDraftInput?.focus();
  }

  function startDraft(column) {
    query = '';
    draft = { chipKey: null, column, operator: null, stage: 'operator' };
    draftText = '';
    draftInvalid = false;
    menu = 'operators';
    highlighted = 0;
    focusDraftInput();
  }

  function pickOperator(operator, value = '') {
    draft = { ...draft, operator, stage: 'value' };
    draftText = value;
    draftInvalid = false;
    if (!operator.hasValue) {
      applyDraft();
      return;
    }
    menu = 'value';
    focusDraftInput();
  }

  function editChip(chip) {
    if (draft) commitOrCancelDraft();
    const { column, operator, term } = chip;
    draft = { chipKey: chip.key, column, operator, stage: operator.hasValue ? 'value' : 'operator' };
    draftText = operator.hasValue ? term.value : '';
    draftInvalid = false;
    menu = operator.hasValue ? 'value' : 'operators';
    highlighted = Math.max(
      operatorsForColumn(column, operatorOptions).findIndex(x => x.id == operator.id),
      0
    );
    focusDraftInput();
  }

  function reopenOperators() {
    if (!draft || draft.column.isAny) return;
    const current = draft.operator;
    draft = { ...draft, stage: 'operator' };
    draftText = '';
    draftInvalid = false;
    menu = 'operators';
    highlighted = Math.max(
      operatorsForColumn(draft.column, operatorOptions).findIndex(x => x.id == current?.id),
      0
    );
    focusDraftInput();
  }

  function columnTerms(uniqueName) {
    return chips.filter(x => x.column.uniqueName == uniqueName && !x.column.isAny).map(x => x.term.text);
  }

  // Writes the draft into the grid config; returns false (and marks the input) when the value doesn't parse.
  function applyDraft() {
    const { column, operator, chipKey } = draft;
    if (column.isAny) {
      setMultiColumnFilter(draftText.trim() || null);
      finishDraft();
      return true;
    }
    if (operator.hasValue && !draftText.trim()) {
      draftInvalid = true;
      return false;
    }
    const text = operator.toFilter(draftText, column.behaviour ?? {});
    if (!text || (column.behaviour && !isFilterValid(text, column.behaviour))) {
      draftInvalid = true;
      return false;
    }
    const terms = columnTerms(column.uniqueName);
    const editedChip = chips.find(x => x.key == chipKey);
    if (editedChip) {
      terms[editedChip.index] = text;
    } else {
      terms.push(text);
    }
    setColumnFilter(column.uniqueName, combineFilterTerms(terms) || null);
    finishDraft();
    return true;
  }

  function finishDraft() {
    draft = null;
    draftText = '';
    draftInvalid = false;
    menu = null;
    tick().then(() => domQuery?.focus());
  }

  function cancelDraft(focusQuery = true) {
    draft = null;
    draftText = '';
    draftInvalid = false;
    menu = null;
    if (focusQuery) tick().then(() => domQuery?.focus());
  }

  function removeChip(chip) {
    if (chip.column.isAny) {
      setMultiColumnFilter(null);
    } else {
      const terms = columnTerms(chip.column.uniqueName).filter((x, index) => index != chip.index);
      setColumnFilter(chip.column.uniqueName, combineFilterTerms(terms) || null);
    }
    if (draft?.chipKey) cancelDraft(false);
  }

  function clearAll() {
    for (const uniqueName of _.uniq(chips.filter(x => !x.column.isAny).map(x => x.column.uniqueName))) {
      setColumnFilter(uniqueName, null);
    }
    if (multiColumnFilter) setMultiColumnFilter(null);
    cancelDraft();
  }

  function searchAllColumns() {
    const text = query.trim();
    if (!text) return;
    setMultiColumnFilter(text);
    query = '';
    menu = null;
  }

  function pickColumnItem(item) {
    if (item.type == 'search') searchAllColumns();
    else startDraft(item.column);
  }

  function handleQueryKeyDown(e) {
    if (e.key == 'ArrowDown' || e.key == 'ArrowUp') {
      if (menu != 'columns') openColumnMenu();
      else moveHighlight(e.key == 'ArrowDown' ? 1 : -1);
      e.preventDefault();
    } else if (e.key == 'Enter') {
      if (menu == 'columns' && columnItems[highlighted]) pickColumnItem(columnItems[highlighted]);
      else searchAllColumns();
      e.preventDefault();
    } else if (e.key == 'Tab') {
      menu = null;
    } else if (e.key == 'Escape') {
      if (menu) menu = null;
      else if (query) query = '';
      else domQuery?.blur();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key == 'Backspace' && !query && chips.length > 0) {
      removeChip(chips[chips.length - 1]);
      e.preventDefault();
    }
  }

  function handleDraftKeyDown(e) {
    if (e.key == 'Tab') {
      commitOrCancelDraft();
      return;
    }
    if (draft.stage == 'operator') {
      if (e.key == 'ArrowDown' || e.key == 'ArrowUp') {
        moveHighlight(e.key == 'ArrowDown' ? 1 : -1);
        e.preventDefault();
      } else if (e.key == 'Enter') {
        // "id" then ">30" + Enter picks the operator and applies the value in one go
        const typed = draftText.match(/^(<>|<=|>=|<|>|=)\s*(.+)$/);
        const typedOperator = typed && availableOperators.find(op => op.symbol == typed[1]);
        if (typedOperator) {
          pickOperator(typedOperator, typed[2]);
          applyDraft();
        } else if (operatorItems[highlighted]) {
          pickOperator(operatorItems[highlighted]);
        }
        e.preventDefault();
      } else if (e.key == 'Escape') {
        cancelDraft();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key == 'Backspace' && !draftText) {
        cancelDraft();
        e.preventDefault();
      }
    } else {
      if (e.key == 'Enter') {
        applyDraft();
        e.preventDefault();
      } else if (e.key == 'Escape') {
        cancelDraft();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key == 'Backspace' && !draftText && !draft.column.isAny) {
        reopenOperators();
        e.preventDefault();
      }
    }
  }

  function handleDraftInput() {
    draftInvalid = false;
    if (draft?.stage == 'operator') highlighted = 0;
  }

  function handleChipKeyDown(e, chip) {
    if (e.key == 'Enter' || e.key == ' ') {
      editChip(chip);
      e.preventDefault();
    } else if (e.key == 'Backspace' || e.key == 'Delete') {
      removeChip(chip);
      domQuery?.focus();
      e.preventDefault();
    }
  }

  function handleFieldMouseDown(e) {
    // clicks on the empty part of the field go to the text input
    if (e.target == domField) {
      e.preventDefault();
      if (draft) domDraftInput?.focus();
      else domQuery?.focus();
    }
  }

  // Leaving a draft keeps it when complete (like the filter row does on blur) and drops it otherwise.
  function commitOrCancelDraft() {
    if (!(draft.stage == 'value' && draftText.trim() && applyDraft())) cancelDraft(false);
  }

  function handleWindowMouseDown(e) {
    // the path is taken at dispatch time; e.target may already be gone after a handler of the field re-rendered
    const path = e.composedPath();
    if (path.includes(domField) || (domPopover && path.includes(domPopover))) return;
    if (draft) commitOrCancelDraft();
    menu = null;
  }

  function chipTitle(chip) {
    const text = chip.column.isAny ? chip.term.text : `${chip.column.columnName}: ${chip.term.text}`;
    if (chip.invalid) {
      return `${text}\n${_t('filterBuilder.invalidFilter', { defaultMessage: 'This filter is not valid' })}`;
    }
    if (chip.disabled) return `${text}\n${_t('filterBuilder.disabledFilter', { defaultMessage: 'Disabled' })}`;
    return text;
  }

  function isSymbolLabel(label) {
    return /^[<>=!~]+$/.test(label || '');
  }

  $: valuePrompt = draft?.operator ? getValuePrompt(draft.operator, draft.column.behaviour) : null;
  $: draftPlaceholder = draft?.stage == 'value' ? valuePrompt?.placeholder ?? '' : '';
  $: draftOperatorLabel = draft?.stage == 'value' ? draft.operator?.chipLabel : '';
  // the chips with the draft in place of the chip being edited, or after the chips when it is a new one
  $: fieldItems = [
    ...chips.map(chip => (draft?.chipKey == chip.key ? { key: 'draft', isDraft: true } : chip)),
    ...(draft && !draft.chipKey ? [{ key: 'draft', isDraft: true }] : []),
  ];
  $: hasFilters = chips.length > 0;
</script>

<svelte:window on:mousedown={handleWindowMouseDown} on:resize={() => (menu = null)} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="field"
  class:hasFilters
  class:open={!!menu || !!draft}
  bind:this={domField}
  on:mousedown={handleFieldMouseDown}
  data-testid="ToolStripFilterBuilder_field"
>
  <span class="icon"><FontIcon icon="icon search" /></span>

  {#each fieldItems as chip (chip.key)}
    {#if chip.isDraft}
      <span class="chip draft" class:invalid={draftInvalid} bind:this={domDraft}>
        <span class="chip-column" class:any={draft.column.isAny}>{draft.column.columnName}</span>
        {#if draftOperatorLabel}
          <button
            class="chip-operator operator-button"
            class:symbol={isSymbolLabel(draftOperatorLabel)}
            tabindex="-1"
            on:mousedown|preventDefault={reopenOperators}>{draftOperatorLabel}</button
          >
        {/if}
        <span class="autosize" data-value={draftText || draftPlaceholder}>
          <input
            bind:this={domDraftInput}
            bind:value={draftText}
            placeholder={draftPlaceholder}
            size="1"
            autocomplete="off"
            spellcheck="false"
            on:keydown={handleDraftKeyDown}
            on:input={handleDraftInput}
            data-testid="ToolStripFilterBuilder_draftInput"
          />
        </span>
      </span>
    {:else}
      <span
        class="chip"
        class:disabled={chip.disabled}
        class:invalid={chip.invalid}
        role="button"
        tabindex="0"
        title={chipTitle(chip)}
        on:click={() => editChip(chip)}
        on:keydown={e => handleChipKeyDown(e, chip)}
        data-testid="ToolStripFilterBuilder_chip"
      >
        <span class="chip-column" class:any={chip.column.isAny}>{chip.column.columnName}</span>
        {#if chip.operator?.chipLabel}
          <span class="chip-operator" class:symbol={isSymbolLabel(chip.operator.chipLabel)}
            >{chip.operator.chipLabel}</span
          >
        {/if}
        {#if chip.operator?.hasValue}
          <span class="chip-value" class:code={chip.operator.id == 'expression'}>{chip.term.value}</span>
        {/if}
        <button
          class="chip-remove"
          tabindex="-1"
          title={_t('filterBuilder.removeFilter', { defaultMessage: 'Remove filter' })}
          on:mousedown|preventDefault|stopPropagation
          on:click|stopPropagation={() => removeChip(chip)}
          data-testid="ToolStripFilterBuilder_chipRemove"><FontIcon icon="icon close" /></button
        >
      </span>
    {/if}
  {/each}

  <input
    class="query"
    class:hidden={!!draft}
    type="text"
    autocomplete="off"
    spellcheck="false"
    bind:this={domQuery}
    bind:value={query}
    placeholder={hasFilters
      ? _t('filterBuilder.addMoreFilters', { defaultMessage: 'Add more filters...' })
      : placeholder}
    on:input={() => {
      highlighted = 0;
      openColumnMenu();
    }}
    on:mousedown={openColumnMenu}
    on:keydown={handleQueryKeyDown}
    data-testid={$$props['data-testid']}
  />

  {#if hasFilters && !draft}
    <button
      class="clear"
      title={_t('filterBuilder.clearAll', { defaultMessage: 'Clear all filters' })}
      on:mousedown|preventDefault
      on:click={clearAll}
      data-testid="ToolStripFilterBuilder_clearAll"><FontIcon icon="icon close" /></button
    >
  {/if}
</div>

{#if menu == 'columns' && columnItems.length > 0}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="popover"
    class:above={popoverAbove}
    style={popoverStyle}
    bind:this={domPopover}
    on:mousedown|preventDefault
    data-testid="ToolStripFilterBuilder_columnMenu"
  >
    <div class="list">
      {#each columnItems as item, index}
        {#if item.type == 'search' && index > 0}
          <div class="divider" />
        {/if}
        <button
          class="row"
          class:highlighted={index == highlighted}
          tabindex="-1"
          on:mouseenter={() => (highlighted = index)}
          on:click={() => pickColumnItem(item)}
        >
          {#if item.type == 'column'}
            <span class="row-label">{item.column.columnName}</span>
            <span class="row-meta">{item.column.dataType || ''}</span>
          {:else}
            <span class="row-icon"><FontIcon icon="icon search" /></span>
            <span class="row-label"
              >{_t('filterBuilder.searchAllColumns', { defaultMessage: 'Search all columns for' })}
              <strong>“{query.trim()}”</strong></span
            >
            <span class="keycap">↵</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if menu == 'operators' && draft}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="popover"
    class:above={popoverAbove}
    style={popoverStyle}
    bind:this={domPopover}
    on:mousedown|preventDefault
    data-testid="ToolStripFilterBuilder_operatorMenu"
  >
    <div class="list">
      {#each operatorItems as operator, index (operator.id)}
        {#if index == 0 || operatorItems[index - 1].group != operator.group}
          <div class="group-label">{OPERATOR_GROUPS[operator.group]}</div>
        {/if}
        <button
          class="row"
          class:highlighted={index == highlighted}
          class:current={draft.chipKey && draft.operator?.id == operator.id}
          tabindex="-1"
          on:mouseenter={() => (highlighted = index)}
          on:click={() => pickOperator(operator)}
        >
          <span class="row-label">{operator.label}</span>
          {#if operator.symbol}
            <kbd class="keycap">{operator.symbol}</kbd>
          {/if}
        </button>
      {:else}
        <div class="empty">{_t('filterBuilder.noOperator', { defaultMessage: 'No matching operator' })}</div>
      {/each}
    </div>
  </div>
{/if}

{#if menu == 'value' && draft?.operator}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="popover hint" class:above={popoverAbove} style={popoverStyle} bind:this={domPopover} on:mousedown|preventDefault>
    {#if draftInvalid}
      <div class="hint-row error">
        <FontIcon icon="icon warning" />
        <span
          >{!draftText.trim()
            ? _t('filterBuilder.typeValue', { defaultMessage: 'Type a value first' })
            : draft.column.dataType
              ? _t('filterBuilder.invalidValueFor', {
                  defaultMessage: 'Not a valid value for {dataType}',
                  values: { dataType: draft.column.dataType },
                })
              : _t('filterBuilder.invalidValue', { defaultMessage: 'Not a valid value' })}</span
        >
      </div>
    {:else if valuePrompt?.hint}
      <div class="hint-row">{valuePrompt.hint}</div>
    {/if}
    <div class="hint-row keys">
      <span><kbd class="keycap">↵</kbd> {_t('filterBuilder.apply', { defaultMessage: 'apply' })}</span>
      <span><kbd class="keycap">esc</kbd> {_t('filterBuilder.cancel', { defaultMessage: 'cancel' })}</span>
    </div>
  </div>
{/if}

<style>
  .field {
    flex: 1 1 280px;
    max-width: 680px;
    min-width: 180px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-height: var(--dim-tb-height);
    box-sizing: border-box;
    padding: 2px 4px 2px 8px;
    border: 1px solid transparent;
    border-radius: var(--dim-radius-sm);
    cursor: text;
    transition:
      background-color var(--dim-transition-fast),
      border-color var(--dim-transition-fast),
      box-shadow var(--dim-transition-fast);
  }
  .field:hover {
    background: var(--theme-ui-hover);
  }
  .field:focus-within,
  .field.open,
  .field.hasFilters {
    background: var(--theme-input-background);
    border-color: var(--theme-ui-border-strong);
  }
  .field:focus-within,
  .field.open {
    border-color: var(--theme-input-border-focus-color);
    box-shadow: var(--theme-input-focus-ring);
  }

  .icon {
    display: flex;
    width: var(--dim-tb-icon);
    height: var(--dim-tb-icon);
    margin-right: 2px;
    font-size: var(--dim-tb-icon);
    line-height: 1;
    color: var(--theme-generic-font-grayed);
  }

  .query {
    flex: 1;
    min-width: 90px;
    height: 22px;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    font-size: 12.5px;
  }
  .query.hidden {
    flex: 1 1 0;
    min-width: 0;
    width: 0;
    opacity: 0;
  }
  .query::placeholder {
    color: var(--theme-input-placeholder);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    height: 22px;
    box-sizing: border-box;
    padding: 0 2px 0 7px;
    border: 1px solid var(--theme-ui-border);
    border-radius: 5px;
    background: var(--theme-chip-background);
    color: var(--theme-generic-font);
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color var(--dim-transition-fast),
      background-color var(--dim-transition-fast);
  }
  .chip:hover {
    border-color: var(--theme-ui-border-strong);
  }
  .chip:focus-visible {
    outline: none;
    border-color: var(--theme-input-border-focus-color);
    box-shadow: var(--theme-input-focus-ring);
  }
  .chip.draft {
    padding-right: 6px;
    border-color: color-mix(in srgb, var(--theme-ui-accent) 55%, transparent);
    background: var(--theme-ui-accent-soft);
    cursor: text;
  }
  .chip.invalid {
    border-color: color-mix(in srgb, var(--theme-generic-font-error) 70%, transparent);
  }
  .chip.disabled .chip-column,
  .chip.disabled .chip-operator,
  .chip.disabled .chip-value {
    opacity: 0.55;
    text-decoration: line-through;
  }

  .chip-column {
    font-weight: 600;
  }
  .chip-column.any {
    font-weight: 500;
    font-style: italic;
    color: var(--theme-ui-text-secondary);
  }
  .chip-operator {
    color: var(--theme-generic-font-grayed);
  }
  .chip-operator.symbol {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    color: var(--theme-ui-accent-strong);
  }
  .operator-button {
    padding: 1px 3px;
    margin: 0 -3px;
    border: none;
    border-radius: 3px;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  .operator-button.symbol {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  }
  .operator-button:hover {
    background: var(--theme-ui-hover);
  }
  .chip-value {
    min-width: 0;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip-value.code {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
  }
  .chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font-size: 12px;
    cursor: pointer;
  }
  .chip-remove:hover {
    background: var(--theme-ui-active);
    color: var(--theme-generic-font);
  }

  /* the input grows with its text: the hidden ::after copy sizes the grid cell */
  .autosize {
    display: inline-grid;
    min-width: 2px;
  }
  .autosize::after {
    content: attr(data-value) ' ';
    grid-area: 1 / 1;
    visibility: hidden;
    white-space: pre;
    font: inherit;
  }
  .autosize input {
    grid-area: 1 / 1;
    width: 100%;
    min-width: 2px;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
  }
  .autosize input::placeholder {
    color: var(--theme-input-placeholder);
  }

  .clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-left: auto;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font-size: 13px;
    cursor: pointer;
  }
  .clear:hover {
    background: var(--theme-ui-hover);
    color: var(--theme-generic-font);
  }

  .popover {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    background: var(--theme-menu-background);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: var(--theme-modal-border);
    border-radius: 10px;
    box-shadow: var(--theme-popup-shadow);
    overflow: hidden;
    transform-origin: top left;
    animation: filter-builder-in 140ms var(--dim-ease-spring);
  }
  .popover.hint {
    max-width: 360px;
    padding: 6px 0;
  }

  .popover.above {
    transform-origin: bottom left;
    animation-name: filter-builder-in-above;
  }

  @keyframes filter-builder-in {
    from {
      opacity: 0;
      transform: translateY(-3px) scale(0.98);
    }
  }

  @keyframes filter-builder-in-above {
    from {
      opacity: 0;
      transform: translateY(3px) scale(0.98);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .popover,
    .popover.above {
      animation: none;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .popover {
      background: var(--theme-modal-background);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .group-label {
    padding: 8px 8px 3px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-generic-font-grayed);
  }
  .group-label:first-child {
    padding-top: 4px;
  }

  .divider {
    height: 1px;
    margin: 4px 4px;
    background: var(--theme-ui-border);
  }

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: var(--theme-generic-font);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row.highlighted {
    background: var(--theme-menu-item-hover);
  }
  .row.current .row-label {
    color: var(--theme-ui-accent-strong);
    font-weight: 600;
  }
  .row-icon {
    display: flex;
    color: var(--theme-generic-font-grayed);
  }
  .row-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-label strong {
    font-weight: 600;
  }
  .row-meta {
    flex-shrink: 0;
    max-width: 50%;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .keycap {
    flex-shrink: 0;
    min-width: 12px;
    padding: 1px 5px;
    border: 1px solid var(--theme-ui-border);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5px;
    line-height: 14px;
    text-align: center;
  }

  .empty {
    padding: 8px;
    color: var(--theme-generic-font-grayed);
  }

  .hint-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px;
    font-size: 12px;
    color: var(--theme-ui-text-secondary);
  }
  .hint-row.error {
    color: var(--theme-generic-font-error);
  }
  .hint-row.keys {
    gap: 12px;
    color: var(--theme-generic-font-grayed);
    font-size: 11.5px;
  }
  .hint-row.keys .keycap {
    margin-right: 2px;
  }
</style>
