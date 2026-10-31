<script lang="ts" context="module">
  export const matchingProps = ['conid', 'database', 'schemaName', 'pureName'];
</script>

<script lang="ts">
  import _ from 'lodash';
  import { findEngineDriver } from 'dbgate-tools';
  import ToolStripContainer from '../buttons/ToolStripContainer.svelte';
  import ToolStripButton from '../buttons/ToolStripButton.svelte';
  import TableViewSwitch from '../buttons/TableViewSwitch.svelte';
  import FontIcon from '../icons/FontIcon.svelte';
  import SqlHighlighter from '../elements/SqlHighlighter.svelte';
  import TableDetailsSection from '../tabledetails/TableDetailsSection.svelte';
  import { getStructureDetails, hasPostgresCatalog, loadPostgresDetails } from '../tabledetails/tableDetailsLoader';
  import type { CatalogDetails } from '../tabledetails/tableDetailsLoader';
  import { useConnectionInfo, useDatabaseInfo, useTableInfo } from '../utility/metadataLoaders';
  import { extensions } from '../stores';
  import { apiCall } from '../utility/api';
  import openNewTab from '../utility/openNewTab';
  import formatFileSize from '../utility/formatFileSize';
  import { _t } from '../translations';

  export let conid;
  export let database;
  export let schemaName;
  export let pureName;
  export let tabPreviewMode = false;

  const connection = useConnectionInfo({ conid });
  const dbinfo = useDatabaseInfo({ conid, database });
  const tableInfo = useTableInfo({ conid, database, schemaName, pureName });

  $: driver = findEngineDriver($connection, $extensions);
  $: isPostgres = hasPostgresCatalog($connection);
  $: structure = $tableInfo && driver ? getStructureDetails($tableInfo, $dbinfo, driver) : null;

  let catalog: CatalogDetails = null;
  let loadCounter = 0;

  async function loadCatalog() {
    const counter = ++loadCounter;
    const res = await loadPostgresDetails({ conid, database, schemaName, pureName });
    if (counter == loadCounter) catalog = res;
  }

  $: if (isPostgres && conid && database && pureName) loadCatalog();

  function refresh() {
    apiCall('database-connections/sync-model', { conid, database });
    if (isPostgres) loadCatalog();
  }

  // catalog rows first; the analysed structure when there is no catalog query or it failed
  function resolve(catalogPart, structureRows) {
    if (catalogPart?.rows) return { rows: catalogPart.rows };
    if (structureRows) return { rows: structureRows };
    if (catalogPart?.error) return { rows: null, error: catalogPart.error };
    return { rows: [] };
  }

  $: loading = isPostgres ? !catalog : !structure;
  $: indexes = resolve(catalog?.indexes, structure?.indexes);
  $: triggers = resolve(catalog?.triggers, structure?.triggers);
  $: checks = resolve(catalog?.checks, structure?.checks);
  $: policies = resolve(catalog?.policies, null);
  $: enums = resolve(catalog?.enums, null);
  $: rls = catalog?.rls?.rows?.[0];

  // the structure has empty lists also for engines that never load these, so "none" would be a guess
  $: showTriggers = isPostgres || structure?.triggers?.length > 0;
  $: showChecks = isPostgres || structure?.checks?.length > 0;

  function joinSql(rows) {
    return (rows || [])
      .map(x => x.sql)
      .filter(x => x)
      .join('\n\n');
  }

  function rlsSql(rlsInfo, policyRows) {
    const lines = [];
    if (rlsInfo?.enabled) lines.push(`ALTER TABLE ${rlsInfo.qualifiedName} ENABLE ROW LEVEL SECURITY;`);
    if (rlsInfo?.forced) lines.push(`ALTER TABLE ${rlsInfo.qualifiedName} FORCE ROW LEVEL SECURITY;`);
    return _.compact([lines.join('\n'), joinSql(policyRows)]).join('\n\n');
  }

  function triggerStateLabel(state) {
    switch (state) {
      case 'disabled':
        return _t('tableDetails.triggerDisabled', { defaultMessage: 'Disabled' });
      case 'replica':
        return _t('tableDetails.triggerReplica', { defaultMessage: 'Replica only' });
      case 'always':
        return _t('tableDetails.triggerAlways', { defaultMessage: 'Always' });
      default:
        return _t('tableDetails.triggerEnabled', { defaultMessage: 'Enabled' });
    }
  }

  function findFunction(trigger) {
    return $dbinfo?.functions?.find(
      x => x.pureName == trigger.functionName && (!trigger.functionSchema || x.schemaName == trigger.functionSchema)
    );
  }

  function openFunction(func) {
    openNewTab({
      title: func.pureName,
      icon: 'img sql-file',
      tabComponent: 'SqlObjectTab',
      tabPreviewMode: true,
      props: {
        conid,
        database,
        schemaName: func.schemaName,
        pureName: func.pureName,
        objectTypeField: 'functions',
      },
    });
  }
</script>

<ToolStripContainer>
  <div class="scroll" data-testid="TableDetailsTab_container">
    <div class="page">
      <header class="hero">
        <div class="hero-icon"><FontIcon icon="icon table" /></div>
        <div class="hero-text">
          <div class="hero-title" title={pureName}>{pureName}</div>
          <div class="hero-subtitle">
            {_.compact([schemaName, database, driver?.title]).join(' · ')}
          </div>
        </div>
      </header>

      <TableDetailsSection
        id="indexes"
        title={_t('tableDetails.indexes', { defaultMessage: 'Indexes' })}
        count={indexes.rows?.length}
        sql={joinSql(indexes.rows)}
        {loading}
        error={indexes.error}
        emptyMessage={_t('tableDetails.noIndexes', { defaultMessage: 'No indexes' })}
      >
        {#each indexes.rows || [] as index (index.name)}
          <div class="row" data-testid="TableDetailsTab_index">
            <div class="row-main">
              <span class="name" title={index.name}>{index.name}</span>
              {#if index.isPrimary}
                <span class="badge accent">{_t('tableDetails.primary', { defaultMessage: 'Primary' })}</span>
              {:else if index.isUnique}
                <span class="badge">{_t('tableDetails.unique', { defaultMessage: 'Unique' })}</span>
              {/if}
              {#if index.method}
                <span class="badge mono">{index.method}</span>
              {/if}
              {#if index.isValid === false}
                <span class="badge danger">{_t('tableDetails.invalid', { defaultMessage: 'Invalid' })}</span>
              {/if}
              <span class="spacer" />
              {#if index.sizeBytes != null}
                <span class="meta">{formatFileSize(index.sizeBytes)}</span>
              {/if}
            </div>
            <div class="row-sub mono">
              {#if index.columns.length > 0}
                {index.columns.join(', ')}
              {:else}
                <span class="keyword">{_t('tableDetails.expression', { defaultMessage: 'expression' })}</span>
              {/if}
              {#if index.includeColumns.length > 0}
                <span class="keyword">INCLUDE</span> ({index.includeColumns.join(', ')})
              {/if}
            </div>
            {#if index.predicate}
              <div class="row-sub mono"><span class="keyword">WHERE</span> {index.predicate}</div>
            {/if}
          </div>
        {/each}
      </TableDetailsSection>

      {#if showTriggers}
        <TableDetailsSection
          id="triggers"
          title={_t('tableDetails.triggers', { defaultMessage: 'Triggers' })}
          count={triggers.rows?.length}
          sql={joinSql(triggers.rows)}
          {loading}
          error={triggers.error}
          emptyMessage={_t('tableDetails.noTriggers', { defaultMessage: 'No triggers' })}
        >
          {#each triggers.rows || [] as trigger (trigger.name)}
            {@const func = findFunction(trigger)}
            <div class="row" data-testid="TableDetailsTab_trigger">
              <div class="row-main">
                <span class="name" title={trigger.name}>{trigger.name}</span>
                {#if trigger.timing || trigger.events.length > 0}
                  <span class="badge">{_.compact([trigger.timing, trigger.events.join(' OR ')]).join(' ')}</span>
                {/if}
                {#if trigger.level}
                  <span class="badge subtle">
                    {trigger.level == 'ROW'
                      ? _t('tableDetails.forEachRow', { defaultMessage: 'for each row' })
                      : _t('tableDetails.forEachStatement', { defaultMessage: 'for each statement' })}
                  </span>
                {/if}
                <span class="spacer" />
                {#if trigger.state}
                  <span class="status" class:off={trigger.state == 'disabled'}>
                    <span class="dot" />
                    {triggerStateLabel(trigger.state)}
                  </span>
                {/if}
              </div>
              {#if trigger.functionName}
                <div class="row-sub">
                  <span class="label">{_t('tableDetails.executes', { defaultMessage: 'Executes' })}</span>
                  {#if func}
                    <button
                      class="link mono"
                      on:click={() => openFunction(func)}
                      title={_t('tableDetails.openFunction', { defaultMessage: 'Open the function SQL' })}
                    >
                      {_.compact([trigger.functionSchema, trigger.functionName]).join('.')}()
                    </button>
                  {:else}
                    <span class="mono">{_.compact([trigger.functionSchema, trigger.functionName]).join('.')}()</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </TableDetailsSection>
      {/if}

      {#if isPostgres}
        <TableDetailsSection
          id="policies"
          title={_t('tableDetails.policies', { defaultMessage: 'RLS policies' })}
          count={policies.rows?.length}
          sql={rlsSql(rls, policies.rows)}
          {loading}
          error={policies.error}
          emptyMessage={rls?.enabled
            ? _t('tableDetails.rlsNoPolicies', {
                defaultMessage: 'No policies. With RLS on, only the table owner can read or change rows.',
              })
            : _t('tableDetails.noPolicies', { defaultMessage: 'No policies' })}
        >
          <svelte:fragment slot="header">
            {#if rls}
              <span class="badge" class:success={rls.enabled} data-testid="TableDetailsTab_rlsEnabled">
                {rls.enabled
                  ? _t('tableDetails.rlsOn', { defaultMessage: 'RLS on' })
                  : _t('tableDetails.rlsOff', { defaultMessage: 'RLS off' })}
              </span>
              {#if rls.enabled}
                <span
                  class="badge"
                  class:warn={rls.forced}
                  class:subtle={!rls.forced}
                  data-testid="TableDetailsTab_rlsForced"
                >
                  {rls.forced
                    ? _t('tableDetails.rlsForced', { defaultMessage: 'Forced for owner' })
                    : _t('tableDetails.rlsNotForced', { defaultMessage: 'Not forced' })}
                </span>
              {/if}
            {/if}
          </svelte:fragment>
          <svelte:fragment slot="before">
            {#if rls && !rls.enabled}
              <div class="note">
                <FontIcon icon="img warn" />
                {_t('tableDetails.rlsOffNote', {
                  defaultMessage: 'Row level security is off, so these policies are not applied.',
                })}
              </div>
            {/if}
          </svelte:fragment>
          {#each policies.rows || [] as policy (policy.name)}
            <div class="row" data-testid="TableDetailsTab_policy">
              <div class="row-main">
                <span class="name" title={policy.name}>{policy.name}</span>
                <span class="badge mono">{policy.command}</span>
                <span class="badge" class:warn={!policy.isPermissive} class:subtle={policy.isPermissive}>
                  {policy.isPermissive
                    ? _t('tableDetails.permissive', { defaultMessage: 'Permissive' })
                    : _t('tableDetails.restrictive', { defaultMessage: 'Restrictive' })}
                </span>
              </div>
              <div class="row-sub">
                <span class="label">{_t('tableDetails.roles', { defaultMessage: 'Roles' })}</span>
                {#each policy.roles as role}
                  <span class="chip mono">{role}</span>
                {/each}
              </div>
              {#if policy.using}
                <div class="expr">
                  <div class="expr-label">USING</div>
                  <div class="expr-code"><SqlHighlighter code={policy.using} /></div>
                </div>
              {/if}
              {#if policy.withCheck}
                <div class="expr">
                  <div class="expr-label">WITH CHECK</div>
                  <div class="expr-code"><SqlHighlighter code={policy.withCheck} /></div>
                </div>
              {/if}
            </div>
          {/each}
        </TableDetailsSection>

        <TableDetailsSection
          id="enums"
          title={_t('tableDetails.enums', { defaultMessage: 'Enums' })}
          count={enums.rows?.length}
          sql={joinSql(enums.rows)}
          {loading}
          error={enums.error}
          emptyMessage={_t('tableDetails.noEnums', { defaultMessage: 'No enum columns' })}
        >
          {#each enums.rows || [] as enumType (enumType.typeName)}
            <div class="row" data-testid="TableDetailsTab_enum">
              <div class="row-main">
                <span class="name mono" title={enumType.typeName}>{enumType.typeName}</span>
                <span class="spacer" />
                <span class="meta">
                  {_t('tableDetails.usedBy', {
                    defaultMessage: 'Used by {columns}',
                    values: { columns: enumType.columns.join(', ') },
                  })}
                </span>
              </div>
              <div class="chips">
                {#each enumType.values as value}
                  <span class="chip">{value}</span>
                {/each}
              </div>
            </div>
          {/each}
        </TableDetailsSection>
      {/if}

      {#if showChecks}
        <TableDetailsSection
          id="checks"
          title={_t('tableDetails.checks', { defaultMessage: 'Check constraints' })}
          count={checks.rows?.length}
          sql={joinSql(checks.rows)}
          {loading}
          error={checks.error}
          emptyMessage={_t('tableDetails.noChecks', { defaultMessage: 'No check constraints' })}
        >
          {#each checks.rows || [] as check (check.name)}
            <div class="row" data-testid="TableDetailsTab_check">
              <div class="row-main">
                <span class="name" title={check.name}>{check.name}</span>
                {#if !check.isValidated}
                  <span class="badge warn">{_t('tableDetails.notValid', { defaultMessage: 'Not valid' })}</span>
                {/if}
              </div>
              <div class="expr-code"><SqlHighlighter code={check.expression} /></div>
            </div>
          {/each}
        </TableDetailsSection>
      {/if}
    </div>
  </div>

  <svelte:fragment slot="toolstrip">
    <TableViewSwitch
      active="details"
      {conid}
      {database}
      {schemaName}
      {pureName}
      objectTypeField="tables"
      {tabPreviewMode}
      testIds={{ data: 'TableDetailsTab_openData', structure: 'TableDetailsTab_openStructure' }}
    />

    <div class="toolstrip-spacer" />

    <ToolStripButton
      icon="icon reload"
      title={_t('tableDetails.refreshHint', { defaultMessage: 'Read the details again' })}
      on:click={refresh}
      data-testid="TableDetailsTab_refresh">{_t('common.refresh', { defaultMessage: 'Refresh' })}</ToolStripButton
    >
  </svelte:fragment>
</ToolStripContainer>

<style>
  .scroll {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    background: var(--theme-ui-surface);
  }

  .page {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 28px 48px;
  }

  .hero {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .hero-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 19px;
    color: var(--theme-ui-accent-strong);
    background: var(--theme-ui-bg);
    box-shadow: inset 0 0 0 1px var(--theme-ui-border);
  }
  .hero-text {
    min-width: 0;
    line-height: 1.3;
  }
  .hero-title {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -0.015em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hero-subtitle {
    font-size: 12px;
    color: var(--theme-generic-font-grayed);
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 14px;
  }
  .row + .row {
    border-top: 1px solid var(--theme-ui-border-subtle);
  }

  .row-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .name {
    min-width: 0;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spacer {
    flex: 1;
  }
  .meta {
    flex-shrink: 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--theme-generic-font-grayed);
  }

  .row-sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    color: var(--theme-ui-text-secondary);
    font-size: 12px;
    word-break: break-word;
  }
  .row-sub.mono {
    display: block;
  }
  .label {
    color: var(--theme-generic-font-grayed);
  }
  .keyword {
    color: var(--theme-generic-font-grayed);
    font-weight: 600;
  }

  .mono {
    font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, 'JetBrains Mono', Consolas, monospace;
    font-size: 12px;
  }

  .badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 5px;
    background: var(--theme-ui-hover);
    color: var(--theme-ui-text-secondary);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge.mono {
    font-size: 11px;
    font-weight: 500;
  }
  .badge.subtle {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--theme-ui-border);
    font-weight: 500;
  }
  .badge.accent {
    background: var(--theme-ui-accent-soft);
    color: var(--theme-ui-accent-strong);
  }
  .badge.success {
    background: var(--theme-status-valid-background);
    color: var(--theme-generic-font-success);
  }
  .badge.warn {
    background: var(--theme-status-testing-background);
    color: var(--theme-icon-gold);
    box-shadow: none;
  }
  .badge.danger {
    background: var(--theme-status-error-background);
    color: var(--theme-generic-font-error);
  }

  .status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--theme-ui-text-secondary);
  }
  .status .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--theme-icon-green);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-icon-green) 18%, transparent);
  }
  .status.off {
    color: var(--theme-generic-font-grayed);
  }
  .status.off .dot {
    background: var(--theme-ui-text-tertiary);
    box-shadow: none;
  }

  .link {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--theme-link-foreground);
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
  .link:focus-visible {
    outline: none;
    border-radius: 3px;
    box-shadow: var(--theme-input-focus-ring);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    border-radius: 10px;
    background: var(--theme-ui-surface-2);
    box-shadow: inset 0 0 0 1px var(--theme-ui-border);
    color: var(--theme-generic-font);
    font-size: 12px;
  }
  .chip.mono {
    height: 18px;
    padding: 0 7px;
    font-size: 11.5px;
  }

  .expr {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .expr-label {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--theme-generic-font-grayed);
  }
  .expr-code {
    padding: 6px 10px;
    border-radius: var(--dim-radius-sm);
    background: var(--theme-ui-surface);
    box-shadow: inset 0 0 0 1px var(--theme-ui-border-subtle);
  }
  .expr-code :global(pre) {
    margin: 0;
    padding: 0;
    background: transparent;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .note {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding: 8px 12px;
    border-radius: var(--dim-radius-md);
    background: var(--theme-status-testing-background);
    color: var(--theme-generic-font);
    font-size: 12px;
  }
  .note :global(.mdi) {
    color: var(--theme-icon-gold);
  }
</style>
