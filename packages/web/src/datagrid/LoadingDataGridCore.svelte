<script lang="ts">
  import { getIntSettingsValue } from '../settings/settingsTools';
  import { onDestroy, setContext } from 'svelte';
  import { writable } from 'svelte/store';

  import createRef from '../utility/createRef';
  import { useSettings } from '../utility/metadataLoaders';
  import { fetchAll, type FetchAllHandle } from '../utility/fetchAll';
  import { apiCall } from '../utility/api';

  import DataGridCore from './DataGridCore.svelte';

  export let loadDataPage;
  export let dataPageAvailable;
  export let loadRowCount;
  export let startFetchAll = null;
  export let grider;
  export let display;
  export let masterLoadedTime = undefined;
  export let rowCountLoaded = null;

  export let preprocessLoadedRow = null;
  export let setLoadedRows = null;
  export let isRawMode = false;
  // { offset, limit }: load only this window of rows (one page) instead of scrolling through all of them
  export let paging = null;
  export let onLoadStateChanged = null;

  // export let griderFactory;

  let loadedRows = [];
  let isLoading = false;
  let isLoadedAll = false;
  let loadedTime = new Date().getTime();
  let allRowCount = null;
  let allRowCountError = null;
  let isRowCountLoading = false;
  let rowCountToken = 0;
  let errorMessage = null;
  let domGrid;

  let isFetchingAll = false;
  let isFetchingFromDb = false;
  let fetchAllLoadedCount = 0;
  let fetchAllHandle: FetchAllHandle | null = null;
  let readerJslid: string | null = null;

  const loadNextDataRef = createRef(false);
  const loadedTimeRef = createRef(null);

  // row headers number rows from the start of the page
  const rowNumberOffset = writable(0);
  setContext('dataGridRowNumberOffset', rowNumberOffset);
  $: rowNumberOffset.set(paging?.offset ?? 0);

  export function resetLoadedAll() {
    isLoadedAll = false;
    domGrid.loadNextDataIfNeeded();
  }

  export function reloadRowCount(timeout = undefined) {
    handleLoadRowCount(timeout);
  }

  function shouldLoadRowCount() {
    if (isRawMode || allRowCount != null || isRowCountLoading) return false;
    // with paging, a count that failed (eg. timed out on a large table) is retried only on request
    return !(paging && allRowCountError);
  }

  const handleLoadRowCount = async (timeout = undefined) => {
    const token = ++rowCountToken;
    isRowCountLoading = true;
    const result = await loadRowCount($$props, timeout);
    // the data was reloaded meanwhile, this count is for the old filter
    if (token != rowCountToken) return;
    isRowCountLoading = false;
    if (result != null && typeof result === 'object' && result.errorMessage) {
      allRowCount = null;
      allRowCountError = result.errorMessage;
    } else {
      allRowCount = result;
      allRowCountError = null;
    }
  };

  async function loadNextData() {
    if (isLoading) return;
    loadNextDataRef.set(false);
    isLoading = true;

    const loadStart = new Date().getTime();
    // await new Promise(resolve => setTimeout(resolve, 5000));

    loadedTimeRef.set(loadStart);

    const chunkSize = getIntSettingsValue('dataGrid.pageSize', 100, 5, 50000);
    const limit = paging ? Math.min(chunkSize, paging.limit - loadedRows.length) : chunkSize;
    const nextRows = await loadDataPage($$props, (paging?.offset ?? 0) + loadedRows.length, limit);
    if (loadedTimeRef.get() !== loadStart) {
      // new load was dispatched
      return;
    }

    isLoading = false;

    if (nextRows.errorMessage) {
      errorMessage = nextRows.errorMessage;
    } else {
      if (shouldLoadRowCount()) handleLoadRowCount();

      loadedRows = [...loadedRows, ...(preprocessLoadedRow ? nextRows.map(preprocessLoadedRow) : nextRows)];
      isLoadedAll = paging ? nextRows.length < limit || loadedRows.length >= paging.limit : nextRows.length === 0;
      //   const loadedInfo = {
      //     loadedRows: [...loadedRows, ...nextRows],
      //     loadedTime,
      //   };
      //   setLoadProps(oldLoadProps => ({
      //     ...oldLoadProps,
      //     isLoading: false,
      //     isLoadedAll: oldLoadProps.loadNextDataToken == loadNextDataToken && nextRows.length === 0,
      //     loadNextDataToken,
      //     ...loadedInfo,
      //   }));
    }

    if (loadNextDataRef.get()) {
      loadNextData();
    }
    // console.log('LOADED', nextRows, loadedRows);
  }

  async function fetchAllRows() {
    if (isFetchingAll || isLoadedAll) return;

    const jslid = ($$props as any).jslid;
    if (jslid) {
      // Already have a JSONL file (e.g. query tab) — read directly
      fetchAllViaJslid(jslid);
    } else if (startFetchAll) {
      // SQL/table grid: execute full query → stream to JSONL → read from it
      fetchAllViaReader();
    } else {
      fetchAllRowsLegacy();
    }
  }

  function stopReader() {
    if (readerJslid) {
      apiCall('sessions/stop-loading-reader', { jslid: readerJslid });
      readerJslid = null;
    }
  }

  async function fetchAllViaReader() {
    isFetchingAll = true;
    isFetchingFromDb = true;
    fetchAllLoadedCount = loadedRows.length;
    errorMessage = null;

    // Token guards against a reload/destroy that happens while we await startFetchAll.
    // loadedTimeRef is already updated by reload(), so we reuse it as our token.
    const token = loadedTime;

    let jslid;
    try {
      jslid = await startFetchAll($$props);
    } catch (err) {
      if (loadedTime !== token) return; // reload() already reset state
      errorMessage = err?.message ?? 'Failed to start data reader';
      isFetchingAll = false;
      isFetchingFromDb = false;
      return;
    }

    // If reload()/onDestroy ran while we were awaiting, discard the result and
    // immediately stop the reader that was just started on the server.
    if (loadedTime !== token) {
      if (jslid) apiCall('sessions/stop-loading-reader', { jslid });
      return;
    }

    if (!jslid) {
      errorMessage = 'Failed to start data reader';
      isFetchingAll = false;
      isFetchingFromDb = false;
      return;
    }

    readerJslid = jslid;
    fetchAllViaJslid(jslid);
  }

  function fetchAllViaJslid(jslid: string) {
    if (!isFetchingAll) {
      isFetchingAll = true;
      fetchAllLoadedCount = loadedRows.length;
      errorMessage = null;
    }

    const pageSize = getIntSettingsValue('dataGrid.pageSize', 100, 5, 50000);
    const buffer: any[] = [];

    const jslLoadDataPage = async (offset: number, limit: number) => {
      return apiCall('jsldata/get-rows', { jslid, offset, limit });
    };

    fetchAllHandle = fetchAll(
      jslid,
      jslLoadDataPage,
      {
        onPage(rows) {
          if (rows.length > 0) isFetchingFromDb = false;
          const processed = preprocessLoadedRow ? rows.map(preprocessLoadedRow) : rows;
          buffer.push(...processed);
          fetchAllLoadedCount = buffer.length;
        },
        onFinished() {
          loadedRows = buffer;
          isLoadedAll = true;
          isFetchingAll = false;
          isFetchingFromDb = false;
          fetchAllHandle = null;
          readerJslid = null;
          if (allRowCount == null && !isRawMode) handleLoadRowCount();
        },
        onError(msg) {
          errorMessage = msg;
          isFetchingAll = false;
          isFetchingFromDb = false;
          fetchAllHandle = null;
          stopReader();
        },
      },
      pageSize
    );
  }

  async function fetchAllRowsLegacy() {
    isFetchingAll = true;
    fetchAllLoadedCount = loadedRows.length;
    errorMessage = null;

    const pageSize = getIntSettingsValue('dataGrid.pageSize', 100, 5, 50000);
    const fetchStart = new Date().getTime();
    loadedTimeRef.set(fetchStart);

    // Accumulate into a local buffer to avoid O(n²) full-array copies each iteration.
    const buffer = [...loadedRows];

    try {
      while (!isLoadedAll) {
        const nextRows = await loadDataPage($$props, buffer.length, pageSize);

        if (loadedTimeRef.get() !== fetchStart) {
          // a reload was triggered; abort without overwriting loadedRows with stale data
          return;
        }

        if (nextRows.errorMessage) {
          errorMessage = nextRows.errorMessage;
          break;
        }

        if (nextRows.length === 0) {
          isLoadedAll = true;
          break;
        }

        const processed = preprocessLoadedRow ? nextRows.map(preprocessLoadedRow) : nextRows;
        buffer.push(...processed);
        fetchAllLoadedCount = buffer.length;
      }

      // Single assignment triggers Svelte reactivity once for all accumulated rows.
      loadedRows = buffer;
      if (allRowCount == null && !isRawMode) handleLoadRowCount();
    } finally {
      isFetchingAll = false;
    }
  }

  // $: griderProps = { ...$$props, sourceRows: loadProps.loadedRows };
  // $: grider = griderFactory(griderProps);

  function handleLoadNextData() {
    if (!isLoadedAll && !errorMessage && !isFetchingAll && (!grider.disableLoadNextPage || loadedRows.length == 0)) {
      if (dataPageAvailable($$props)) {
        // If not, callbacks to load missing metadata are dispatched
        loadNextData();
      }
    }
  }

  function reload() {
    allRowCount = null;
    allRowCountError = null;
    isRowCountLoading = false;
    rowCountToken++;
    reloadRows();
  }

  // reloads the rows but keeps the row count, which doesn't depend on the page
  function reloadRows() {
    if (fetchAllHandle) {
      fetchAllHandle.cancel();
      fetchAllHandle = null;
    }
    stopReader();
    isFetchingFromDb = false;
    isLoading = false;
    isFetchingAll = false;
    fetchAllLoadedCount = 0;
    loadedRows = [];
    isLoadedAll = false;
    loadedTime = new Date().getTime();
    errorMessage = null;
    loadNextDataRef.set(false);
    loadedTimeRef.set(null);
    // loadNextDataToken = 0;
  }

  $: if (display?.cache?.refreshTime > loadedTime) {
    reload();
  }

  let pagingKey = undefined;
  $: handlePagingChanged(paging);

  function handlePagingChanged(value) {
    const key = value ? `${value.offset}:${value.limit}` : null;
    if (key === pagingKey) return;
    const isFirst = pagingKey === undefined;
    pagingKey = key;
    if (isFirst) return;
    reloadRows();
    domGrid?.resetVerticalScroll();
  }

  $: onLoadStateChanged?.({
    loadedCount: loadedRows.length,
    isLoading,
    isLoadedAll,
    allRowCount: rowCountLoaded || allRowCount,
    allRowCountError,
    isRowCountLoading,
  });

  $: {
    if (masterLoadedTime && masterLoadedTime > loadedTime && display) {
      display.reload();
    }
  }

  onDestroy(() => {
    if (fetchAllHandle) {
      fetchAllHandle.cancel();
    }
    stopReader();
  });

  $: if (setLoadedRows) setLoadedRows(loadedRows);
</script>

<DataGridCore
  {...$$props}
  bind:this={domGrid}
  onLoadNextData={handleLoadNextData}
  onFetchAllRows={paging ? null : fetchAllRows}
  {errorMessage}
  {isLoading}
  {isFetchingAll}
  {isFetchingFromDb}
  {fetchAllLoadedCount}
  allRowCount={rowCountLoaded || allRowCount}
  {allRowCountError}
  onReloadRowCount={() => handleLoadRowCount()}
  {isLoadedAll}
  {loadedTime}
  {grider}
  {display}
/>
