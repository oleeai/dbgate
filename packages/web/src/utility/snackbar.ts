import { openedSnackbars } from '../stores';

export interface SnackbarButton {
  label: string;
  onClick: Function;
  autoClose?: boolean;
}

export interface SnackbarAction {
  label: string;
  onClick: Function;
  // shortcut shown next to the label, e.g. CtrlOrCommand+Z
  keyText?: string;
}

export interface SnackbarInfo {
  message: string;
  progressMessage?: string;
  icon?: string;
  autoClose?: boolean;
  allowClose?: boolean;
  buttons?: SnackbarButton[];
  // 'center' is a compact toast at the bottom center with one inline action, e.g. "Deleted 3 rows · Undo"
  placement?: 'corner' | 'center';
  action?: SnackbarAction;
  // auto close delay in ms (paused while the pointer is over the snackbar)
  timeout?: number;
  // a new snackbar of the same group replaces the previous one
  group?: string;
}

let lastSnackbarId = 0;
const lastSnackbarIdByGroup = {};

export function showSnackbar(snackbar: SnackbarInfo): string {
  lastSnackbarId += 1;
  const id = lastSnackbarId.toString();
  const { group, ...props } = snackbar;
  const replacedId = group ? lastSnackbarIdByGroup[group] : null;
  if (group) lastSnackbarIdByGroup[group] = id;
  openedSnackbars.update(x => [
    ...x.filter(item => item.id != replacedId),
    {
      ...props,
      id,
    },
  ]);
  return id;
}

// For edits that are easy to take back: a toast with Undo instead of a confirmation dialog
export function showUndoToast(message: string, undoLabel: string, onUndo: Function): string {
  return showSnackbar({
    message,
    placement: 'center',
    group: 'undo',
    autoClose: true,
    timeout: 6000,
    allowClose: true,
    action: { label: undoLabel, onClick: onUndo, keyText: 'CtrlOrCommand+Z' },
  });
}

export function showSnackbarSuccess(message: string) {
  showSnackbar({
    message,
    icon: 'img ok',
    allowClose: true,
    autoClose: true,
  });
}

export function showSnackbarInfo(message: string) {
  showSnackbar({
    message,
    icon: 'img info',
    allowClose: true,
    autoClose: true,
  });
}

export function showSnackbarError(message: string) {
  showSnackbar({
    message,
    icon: 'img error',
    allowClose: true,
    autoClose: true,
  });
}

export function closeSnackbar(snackId: string) {
  openedSnackbars.update(x => x.filter(x => x.id != snackId));
}

export function updateSnackbarProgressMessage(snackId: string, progressMessage: string) {
  openedSnackbars.update(x => x.map(x => (x.id === snackId ? { ...x, progressMessage } : x)));
}

//   showSnackbar({
//     icon: 'img ok',
//     message: 'Test snackbar',
//     allowClose: true,
//   });
// showSnackbar({
//   icon: 'img ok',
//   message: 'Auto close',
//   autoClose: true,
// });
//   showSnackbar({
//     icon: 'img warn',
//     message: 'Buttons',
//     buttons: [{ label: 'OK', onClick: () => console.log('OK') }],
//   });
