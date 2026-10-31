<script lang="ts">
  import _ from 'lodash';
  import { tick } from 'svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import portal from '../utility/portal';
  import { popoverIn, popoverOut } from '../utility/motion';
  import { _t } from '../translations';

  // Returns [{ label?, items: [{ text, icon?, onClick, checked?, danger?, testid? }] }]; falsy entries are skipped
  export let getSections;
  export let title = null;
  export let subtitle = null;

  let open = false;
  let sections = [];
  let items = [];
  let activeIndex = -1;
  let domTrigger;
  let domMenu;
  let itemElements = [];
  let menuStyle = 'left:-9999px;top:0';

  function prepareSections(rawSections) {
    let index = 0;
    const res = [];
    for (const section of _.compact(rawSections)) {
      const sectionItems = _.compact(_.flattenDeep([section.items])).map(item => ({ ...item, index: index++ }));
      if (sectionItems.length > 0) res.push({ ...section, items: sectionItems });
    }
    return res;
  }

  // Under the trigger, left-aligned; flipped to the left or above when the window edge is near.
  function placeMenu() {
    const rect = domTrigger.getBoundingClientRect();
    const width = domMenu.offsetWidth;
    const height = domMenu.offsetHeight;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = rect.right - width;
    left = Math.max(8, left);
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    menuStyle = `left:${left}px;top:${top}px`;
  }

  async function openMenu(fromKeyboard) {
    sections = prepareSections(getSections());
    items = sections.flatMap(section => section.items);
    itemElements = [];
    activeIndex = -1;
    menuStyle = 'left:-9999px;top:0';
    open = true;
    await tick();
    placeMenu();
    if (fromKeyboard) focusItem(0);
    else domMenu?.focus();
  }

  function closeMenu(restoreFocus) {
    if (!open) return;
    open = false;
    if (restoreFocus) domTrigger?.focus();
  }

  function focusItem(index) {
    if (index < 0 || index >= items.length) return;
    activeIndex = index;
    itemElements[index]?.focus();
  }

  function moveActive(delta) {
    const count = items.length;
    if (!count) return;
    const start = activeIndex < 0 ? (delta > 0 ? -1 : count) : activeIndex;
    focusItem((start + delta + count) % count);
  }

  // Jump to the next item starting with the typed letter
  function typeAhead(key) {
    const letter = key.toLowerCase();
    const count = items.length;
    for (let step = 1; step <= count; step++) {
      const index = (Math.max(activeIndex, -1) + step) % count;
      if (items[index].text.toLowerCase().startsWith(letter)) {
        focusItem(index);
        return;
      }
    }
  }

  function handleMenuKeyDown(e) {
    if (e.key == 'ArrowDown') moveActive(1);
    else if (e.key == 'ArrowUp') moveActive(-1);
    else if (e.key == 'Home') focusItem(0);
    else if (e.key == 'End') focusItem(items.length - 1);
    else if (e.key == 'Escape' || e.key == 'Tab') closeMenu(true);
    else if (e.key.length == 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function handleItemClick(item) {
    closeMenu(false);
    item.onClick?.();
  }

  function handleTriggerClick(e) {
    if (open) closeMenu(false);
    // detail == 0 means the click came from the keyboard (Enter / Space)
    else openMenu(e.detail == 0);
  }

  function isOutside(target) {
    return !domMenu?.contains(target) && !domTrigger?.contains(target);
  }

  function handleWindowMouseDown(e) {
    if (open && isOutside(e.target)) closeMenu(false);
  }

  function handleWindowWheel(e) {
    if (open && !domMenu?.contains(e.target)) closeMenu(false);
  }
</script>

<svelte:window
  on:mousedown|capture={handleWindowMouseDown}
  on:wheel|capture={handleWindowWheel}
  on:resize={() => closeMenu(false)}
/>

<button
  class="trigger buttonLike"
  class:open
  bind:this={domTrigger}
  on:click|stopPropagation={handleTriggerClick}
  tabindex="-1"
  aria-haspopup="menu"
  aria-expanded={open}
  title={_t('columnMenu.columnOptions', { defaultMessage: 'Column options' })}
  data-testid={$$props['data-testid']}
>
  <FontIcon icon="icon chevron-down" />
</button>

{#if open}
  <div
    class="menu"
    role="menu"
    tabindex="-1"
    aria-label={title}
    style={menuStyle}
    bind:this={domMenu}
    use:portal
    in:popoverIn={{ anchor: domTrigger }}
    out:popoverOut
    on:keydown={handleMenuKeyDown}
    on:contextmenu|preventDefault
    data-testid="ColumnHeaderMenu_menu"
  >
    {#if title}
      <div class="menu-header">
        <span class="menu-title">{title}</span>
        {#if subtitle}
          <span class="menu-subtitle">{subtitle}</span>
        {/if}
      </div>
    {/if}
    {#each sections as section}
      <div class="section" role="group" aria-label={section.label}>
        {#if section.label}
          <div class="section-label">{section.label}</div>
        {/if}
        {#each section.items as item (item.index)}
          <button
            class="item"
            class:active={item.index == activeIndex}
            class:danger={item.danger}
            role={item.checked != null ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={item.checked != null ? !!item.checked : undefined}
            tabindex="-1"
            bind:this={itemElements[item.index]}
            on:mousemove={() => item.index != activeIndex && focusItem(item.index)}
            on:click={() => handleItemClick(item)}
            data-testid={item.testid}
          >
            <span class="item-icon">
              {#if item.icon}
                <FontIcon icon={item.icon} />
              {/if}
            </span>
            <span class="item-text">{item.text}</span>
            {#if item.checked}
              <span class="item-check"><FontIcon icon="icon check" /></span>
            {:else if item.hint}
              <span class="item-hint">{item.hint}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .trigger {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    margin: 0 1px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--theme-generic-font-grayed);
    font-size: 15px;
    cursor: pointer;
    transition:
      opacity var(--dim-transition-fast),
      color var(--dim-transition-fast),
      background-color var(--dim-transition-fast),
      transform var(--dim-transition-press);
  }
  .trigger:active {
    transform: scale(var(--dim-press-scale-small));
  }
  .trigger:hover {
    color: var(--theme-generic-font);
    background: var(--theme-ui-hover);
  }
  .trigger.open {
    opacity: 1;
    color: var(--theme-generic-font);
    background: var(--theme-ui-active);
  }

  .menu {
    position: fixed;
    z-index: 1000;
    min-width: 236px;
    max-width: 320px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    padding: 4px;
    box-sizing: border-box;
    background: var(--theme-modal-background);
    border: var(--theme-modal-border);
    border-radius: 10px;
    box-shadow: var(--theme-popup-shadow);
    color: var(--theme-generic-font);
    font-size: 13px;
    outline: none;
  }

  .menu-header {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 8px 7px;
    margin-bottom: 4px;
    border-bottom: var(--theme-modal-border);
    min-width: 0;
  }
  .menu-title {
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .menu-subtitle {
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .section + .section {
    margin-top: 4px;
    padding-top: 4px;
    border-top: var(--theme-modal-border);
  }
  .section-label {
    padding: 4px 8px 2px;
    font-size: 11px;
    font-weight: 600;
    color: var(--theme-generic-font-grayed);
  }

  .item {
    width: 100%;
    height: 28px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    border: none;
    border-radius: var(--dim-radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    outline: none;
  }
  .item.active {
    background: var(--theme-menu-item-hover);
  }
  .item.danger {
    color: var(--theme-generic-font-error);
  }

  .item-icon {
    width: 16px;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    font-size: 15px;
    color: var(--theme-generic-font-grayed);
  }
  .item.danger .item-icon {
    color: inherit;
  }
  .item-text {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-check {
    flex-shrink: 0;
    color: var(--theme-ui-accent-strong);
  }
  .item-hint {
    flex-shrink: 0;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }
</style>
