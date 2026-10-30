<script lang="ts">
  import TabRegister from './TabRegister.svelte';
  import TabsPanel from './TabsPanel.svelte';
  import _ from 'lodash';
  import { currentDatabase, lockedDatabaseMode, openedTabs, type TabDefinition } from '../stores';
  import { shouldShowTab } from './TabsPanel.svelte';

  export let multiTabIndex;

  function findShownTab(tabs: TabDefinition[], multiTabIndex, lockedDbMode, currentDb) {
    const selectedTab = tabs.find(
      x =>
        x.selected &&
        x.closedTime == null &&
        (x.multiTabIndex || 0) == multiTabIndex &&
        shouldShowTab(x, lockedDbMode, currentDb)
    );
    if (selectedTab) {
      return selectedTab;
    }

    const selectedIndex = _.findLastIndex(
      tabs,
      x => (x.multiTabIndex || 0) == multiTabIndex && shouldShowTab(x, lockedDbMode, currentDb)
    );

    return tabs[selectedIndex];
  }

  $: shownTab = findShownTab($openedTabs, multiTabIndex, $lockedDatabaseMode, $currentDatabase);

  let showDbRow = false;
  $: panelHeightStyle = `--dim-tabs-panel-height: calc(${showDbRow ? 1 : 0} * 20px + var(--dim-tabs-height))`;
</script>

<div class="tabs" style={panelHeightStyle}>
  <TabsPanel {multiTabIndex} {shownTab} bind:showDbRow />
</div>
<div class="content" style={panelHeightStyle}>
  <TabRegister {multiTabIndex} {shownTab} />
</div>

<style>
  .tabs {
    position: absolute;
    top: 0;
    left: 0;
    height: var(--dim-tabs-panel-height);
    right: 0;
    background-color: var(--theme-tabs-panel-background);
    border-top: var(--theme-tabs-panel-border);
  }
  .content {
    position: absolute;
    top: var(--dim-tabs-panel-height);
    left: 0;
    bottom: 0;
    right: 0;
    background-color: var(--theme-content-background);
  }
</style>
