import { writable } from 'svelte/store';
import openNewTab from '../utility/openNewTab';

// Ids of query tabs that should run their query as soon as it has loaded ("Run" in the saved
// queries and history panels). Kept in memory only, so reloading the page never runs a query
// again, unlike the autoExecute front matter.
export const pendingQueryRuns = writable<string[]>([]);

export function consumePendingQueryRun(tabid: string) {
  pendingQueryRuns.update(ids => ids.filter(x => x != tabid));
}

/** Opens a query tab (or selects the one already open for the same saved file) and runs it. */
export default async function runQueryInTab(newTab, initialData = undefined, options = undefined) {
  const tabid = await openNewTab(newTab, initialData, options);
  if (tabid) {
    pendingQueryRuns.update(ids => [...ids.filter(x => x != tabid), tabid]);
  }
  return tabid;
}
