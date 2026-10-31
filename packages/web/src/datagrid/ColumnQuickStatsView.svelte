<script lang="ts">
  import { stringifyCellValue } from 'dbgate-tools';
  import FontIcon from '../icons/FontIcon.svelte';
  import { QUICK_STATS_ROW_CAP } from './columnQuickStats';
  import { _t } from '../translations';

  export let driver;
  export let stats = null;
  export let errorMessage = null;
  export let isLoading = true;

  function formatCount(value) {
    return value == null ? '—' : Number(value).toLocaleString();
  }

  // Same formatting as the grid cells, so decimals and dates read the same way
  function formatValue(value) {
    if (value == null) return '—';
    return stringifyCellValue(value, 'gridCellIntent', driver?.dataEditorTypesBehaviour).value;
  }

  $: nullPercent = stats?.totalRows > 0 ? (stats.nullCount / stats.totalRows) * 100 : null;
  $: nullPercentLabel =
    nullPercent == null ? '' : nullPercent > 0 && nullPercent < 0.1 ? '<0.1%' : `${nullPercent.toFixed(1)}%`;
</script>

{#if errorMessage}
  <div class="error" data-testid="ColumnQuickStats_error">
    <FontIcon icon="img error" />
    <span>{errorMessage}</span>
  </div>
{:else}
  <dl class="stats" class:loading={isLoading} aria-busy={isLoading}>
    <div class="stat">
      <dt>{_t('columnStats.rows', { defaultMessage: 'Rows' })}</dt>
      <dd data-testid="ColumnQuickStats_rows">
        {#if isLoading || !stats}<span class="skeleton" />{:else}{formatCount(stats.totalRows)}{stats.isCapped
            ? '+'
            : ''}{/if}
      </dd>
    </div>
    <div class="stat">
      <dt>{_t('columnStats.nulls', { defaultMessage: 'Null' })}</dt>
      <dd data-testid="ColumnQuickStats_nulls">
        {#if isLoading || !stats}<span class="skeleton" />{:else}{formatCount(stats.nullCount)}
          {#if nullPercentLabel}<span class="muted">{nullPercentLabel}</span>{/if}{/if}
      </dd>
    </div>
    {#if !isLoading && nullPercent != null}
      <div class="meter" aria-hidden="true">
        <span style={`width:${Math.min(100, Math.max(nullPercent, nullPercent > 0 ? 2 : 0))}%`} />
      </div>
    {/if}
    {#if isLoading || !stats || stats.distinctCount != null}
      <div class="stat">
        <dt>{_t('columnStats.distinct', { defaultMessage: 'Distinct' })}</dt>
        <dd data-testid="ColumnQuickStats_distinct">
          {#if isLoading || !stats}<span class="skeleton" />{:else}{formatCount(stats.distinctCount)}{/if}
        </dd>
      </div>
    {/if}
    {#if !isLoading && stats?.hasRange}
      <div class="stat">
        <dt>{_t('columnStats.min', { defaultMessage: 'Min' })}</dt>
        <dd class="value" title={formatValue(stats.minValue)} data-testid="ColumnQuickStats_min">
          {formatValue(stats.minValue)}
        </dd>
      </div>
      <div class="stat">
        <dt>{_t('columnStats.max', { defaultMessage: 'Max' })}</dt>
        <dd class="value" title={formatValue(stats.maxValue)} data-testid="ColumnQuickStats_max">
          {formatValue(stats.maxValue)}
        </dd>
      </div>
    {/if}
  </dl>

  {#if !isLoading && stats}
    <div class="footnote">
      {#if stats.isCapped}
        {_t('columnStats.cappedNote', {
          defaultMessage: 'From the first {count} rows',
          values: { count: QUICK_STATS_ROW_CAP.toLocaleString() },
        })}
      {:else}
        {_t('columnStats.wholeTableNote', { defaultMessage: 'Whole table, current filters ignored' })}
      {/if}
      {#if stats.partial}
        · {_t('columnStats.partialNote', { defaultMessage: 'distinct and range not available for this type' })}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .stats {
    margin: 0;
    padding: 6px 12px 4px;
  }
  .stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
  }
  dt {
    flex-shrink: 0;
    color: var(--theme-generic-font-grayed);
  }
  dd {
    margin: 0;
    min-width: 0;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  dd.value {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .muted {
    margin-left: 4px;
    font-weight: 400;
    color: var(--theme-generic-font-grayed);
  }

  .meter {
    height: 4px;
    margin: 0 0 4px;
    border-radius: 2px;
    background: var(--theme-ui-hover);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--theme-ui-accent);
  }

  .skeleton {
    display: inline-block;
    width: 56px;
    height: 10px;
    border-radius: 4px;
    background: var(--theme-ui-active);
    animation: column-stats-pulse 1.1s ease-in-out infinite alternate;
  }
  @keyframes column-stats-pulse {
    to {
      opacity: 0.45;
    }
  }

  .footnote {
    padding: 6px 12px 9px;
    font-size: 11.5px;
    color: var(--theme-generic-font-grayed);
  }

  .error {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 12px 12px;
    font-size: 12px;
    color: var(--theme-generic-font-error);
    word-break: break-word;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
</style>
