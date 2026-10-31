import _ from 'lodash';
import { tick } from 'svelte';
import { closeSnackbar, showUndoToast } from '../utility/snackbar';
import { _t } from '../translations';

// Grid edits only change the pending changes; nothing reaches the database before Save (which shows its SQL
// first). So they don't ask for confirmation. Instead a toast says what happened and offers Undo; ⌘Z / Ctrl+Z
// does the same through the grid's own undo.

export type GridUndoKind =
  'delete' | 'setNull' | 'removeField' | 'revertRows' | 'revertAll' | 'paste' | 'clone' | 'insert';

function itemKey(item) {
  return JSON.stringify([item.schemaName, item.pureName, item.insertedRowIndex, item.existingRowIndex, item.condition]);
}

// values that are new or different in the change set after the edit
function countChangedValues(before, after) {
  let count = 0;
  for (const field of ['inserts', 'updates']) {
    const previous = _.keyBy(before?.[field] || [], itemKey);
    for (const item of after?.[field] || []) {
      const old = previous[itemKey(item)];
      for (const [column, value] of Object.entries(item.fields || {})) {
        if (!old?.fields || !(column in old.fields) || !_.isEqual(old.fields[column], value)) count += 1;
      }
      if (item.document && !_.isEqual(item.document, old?.document)) count += 1;
    }
  }
  return count;
}

function rowItemCount(changeSet) {
  return (changeSet?.inserts?.length ?? 0) + (changeSet?.updates?.length ?? 0) + (changeSet?.deletes?.length ?? 0);
}

function getMessage(kind: GridUndoKind, before, after): string {
  const deleted = (after?.deletes?.length ?? 0) - (before?.deletes?.length ?? 0);
  const inserted = (after?.inserts?.length ?? 0) - (before?.inserts?.length ?? 0);
  switch (kind) {
    case 'delete':
      if (deleted > 0) {
        return _t('datagrid.undoToast.rowsMarkedForDeletion', {
          defaultMessage: '{count, plural, one {# row} other {# rows}} marked for deletion',
          values: { count: deleted },
        });
      }
      return _t('datagrid.undoToast.newRowsRemoved', {
        defaultMessage: 'Removed {count, plural, one {# new row} other {# new rows}}',
        values: { count: Math.max(-inserted, 1) },
      });
    case 'setNull':
      return _t('datagrid.undoToast.setNull', {
        defaultMessage: '{count, plural, one {# value} other {# values}} set to NULL',
        values: { count: Math.max(countChangedValues(before, after), 1) },
      });
    case 'removeField':
      return _t('datagrid.undoToast.removeField', {
        defaultMessage: 'Removed {count, plural, one {# field} other {# fields}}',
        values: { count: Math.max(countChangedValues(before, after), 1) },
      });
    case 'revertRows':
      return _t('datagrid.undoToast.revertRows', {
        defaultMessage: 'Reverted changes in {count, plural, one {# row} other {# rows}}',
        values: { count: Math.max(rowItemCount(before) - rowItemCount(after), 1) },
      });
    case 'revertAll':
      return _t('datagrid.undoToast.revertAll', { defaultMessage: 'Reverted all pending changes' });
    case 'paste':
      if (inserted > 0) {
        return _t('datagrid.undoToast.pastedRows', {
          defaultMessage: 'Pasted {count, plural, one {# new row} other {# new rows}}',
          values: { count: inserted },
        });
      }
      return _t('datagrid.undoToast.pastedValues', {
        defaultMessage: 'Pasted {count, plural, one {# value} other {# values}}',
        values: { count: Math.max(countChangedValues(before, after), 1) },
      });
    case 'clone':
      return _t('datagrid.undoToast.cloned', {
        defaultMessage: 'Cloned {count, plural, one {# row} other {# rows}}',
        values: { count: Math.max(inserted, 1) },
      });
    case 'insert':
      return _t('datagrid.undoToast.inserted', {
        defaultMessage: '{count, plural, one {Added a new row} other {Added # new rows}}',
        values: { count: Math.max(inserted, 1) },
      });
  }
}

export function createGridUndoToast(getGrider: () => any) {
  let toastId: string = null;
  // the pending changes right after the edit; Undo only applies while they are still the latest
  let changeSetAfter = null;

  function close() {
    if (toastId) closeSnackbar(toastId);
    toastId = null;
    changeSetAfter = null;
  }

  function undo() {
    const grider = getGrider();
    if (changeSetAfter && grider?.changeSetState?.value === changeSetAfter) grider.undo();
    close();
  }

  // Call right after an edit of the pending changes. The grid still holds the change set from before the edit
  // (it gets the new one on its next update), so the two can be compared and the edit offered for undo.
  async function announce(kind: GridUndoKind) {
    const before = getGrider()?.changeSetState?.value;
    await tick();
    const grider = getGrider();
    const after = grider?.changeSetState?.value;
    if (!after || !grider.canUndo || after === before || _.isEqual(before, after)) return;
    const message = getMessage(kind, before, after);
    toastId = showUndoToast(message, _t('datagrid.undoToast.undo', { defaultMessage: 'Undo' }), undo);
    changeSetAfter = after;
  }

  // the toast goes away as soon as the pending changes move on: another edit, undo, redo or save
  function sync(grider) {
    if (toastId && grider?.changeSetState?.value !== changeSetAfter) close();
  }

  return { announce, sync, close };
}
