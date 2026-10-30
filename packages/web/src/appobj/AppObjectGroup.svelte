<script>
  import _ from 'lodash';
  import Link from '../elements/Link.svelte';

  import { chevronExpandIcon } from '../icons/expandIcons';

  import FontIcon from '../icons/FontIcon.svelte';
  import contextMenu from '../utility/contextMenu';

  import AppObjectListItem from './AppObjectListItem.svelte';

  export let group;
  export let groupFunc;
  export let items;
  export let groupIconFunc = chevronExpandIcon;
  export let mapGroupTitle = undefined;
  export let module;
  export let checkedObjectsStore = null;
  export let disableContextMenu = false;
  export let passProps;
  export let onDropOnGroup = undefined;
  export let groupContextMenu = null;
  export let collapsedGroupNames;
  export let filter = undefined;

  $: isExpanded = !$collapsedGroupNames.includes(group);

  $: filtered = items.filter(x => x.isMatched);
  $: countText = filtered.length < items.length ? `${filtered.length}/${items.length}` : `${items.length}`;

  function handleCheckAll(isChecked) {
    checkedObjectsStore.update(checkList => {
      const res = isChecked
        ? [
            ...checkList,
            ...filtered
              .filter(x => !checkList.find(y => module.extractKey(x.data) == module.extractKey(y)))
              .map(x => x.data),
          ]
        : checkList.filter(x => groupFunc(x) != group);
      return res;
    });
  }

  function handleDrop(e) {
    var data = e.dataTransfer.getData('app_object_drag_data');
    if (data && onDropOnGroup) {
      e.stopPropagation();
      onDropOnGroup(data, group);
    }
  }
</script>

<div
  class="group"
  class:collapsed={!isExpanded}
  on:click={() =>
    collapsedGroupNames.update(names => {
      if (names.includes(group)) return names.filter(x => x != group);
      return [...names, group];
    })}
  on:drop={handleDrop}
  use:contextMenu={groupContextMenu ? () => groupContextMenu(group) : null}
>
  <span class="expand-icon">
    <FontIcon icon={groupIconFunc(isExpanded)} />
  </span>

  <span class="title">{mapGroupTitle ? mapGroupTitle(group) : group}</span>
  {#if items}
    <span class="count">{countText}</span>
  {/if}
</div>

{#if isExpanded}
  {#if checkedObjectsStore}
    <div class="ml-2">
      <Link onClick={() => handleCheckAll(true)}>Check all</Link>
      |
      <Link onClick={() => handleCheckAll(false)}>Uncheck all</Link>
    </div>
  {/if}

  <div on:drop={handleDrop} data-testid={`app-object-group-items-${_.kebabCase(group)}`}>
    {#each items as item}
      <AppObjectListItem
        isHidden={!item.isMatched}
        {...$$restProps}
        {module}
        data={item.data}
        {checkedObjectsStore}
        on:objectClick
        {disableContextMenu}
        {passProps}
        isExpandedBySearch={filter && item.isChildMatched}
        {filter}
        isMainMatched={item.isMainMatched}
      />
    {/each}
  </div>
{/if}

<style>
  .group {
    user-select: none;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 12px 14px 4px 6px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--theme-generic-font-grayed);
  }
  .expand-icon {
    font-size: 13px;
    width: 14px;
    display: flex;
    justify-content: center;
    opacity: 0;
    transition: opacity var(--dim-transition-fast);
  }
  .group:hover .expand-icon,
  .group.collapsed .expand-icon {
    opacity: 1;
  }
  .count {
    margin-left: auto;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
</style>
