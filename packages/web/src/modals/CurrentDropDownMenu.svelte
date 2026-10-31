<script>
  import _ from 'lodash';
  import { currentDropDownMenu } from '../stores';
  import DropDownMenu from './DropDownMenu.svelte';

  // Each menu (its items and place) gets its own instance, so a closing menu can animate out while the next one
  // grows in, and the same menu opened again while it is still closing turns around instead of starting over.
  // The menu bar sets the same menu again on every mouse move, which keeps its instance.
  let menuKey = 0;
  let lastMenu = null;

  function getMenuKey(menu) {
    if (
      !lastMenu ||
      menu.items !== lastMenu.items ||
      menu.left !== lastMenu.left ||
      menu.top !== lastMenu.top ||
      menu.bottom !== lastMenu.bottom
    ) {
      menuKey += 1;
    }
    lastMenu = menu;
    return menuKey;
  }

  $: menus = $currentDropDownMenu ? [{ ...$currentDropDownMenu, key: getMenuKey($currentDropDownMenu) }] : [];
</script>

{#each menus as menu (menu.key)}
  <DropDownMenu
    left={menu.left}
    top={menu.top}
    bottom={menu.bottom}
    items={menu.items}
    targetElement={menu.targetElement}
    on:close={() => ($currentDropDownMenu = null)}
  />
{/each}
