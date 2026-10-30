import { isTypeDateTime, isTypeNumber } from 'dbgate-tools';
import type { EngineDriver } from 'dbgate-types';
import { apiCall } from '../utility/api';

// Stats read at most this many rows, so a click on a huge table stays cheap.
export const QUICK_STATS_ROW_CAP = 100000;

export interface ColumnQuickStats {
  totalRows: number;
  nullCount: number;
  distinctCount: number | null;
  minValue: any;
  maxValue: any;
  hasRange: boolean;
  isCapped: boolean;
  // Set when the full query failed and only the counts could be loaded
  partial: boolean;
}

interface StatsColumn {
  schemaName?: string;
  pureName: string;
  columnName: string;
  dataType?: string;
}

function createStatsSelect(driver: EngineDriver, column: StatsColumn, withExtras: boolean) {
  const dialect = driver?.dialect;
  const value = { exprType: 'column', columnName: 'v' };
  const sample: any = {
    commandType: 'select',
    from: { name: { schemaName: column.schemaName, pureName: column.pureName } },
    columns: [{ exprType: 'column', columnName: column.columnName, alias: 'v' }],
  };
  const isCapped = !!(dialect?.rangeSelect || dialect?.limitSelect || dialect?.topRecords);
  if (isCapped) sample.topRecords = QUICK_STATS_ROW_CAP;

  const hasRange = withExtras && (isTypeNumber(column.dataType) || isTypeDateTime(column.dataType));
  const withDistinct = withExtras && !dialect?.disableGroupingForDataType?.(column.dataType);

  const columns: any[] = [
    { exprType: 'raw', sql: 'COUNT(*)', alias: 'total_rows' },
    { exprType: 'call', func: 'COUNT', args: [value], alias: 'non_null' },
  ];
  if (withDistinct) {
    columns.push({ exprType: 'call', func: 'COUNT', argsPrefix: 'DISTINCT', args: [value], alias: 'distinct_count' });
  }
  if (hasRange) {
    columns.push({ exprType: 'call', func: 'MIN', args: [value], alias: 'min_value' });
    columns.push({ exprType: 'call', func: 'MAX', args: [value], alias: 'max_value' });
  }

  return {
    select: { commandType: 'select', from: { subQuery: sample, alias: 'subq' }, columns },
    hasRange,
    withDistinct,
    isCapped,
  };
}

async function runStatsSelect(conid: string, database: string, select) {
  const resp = await apiCall('database-connections/sql-select', { conid, database, select, commandTimeout: 15000 });
  if (resp?.errorMessage) throw new Error(resp.errorMessage);
  return resp?.rows?.[0] ?? {};
}

function readCount(row, name) {
  const value = row[name] ?? row[name.toUpperCase()];
  return value == null ? null : Number(value);
}

export async function loadColumnQuickStats(
  conid: string,
  database: string,
  driver: EngineDriver,
  column: StatsColumn
): Promise<ColumnQuickStats> {
  let query = createStatsSelect(driver, column, true);
  let partial = false;
  let row;
  try {
    row = await runStatsSelect(conid, database, query.select);
  } catch (err) {
    // Some types can't be compared or de-duplicated (json, xml, geometry...); fall back to plain counts
    if (!query.hasRange && !query.withDistinct) throw err;
    query = createStatsSelect(driver, column, false);
    row = await runStatsSelect(conid, database, query.select);
    partial = true;
  }

  const totalRows = readCount(row, 'total_rows') ?? 0;
  const nonNull = readCount(row, 'non_null') ?? 0;
  return {
    totalRows,
    nullCount: totalRows - nonNull,
    distinctCount: query.withDistinct ? readCount(row, 'distinct_count') : null,
    minValue: query.hasRange ? row.min_value ?? row.MIN_VALUE : null,
    maxValue: query.hasRange ? row.max_value ?? row.MAX_VALUE : null,
    hasRange: query.hasRange,
    isCapped: query.isCapped && totalRows >= QUICK_STATS_ROW_CAP,
    partial,
  };
}
