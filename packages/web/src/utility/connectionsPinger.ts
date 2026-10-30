import _ from 'lodash';
import {
  currentDatabase,
  openedConnectionsWithTemporary,
  getCurrentConfig,
  getOpenedConnections,
  getOpenedTabs,
} from '../stores';
import { apiCall, getVolatileConnections, strmid } from './api';
import { batchDispatchCacheTriggers } from './cache';
import hasPermission from '../utility/hasPermission';
import { getConfig } from './metadataLoaders';
import { onMount } from 'svelte';

// const doServerPing = async value => {
//   const connectionList = getConnectionList();
//   const connections = value.filter(id => !connectionList.find(x => x._id == id)?.singleDatabase);
//   apiCall('server-connections/ping', { connections });
// };

// Connections listed by the last finished ping. The server sends this tab the events of those
// connections only (database status, structure, ...), see serverConnections.ping.
let pingedConids = [];

const doServerPing = async value => {
  const config = getCurrentConfig();

  const conidArray = [...value];
  if (config.storageDatabase && hasPermission('internal-storage')) {
    conidArray.push('__storage');
  }
  conidArray.push(...getVolatileConnections());
  if (config.singleConnection) {
    conidArray.push(config.singleConnection._id);
  }

  const conids = _.compact(conidArray);
  await apiCall('server-connections/ping', {
    conidArray: conids,
    strmid,
  });

  // Events of a connection sent before a ping listed it never reached this tab - e.g. a database
  // opened from a restored tab finished loading its structure meanwhile, and its object list kept
  // showing "Loading database structure". Whatever was loaded for such a connection is loaded again.
  const added = conids.filter(conid => !pingedConids.includes(conid));
  pingedConids = conids;
  if (added.length > 0) {
    batchDispatchCacheTriggers(trigger => added.includes(trigger.conid));
  }
};

const doDatabasePing = value => {
  const database = _.get(value, 'name');
  const conid = _.get(value, 'connection._id');
  if (conid && database) {
    apiCall('database-connections/ping', { conid, database });
  }
};

function pingAllOpenedDatabases() {
  const tabs = getOpenedTabs() || [];
  const allDbs = tabs
    .filter(tab => !tab.closedTime && tab.props?.conid && tab.props?.database)
    .map(tab => ({ conid: tab.props.conid as string, database: tab.props.database as string }));
  const seen = new Set<string>();
  const databases: { conid: string; database: string }[] = [];
  for (const db of allDbs) {
    const key = `${db.conid}/${db.database}`;
    if (!seen.has(key)) {
      seen.add(key);
      databases.push(db);
    }
  }
  if (databases.length > 0) {
    apiCall('database-connections/ping-databases', { databases });
  }
}

let openedConnectionsHandle = null;

let currentDatabaseHandle = null;
let allDatabasesHandle = null;

export function subscribeConnectionPingers() {
  openedConnectionsWithTemporary.subscribe(value => {
    doServerPing(value);
    if (openedConnectionsHandle) window.clearInterval(openedConnectionsHandle);
    openedConnectionsHandle = window.setInterval(() => doServerPing(value), 20 * 1000);
  });

  currentDatabase.subscribe(value => {
    doDatabasePing(value);
    if (currentDatabaseHandle) window.clearInterval(currentDatabaseHandle);
    currentDatabaseHandle = window.setInterval(() => doDatabasePing(value), 20 * 1000);
  });

  // Ping all databases that have open (non-closed) tabs, not just the current one
  pingAllOpenedDatabases();
  if (allDatabasesHandle) window.clearInterval(allDatabasesHandle);
  allDatabasesHandle = window.setInterval(() => pingAllOpenedDatabases(), 20 * 1000);
}

export function callServerPing() {
  const connections = getOpenedConnections();
  doServerPing(connections);
}

export async function mountStorageConnectionPing() {
  const config = getCurrentConfig();

  onMount(() => {
    const conid = '__storage';
    const database = config.storageDatabase;
    apiCall('database-connections/ping', { conid, database });
    const handle = setInterval(() => {
      if (conid && database) {
        apiCall('database-connections/ping', { conid, database });
      }
    }, 20 * 1000);
    return () => clearInterval(handle);
  });
}
