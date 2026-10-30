<script lang="ts">
  import FontIcon from '../icons/FontIcon.svelte';
  import {
    currentDropDownMenu,
    selectedWidget,
    visibleSelectedWidget,
    visibleWidgetSideBar,
    visibleHamburgerMenuWidget,
    getCurrentConfig,
    cloudSigninTokenHolder,
    seenPremiumPromoWidget,
    promoWidgetPreview,
    widgetRailWidth,
    widgetRailExpandedWidth,
    WIDGET_RAIL_COLLAPSED_WIDTH,
  } from '../stores';
  import mainMenuDefinition from '../../../../app/src/mainMenuDefinition';
  import hasPermission from '../utility/hasPermission';
  import { isProApp } from '../utility/proTools';
  import { openWebLink } from '../utility/simpleTools';
  import { apiCall } from '../utility/api';
  import getElectron from '../utility/getElectron';
  import { showModal } from '../modals/modalTools';
  import NewObjectModal from '../modals/NewObjectModal.svelte';
  import openNewTab from '../utility/openNewTab';
  import { useConfig, usePromoWidget } from '../utility/metadataLoaders';
  import { _t, getCurrentTranslations } from '../translations';

  let domSettings;
  let domCloudAccount;
  let domMainMenu;

  const promoWidget = usePromoWidget({});

  $: expanded = $widgetRailWidth > WIDGET_RAIL_COLLAPSED_WIDTH;

  function toggleRail() {
    $widgetRailWidth = expanded ? WIDGET_RAIL_COLLAPSED_WIDTH : $widgetRailExpandedWidth;
  }

  const widgets = [
    getCurrentConfig().storageDatabase && {
      icon: 'icon admin-outline',
      name: 'admin',
      label: _t('widgets.administration', { defaultMessage: 'Administration' }),
      title: _t('widgets.administration', { defaultMessage: 'Administration' }),
    },
    {
      icon: 'icon database-outline',
      name: 'database',
      label: _t('widgets.database', { defaultMessage: 'Database' }),
      title: _t('widgets.databaseConnections', { defaultMessage: 'Database connections' }),
    },
    {
      icon: 'icon sql-editor',
      name: 'sql-editor',
      label: _t('widgets.sqlEditor', { defaultMessage: 'SQL Editor' }),
      title: _t('widgets.sqlEditor', { defaultMessage: 'SQL Editor' }),
    },
    {
      icon: 'icon opened-tabs',
      name: 'opened-tabs',
      label: _t('widgets.openedTabs', { defaultMessage: 'Opened tabs' }),
      title: _t('widgets.openedTabs', { defaultMessage: 'Opened tabs' }),
    },
    getCurrentConfig().allowPrivateCloud && {
      name: 'cloud-private',
      label: _t('widgets.cloud', { defaultMessage: 'Cloud' }),
      title: _t('widgets.dbgateCloud', { defaultMessage: 'DbGate Cloud' }),
      icon: 'icon cloud-private-outline',
    },

    // {
    //   icon: 'fa-table',
    //   name: 'table',
    // },
    {
      icon: 'icon file-outline',
      name: 'file',
      label: _t('widgets.savedFiles', { defaultMessage: 'Saved files' }),
      title: _t('widgets.favoritesAndSavedFiles', { defaultMessage: 'Favorites & Saved files' }),
    },
    {
      icon: 'icon history',
      name: 'history',
      label: _t('widgets.history', { defaultMessage: 'History' }),
      title: _t('widgets.queryHistoryAndClosedTabs', { defaultMessage: 'Query history & Closed tabs' }),
    },
    isProApp() && {
      icon: 'icon archive-outline',
      name: 'archive',
      label: _t('widgets.archive.short', { defaultMessage: 'Archive' }),
      title: _t('widgets.archive', { defaultMessage: 'Archive (saved tabular data)' }),
    },
    // {
    //   icon: 'icon plugin',
    //   name: 'plugins',
    //   title: 'Extensions & Plugins',
    // },
    {
      name: 'cloud-public',
      label: _t('widgets.cloudFiles', { defaultMessage: 'Cloud files' }),
      title: _t('widgets.dbgateCloud', { defaultMessage: 'DbGate Cloud' }),
      icon: 'icon cloud-public-outline',
    },
    {
      icon: 'icon premium-outline',
      name: 'premium',
      label: _t('widgets.premium', { defaultMessage: 'Premium' }),
      title: _t('widgets.premiumPromo', { defaultMessage: 'Premium promo' }),
      isPremiumPromo: true,
    },
    // {
    //   icon: 'icon settings',
    //   name: 'settings',
    // },
    // {
    //   icon: 'fa-check',
    //   name: 'settings',
    // },
  ];

  function handleChangeWidget(name) {
    if ($visibleSelectedWidget == name) {
      $visibleWidgetSideBar = false;
    } else {
      $selectedWidget = name;
      $visibleWidgetSideBar = true;

      if (name == 'premium') {
        $seenPremiumPromoWidget = $promoWidget?.identifier || '';
      }
    }
  }
  //const handleChangeWidget= e => (selectedWidget.set(item.name))

  function handleSettingsMenu() {
    openNewTab({
      title: 'Settings',
      icon: 'icon settings',
      tabComponent: 'SettingsTab',
      props: {},
    });
  }

  function handleCloudAccountMenu() {
    const rect = domCloudAccount.getBoundingClientRect();
    const left = rect.right;
    const top = rect.bottom;
    const items = [{ command: 'cloud.logout' }];
    currentDropDownMenu.set({ left, top, items });
  }

  function handleMainMenu() {
    const rect = domMainMenu.getBoundingClientRect();
    const left = rect.right;
    const top = rect.top;
    const items = mainMenuDefinition({ editMenu: false }, getCurrentTranslations());
    currentDropDownMenu.set({ left, top, items });
  }

  async function handleOpenCloudLogin() {
    const useRedirect = getCurrentConfig()?.redirectToDbGateCloudLogin;
    const { url, sid } = await apiCall('auth/create-cloud-login-session', {
      client: getElectron() ? 'app' : 'web',
      redirectUri: useRedirect ? location.origin + location.pathname : undefined,
    });
    if (useRedirect) {
      location.href = url;
    } else {
      openWebLink(url, true);
    }
  }

  $: promoWidgetData = $promoWidgetPreview || $promoWidget;
  $: config = useConfig();
</script>

<div class="main" class:expanded>
  {#if $visibleHamburgerMenuWidget}
    <div class="wrapper mb-3" on:click={handleMainMenu} bind:this={domMainMenu} data-testid="WidgetIconPanel_menu">
      <FontIcon icon="icon menu" />
      {#if expanded}<span class="label">{_t('widgets.menu', { defaultMessage: 'Menu' })}</span>{/if}
    </div>
  {/if}
  {#each widgets
    .filter(x => x && hasPermission(`widgets/${x.name}`))
    .filter(x => !x.isPremiumPromo || (($config?.trialDaysLeft != null || !isProApp()) && promoWidgetData?.state == 'data'))
    // .filter(x => !x.isPremiumOnly || isProApp())
    .filter(x => x.name != 'cloud-private' || $cloudSigninTokenHolder) as item}
    <div
      class="wrapper"
      class:selected={item.name == $visibleSelectedWidget}
      data-testid={`WidgetIconPanel_${item.name}`}
      on:click={() => handleChangeWidget(item.name)}
    >
      <FontIcon icon={item.icon} title={item.title} />
      {#if expanded}<span class="label">{item.label || item.title}</span>{/if}
      {#if item.isPremiumPromo && !expanded}
        <div class="premium-promo">Premium</div>
        {#if promoWidgetData?.identifier != $seenPremiumPromoWidget}
          <div class="premium-promo-not-seen">•</div>
        {/if}
      {/if}
    </div>
  {/each}

  <div
    class="wrapper"
    on:click={() => showModal(NewObjectModal)}
    data-testid="WidgetIconPanel_addButton"
    title={_t('widgets.addNew', { defaultMessage: 'Add New' })}
  >
    <FontIcon icon="icon plus" />
    {#if expanded}<span class="label">{_t('widgets.new', { defaultMessage: 'New' })}</span>{/if}
  </div>

  <div class="flex1">&nbsp;</div>

  <!-- <div
    class="wrapper"
    title={`Toggle whether tabs from all databases are visible. Currently - ${$lockedDatabaseMode ? 'NO' : 'YES'}`}
    on:click={() => {
      $lockedDatabaseMode = !$lockedDatabaseMode;
    }}
    data-testid="WidgetIconPanel_lockDb"
  >
    <FontIcon icon={$lockedDatabaseMode ? 'icon locked-database-mode' : 'icon unlocked-database-mode'} />
  </div> -->

  {#if getCurrentConfig().allowPrivateCloud}
    {#if $cloudSigninTokenHolder}
      <div
        class="wrapper"
        on:click={handleCloudAccountMenu}
        bind:this={domCloudAccount}
        data-testid="WidgetIconPanel_cloudAccount"
      >
        <FontIcon icon="icon cloud-account-connected" />
        {#if expanded}<span class="label">{_t('widgets.account', { defaultMessage: 'Account' })}</span>{/if}
      </div>
    {:else}
      <div class="wrapper" on:click={handleOpenCloudLogin} data-testid="WidgetIconPanel_cloudAccount">
        <FontIcon icon="icon cloud-account" />
        {#if expanded}<span class="label">{_t('widgets.account', { defaultMessage: 'Account' })}</span>{/if}
      </div>
    {/if}
  {/if}

  <div class="wrapper" on:click={handleSettingsMenu} bind:this={domSettings} data-testid="WidgetIconPanel_settings">
    <FontIcon icon="icon settings-outline" />
    {#if expanded}<span class="label">{_t('widgets.settings', { defaultMessage: 'Settings' })}</span>{/if}
  </div>

  <div
    class="wrapper"
    on:click={toggleRail}
    title={expanded
      ? _t('widgets.collapseSidebar', { defaultMessage: 'Collapse sidebar' })
      : _t('widgets.expandSidebar', { defaultMessage: 'Expand sidebar' })}
    data-testid="WidgetIconPanel_toggleRail"
  >
    <FontIcon icon={expanded ? 'icon rail-collapse' : 'icon rail-expand'} />
    {#if expanded}<span class="label muted">{_t('widgets.collapse', { defaultMessage: 'Collapse' })}</span>{/if}
  </div>
</div>

<style>
  .wrapper {
    font-size: 18px;
    width: 34px;
    height: 34px;
    margin: 2px auto;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-widget-panel-foreground);
    position: relative;
    transition: var(--theme-widget-icon-transition);
    cursor: pointer;
  }
  .wrapper:hover {
    color: var(--theme-widget-icon-foreground-hover);
    background: var(--theme-widget-icon-background-hover);
  }
  .wrapper:active {
    transform: scale(0.92);
  }
  .wrapper.selected {
    color: var(--theme-widget-icon-foreground-active);
    background: var(--theme-widget-icon-background-active);
    border-left: var(--theme-widget-icon-border-active);
  }
  .main {
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: 6px 0;
  }

  .main.expanded .wrapper {
    width: auto;
    margin: 1px 8px;
    padding: 0 8px;
    gap: 10px;
    justify-content: flex-start;
    border-radius: 8px;
  }
  .main.expanded .wrapper:active {
    transform: scale(0.98);
  }
  .label {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--theme-sidebar-foreground);
  }
  .wrapper.selected .label {
    color: var(--theme-widget-icon-foreground-active);
  }
  .label.muted {
    color: var(--theme-widget-panel-foreground);
    font-weight: 400;
  }

  .premium-promo {
    position: absolute;
    text-transform: uppercase;
    font-size: 6pt;
    color: var(--theme-widget-panel-foreground);
    padding: 1px 3px;
    border-radius: 3px;
    bottom: 0;
  }
  .wrapper:hover .premium-promo {
    color: var(--theme-widget-icon-foreground-hover);
  }
  .wrapper.selected .premium-promo {
    color: var(--theme-widget-icon-foreground-active);
  }

  .premium-promo-not-seen {
    position: absolute;
    font-size: 16pt;
    color: var(--theme-icon-yellow);
    top: -5px;
    right: 5px;
  }

  :global(.widget-icon-panel-rounded) {
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
  }
</style>
