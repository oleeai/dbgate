import _ from 'lodash';
import { derived, get, writable } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { getLocalStorage, setLocalStorage } from '../utility/storageCache';
import { isColumnHeaderCell, isTableHeaderCell } from '../datagrid/selection';

export type InspectorSection = 'row' | 'column' | 'table' | 'value';
// what kind of thing is selected in the grid: cells or rows, a whole column, or nothing in particular
export type InspectorSelectionKind = 'cell' | 'column' | 'table';

const OPEN_STORAGE_KEY = 'tableInspectorOpen';

export interface InspectorGridApi {
  navigateRow: (rowIndex: number, delta: number) => void;
  // a row was inserted from the inspector: announce it and select it
  rowInserted: (rowIndex: number) => void;
  focus: () => void;
  refresh: () => void;
}

export interface InspectorGridInput {
  grider: any;
  display: any;
  currentCell: any;
  selectedCells: any[];
  // unique names of the visible columns, by column index
  columnNames: string[];
  editorTypes: any;
  allRowCount: number;
}

export interface InspectorGrid extends InspectorGridInput {
  api: InspectorGridApi;
  kind: InspectorSelectionKind;
  cellKey: string;
  rowIndex: number | null;
  // the table's own column under the cursor, null for columns expanded from a referenced table
  columnName: string | null;
  // the grid's current column, to point at its field in the row
  columnUniqueName: string | null;
}

interface ExplicitSection {
  section: InspectorSection;
  kind: InspectorSelectionKind;
  // a column picked from a header menu, kept until the grid cursor moves
  columnName?: string;
  cellKey?: string;
}

export interface InspectorState {
  open: boolean;
  // opened by Edit row, Insert row, Edit column...; closes again when that task is done
  transient: boolean;
  insert: boolean;
  // the column editor, columnName null adds a column
  columnEdit: { columnName: string | null } | null;
  explicit: ExplicitSection | null;
  // incremented when a command wants the inspector to take the keyboard focus
  focusRequest: number;
  grid: InspectorGrid | null;
  cells: any[];
}

export interface InspectorView extends InspectorState {
  section: InspectorSection;
  available: Record<InspectorSection, boolean>;
  rowIndex: number | null;
  columnName: string | null;
  // a new row or the column editor is open, the other sections wait until it is saved or cancelled
  busy: boolean;
}

export interface TableInspector {
  conid: string;
  database: string;
  schemaName: string;
  pureName: string;
  view: Readable<InspectorView>;
  getView: () => InspectorView;
  matchesTable: (obj: { schemaName?: string; pureName?: string }) => boolean;
  toggle: () => void;
  close: () => void;
  selectSection: (section: InspectorSection) => void;
  editRow: (options?: { focus?: boolean }) => void;
  startInsert: () => void;
  finishInsert: (rowIndex?: number) => void;
  finishTask: () => void;
  showColumn: (columnName: string) => void;
  editColumn: (columnName: string | null) => void;
  finishColumnEdit: () => void;
  toggleValue: () => void;
  escapeFromGrid: () => boolean;
  setGrid: (api: InspectorGridApi, input: InspectorGridInput) => void;
  clearGrid: (api: InspectorGridApi) => void;
  setCells: (cells: any[]) => void;
}

function describeGrid(api: InspectorGridApi, input: InspectorGridInput): InspectorGrid {
  const { grider, display, currentCell, selectedCells, columnNames } = input;
  const rowIndex = _.isNumber(currentCell?.[0]) && grider?.getRowData(currentCell[0]) ? currentCell[0] : null;
  const columnUniqueName = _.isNumber(currentCell?.[1]) ? (columnNames?.[currentCell[1]] ?? null) : null;
  const column = columnUniqueName ? display?.columns?.find(x => x.uniqueName == columnUniqueName) : null;
  const columnName = display?.baseTable && column?.uniquePath?.length == 1 ? column.columnName : null;

  let kind: InspectorSelectionKind = 'table';
  if (!isTableHeaderCell(currentCell) && !selectedCells?.some(isTableHeaderCell)) {
    if (isColumnHeaderCell(currentCell)) kind = 'column';
    else if (rowIndex != null) kind = 'cell';
  }

  return {
    ...input,
    api,
    kind,
    cellKey: JSON.stringify(currentCell ?? null),
    rowIndex,
    columnName,
    columnUniqueName,
  };
}

function getTargetColumn(state: InspectorState) {
  if (state.columnEdit) return state.columnEdit.columnName;
  if (state.explicit?.section == 'column' && state.explicit.columnName) return state.explicit.columnName;
  return state.grid?.columnName ?? null;
}

function isAvailable(state: InspectorState, section: InspectorSection) {
  switch (section) {
    case 'row':
      return state.insert || state.grid?.rowIndex != null;
    case 'column':
      return !!state.columnEdit || !!getTargetColumn(state);
    case 'value':
      return !!state.grid && state.cells.length > 0;
    default:
      return true;
  }
}

// a task (new row, column editor) wins, then the section asked for, then whatever is selected in the grid
function resolveSection(state: InspectorState): InspectorSection {
  if (state.insert) return 'row';
  if (state.columnEdit) return 'column';
  if (state.explicit && isAvailable(state, state.explicit.section)) return state.explicit.section;
  const kind = state.grid?.kind;
  if (kind == 'column' && isAvailable(state, 'column')) return 'column';
  if (kind == 'cell' && isAvailable(state, 'row')) return 'row';
  return 'table';
}

export function createTableInspector({ conid, database, schemaName, pureName }): TableInspector {
  const state = writable<InspectorState>({
    open: !!getLocalStorage(OPEN_STORAGE_KEY, false),
    transient: false,
    insert: false,
    columnEdit: null,
    explicit: null,
    focusRequest: 0,
    grid: null,
    cells: [],
  });

  const view = derived(state, (value): InspectorView => {
    const busy = value.insert || !!value.columnEdit;
    return {
      ...value,
      section: resolveSection(value),
      available: {
        row: isAvailable(value, 'row') && (!busy || value.insert),
        column: isAvailable(value, 'column') && (!busy || !!value.columnEdit),
        table: !busy,
        value: isAvailable(value, 'value') && !busy,
      },
      rowIndex: value.grid?.rowIndex ?? null,
      columnName: getTargetColumn(value),
      busy,
    };
  });

  // shows the inspector for a task; when it was closed, it closes again once the task is done
  function reveal(changes: Partial<InspectorState>) {
    state.update(value => ({
      ...value,
      ...changes,
      transient: value.open ? value.transient : true,
      open: true,
    }));
  }

  function dismiss() {
    state.update(value => ({
      ...value,
      open: false,
      transient: false,
      insert: false,
      columnEdit: null,
      explicit: null,
    }));
  }

  function close() {
    setLocalStorage(OPEN_STORAGE_KEY, false);
    dismiss();
  }

  function toggle() {
    if (get(state).open) {
      close();
    } else {
      setLocalStorage(OPEN_STORAGE_KEY, true);
      state.update(value => ({ ...value, open: true, transient: false }));
    }
  }

  function finishTask() {
    const value = get(state);
    if (value.transient) dismiss();
    else value.grid?.api.focus();
  }

  function currentKind() {
    return get(state).grid?.kind ?? 'table';
  }

  return {
    conid,
    database,
    schemaName,
    pureName,
    view,
    getView: () => get(view),
    matchesTable: obj => !!obj && obj.pureName == pureName && (obj.schemaName ?? null) == (schemaName ?? null),
    toggle,
    close,
    finishTask,

    selectSection(section) {
      const value = get(state);
      if (value.insert || value.columnEdit) return;
      state.update(x => ({ ...x, explicit: { section, kind: currentKind() } }));
    },

    editRow({ focus = true } = {}) {
      reveal({
        insert: false,
        columnEdit: null,
        explicit: { section: 'row', kind: 'cell' },
        focusRequest: get(state).focusRequest + (focus ? 1 : 0),
      });
    },

    startInsert() {
      reveal({ insert: true, columnEdit: null, explicit: null, focusRequest: get(state).focusRequest + 1 });
    },

    finishInsert(rowIndex) {
      const value = get(state);
      state.update(x => ({ ...x, insert: false }));
      if (_.isNumber(rowIndex)) value.grid?.api.rowInserted(rowIndex);
      finishTask();
    },

    showColumn(columnName) {
      const grid = get(state).grid;
      reveal({
        insert: false,
        columnEdit: null,
        explicit: { section: 'column', kind: grid?.kind ?? 'table', columnName, cellKey: grid?.cellKey },
      });
    },

    editColumn(columnName) {
      reveal({ insert: false, columnEdit: { columnName }, focusRequest: get(state).focusRequest + 1 });
    },

    finishColumnEdit() {
      state.update(x => ({ ...x, columnEdit: null }));
      finishTask();
    },

    toggleValue() {
      const current = get(view);
      if (current.open && current.section == 'value') {
        if (current.transient) dismiss();
        else state.update(x => ({ ...x, explicit: null }));
        return;
      }
      if (current.busy) return;
      reveal({ explicit: { section: 'value', kind: currentKind() } });
    },

    // Esc in the grid closes an inspector that a task opened, like it closed the old row sheet
    escapeFromGrid() {
      const value = get(state);
      if (!value.open || !value.transient) return false;
      dismiss();
      return true;
    },

    setGrid(api, input) {
      state.update(value => {
        const grid = describeGrid(api, input);
        let explicit = value.explicit;
        if (explicit && (explicit.kind != grid.kind || (explicit.cellKey && explicit.cellKey != grid.cellKey))) {
          explicit = null;
        }
        return { ...value, grid, explicit };
      });
    },

    clearGrid(api) {
      state.update(value => (value.grid?.api == api ? { ...value, grid: null, cells: [] } : value));
    },

    setCells(cells) {
      state.update(value => ({ ...value, cells: cells || [] }));
    },
  };
}
