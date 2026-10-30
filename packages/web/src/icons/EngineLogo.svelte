<script lang="ts">
  import { findEngineDriver } from 'dbgate-tools';
  import FontIcon from './FontIcon.svelte';
  import { extensions } from '../stores';
  import { currentThemeType } from '../plugins/themes';
  import { getDriverIcon } from '../utility/driverIcons';

  // the connection whose engine logo is shown - the driver's own icon, as in the connection list
  export let connection;
  export let size = 16;

  $: driver = findEngineDriver(connection, $extensions);
  $: icon = getDriverIcon(driver, $currentThemeType);
</script>

<span class="engine-logo" style:--engine-logo-size="{size}px">
  <FontIcon icon={icon || 'icon database-outline'} />
</span>

<style>
  .engine-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--engine-logo-size);
    height: var(--engine-logo-size);
    font-size: var(--engine-logo-size);
  }
  .engine-logo :global(.svg-inline),
  .engine-logo :global(.svg-inline svg) {
    display: block;
    width: var(--engine-logo-size);
    height: var(--engine-logo-size);
  }
</style>
