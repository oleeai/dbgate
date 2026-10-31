import { writableWithStorage } from '../stores';

// The per-column filter row under the grid headers stays hidden until the user asks for it
// (Ctrl/Cmd+F, the grid corner toggle, the command palette or "Filter by this column").
// One switch for all grids, remembered between sessions. An active filter always shows the row.
export const dataGridFilterRowVisible = writableWithStorage<boolean>(
  false,
  'dataGridFilterRowVisible',
  value => !value
);
