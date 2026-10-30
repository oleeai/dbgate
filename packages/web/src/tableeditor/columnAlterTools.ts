import { tick } from 'svelte';
import {
  editorDeleteColumn,
  editorDeleteConstraint,
  extendTableInfo,
  fillConstraintNames,
  fillEditorColumnInfo,
  generateTablePairingId,
  getAlterTableScript,
} from 'dbgate-tools';
import type { DatabaseInfo, EngineDriver, TableInfo } from 'dbgate-types';
import ConfirmSqlModal from '../modals/ConfirmSqlModal.svelte';
import ErrorMessageModal from '../modals/ErrorMessageModal.svelte';
import { showModal } from '../modals/modalTools';
import { apiCall } from '../utility/api';
import { getDatabaseInfo, useDatabaseInfo } from '../utility/metadataLoaders';
import { showSnackbarSuccess } from '../utility/snackbar';
import { _t } from '../translations';

interface ColumnAlterContext {
  conid: string;
  database: string;
  driver: EngineDriver;
}

export function findTable(dbInfo: DatabaseInfo, schemaName: string, pureName: string): TableInfo {
  return dbInfo?.tables?.find(x => x.pureName == pureName && x.schemaName == schemaName);
}

// Constraints that belong to one column only, so the side panel can show them as plain switches
export function findSingleColumnUnique(table: TableInfo, columnName: string) {
  return table?.uniques?.find(x => x.columns?.length == 1 && x.columns[0].columnName == columnName);
}

export function findSingleColumnForeignKey(table: TableInfo, columnName: string) {
  return table?.foreignKeys?.find(x => x.columns?.length == 1 && x.columns[0].columnName == columnName);
}

// sync-model only starts the analysis, so wait until the reloaded structure actually reaches the client
async function refreshStructure(conid: string, database: string) {
  const before = await getDatabaseInfo({ conid, database });
  await apiCall('database-connections/sync-model', { conid, database });
  await new Promise<void>(resolve => {
    let unsubscribe = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // the store calls back synchronously on subscribe, before unsubscribe is assigned
      setTimeout(() => unsubscribe?.());
      resolve();
    };
    const timer = setTimeout(finish, 10000);
    unsubscribe = useDatabaseInfo({ conid, database }).subscribe(info => {
      if (info && info !== before) finish();
    });
  });
}

/**
 * Builds the alter script with the table editor's alter plan, shows it in the SQL confirm dialog and runs it.
 * Returns false when the plan is empty, so the caller can say there is nothing to save.
 */
export function confirmTableAlter(
  { conid, database, driver }: ColumnAlterContext,
  dbInfo: DatabaseInfo,
  baseTable: TableInfo,
  newTable: TableInfo,
  { onSaved = null, onApplied = null }: { onSaved?: () => void; onApplied?: () => void } = {}
) {
  const { sql, recreates } = getAlterTableScript(
    baseTable,
    extendTableInfo(fillConstraintNames(newTable, driver.dialect)),
    {},
    dbInfo,
    dbInfo,
    driver
  );
  if (!sql?.trim()) return false;

  showModal(ConfirmSqlModal, {
    sql,
    recreates,
    engine: driver.engine,
    onConfirm: async script => {
      const resp = await apiCall('database-connections/run-script', {
        conid,
        database,
        sql: script,
        useTransaction: true,
      });
      if (resp?.errorMessage) {
        showModal(ErrorMessageModal, {
          title: _t('columnPanel.alterFailed', { defaultMessage: 'Could not change the table' }),
          message: resp.errorMessage,
        });
        return;
      }
      onApplied?.();
      showSnackbarSuccess(_t('columnPanel.saved', { defaultMessage: 'Table structure saved' }));
      await refreshStructure(conid, database);
      await tick();
      onSaved?.();
    },
  });
  return true;
}

export async function confirmDeleteColumn(
  context: ColumnAlterContext,
  { schemaName, pureName, columnName }: { schemaName: string; pureName: string; columnName: string },
  callbacks: { onSaved?: () => void; onApplied?: () => void } = {}
) {
  const dbInfo = await getDatabaseInfo({ conid: context.conid, database: context.database });
  const table = generateTablePairingId(findTable(dbInfo, schemaName, pureName));
  const column = table?.columns?.find(x => x.columnName == columnName);
  if (!column) return;

  let newTable = editorDeleteColumn(table, fillEditorColumnInfo(column, table));
  // Drop this table's own keys and indexes on the column first, so the script reads the same on every engine
  const usesColumn = constraint => constraint.columns?.some(x => x.columnName == columnName);
  for (const constraint of [
    ...(newTable.foreignKeys || []),
    ...(newTable.uniques || []),
    ...(newTable.indexes || []),
  ].filter(usesColumn)) {
    newTable = editorDeleteConstraint(newTable, constraint);
  }

  confirmTableAlter(context, dbInfo, table, newTable, callbacks);
}
