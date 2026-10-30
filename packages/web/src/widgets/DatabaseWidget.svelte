<script lang="ts">
  import { useCloudContentList, useConfig, useConnectionInfo } from '../utility/metadataLoaders';

  import ConnectionList from './ConnectionList.svelte';

  import WidgetColumnBar from './WidgetColumnBar.svelte';
  import WidgetColumnBarItem from './WidgetColumnBarItem.svelte';
  import SingleConnectionDatabaseList from './SingleConnectionDatabaseList.svelte';
  import ConnectionSwitcher from './ConnectionSwitcher.svelte';
  import _ from 'lodash';
  import { _t } from '../translations';
  import DatabaseWidgetDetailContent from './DatabaseWidgetDetailContent.svelte';
  import { currentDatabase } from '../stores';

  export let hidden = false;
  let domSqlObjectList = null;
  let showAllConnections = false;

  $: config = useConfig();
  $: cloudContentList = useCloudContentList();

  $: useSwitcher = !$config?.singleConnection && !$config?.singleDbConnection;
  $: hasDatabase =
    !$currentDatabase?.connection?._id?.startsWith('cloud://') &&
    !!($currentDatabase?.name || $currentDatabase?.connection?.singleDatabase);

  // picking a database hides the full connection tree again
  $: $currentDatabase, (showAllConnections = false);
</script>

<div class="database-widget" class:hidden>
  {#if useSwitcher}
    <ConnectionSwitcher bind:showAllConnections />
  {/if}

  <WidgetColumnBar {hidden} storageName="databaseWidget">
    {#if $config?.singleConnection}
      <WidgetColumnBarItem title={_t('widget.databases', { defaultMessage: 'Databases' })} name="databases" height="35%">
        <SingleConnectionDatabaseList connection={$config?.singleConnection} />
      </WidgetColumnBarItem>
    {:else if !$config?.singleDbConnection}
      <WidgetColumnBarItem
        title={_t('common.connections', { defaultMessage: 'Connections' })}
        name="connections"
        height="35%"
        storeHeight
        skip={hasDatabase && !showAllConnections}
        onClose={hasDatabase ? () => (showAllConnections = false) : null}
      >
        <ConnectionList
          passProps={{
            onFocusSqlObjectList: () => domSqlObjectList.focus(),
            cloudContentList: $cloudContentList,
          }}
        />
      </WidgetColumnBarItem>
    {/if}

    <DatabaseWidgetDetailContent
      bind:domSqlObjectList
      showCloudConnection={false}
      hideObjectListTitle={useSwitcher && hasDatabase && !showAllConnections}
    />
  </WidgetColumnBar>
</div>

<style>
  .database-widget {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .database-widget.hidden {
    display: none;
  }
</style>
