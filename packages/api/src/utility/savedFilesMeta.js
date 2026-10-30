const fs = require('fs-extra');
const _ = require('lodash');
const { filesdir } = require('./directories');
const { getLogger, extractErrorLogData } = require('dbgate-tools');

const logger = getLogger('savedFilesMeta');

// Who saved each file of the files store and when, which connection and database it was saved
// for, and an optional group (the store has no subfolders) for the saved queries panel:
//
//   { "<folder>": { "<file>": { createdBy, createdAt, updatedBy, updatedByName, updatedAt,
//                               conid, database, group } } }
//
// It is one JSON file beside the store rather than part of the files, so a saved file stays
// exactly what its author wrote, and a file saved before this existed simply has no entry. The
// users come from getRequestUser - display labels, not identities to rely on.

const MAX_VALUE_LENGTH = 200;
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];

function metaFileName() {
  return `${filesdir()}-meta.json`;
}

function isSafeKey(key) {
  return typeof key == 'string' && key.length > 0 && !UNSAFE_KEYS.includes(key);
}

function cleanString(value) {
  if (typeof value != 'string') return undefined;
  const clean = value.trim();
  return clean ? clean.substring(0, MAX_VALUE_LENGTH) : undefined;
}

async function readAll() {
  try {
    const parsed = JSON.parse(await fs.readFile(metaFileName(), { encoding: 'utf-8' }));
    return _.isPlainObject(parsed) ? parsed : {};
  } catch (err) {
    if (err.code != 'ENOENT') {
      logger.warn(extractErrorLogData(err), 'DBGM-00000 Could not read saved files metadata');
    }
    return {};
  }
}

let writeQueue = Promise.resolve();

// One change at a time (a single API process owns the workspace), and the file is replaced by a
// rename, so a reader never sees half of it. A failed write is logged and never fails the file
// operation it belongs to.
function change(func) {
  const run = writeQueue.then(async () => {
    const all = await readAll();
    if (func(all) === false) return;
    const fileName = metaFileName();
    const tmpName = `${fileName}.${process.pid}.tmp`;
    await fs.writeFile(tmpName, JSON.stringify(all, null, 2));
    await fs.rename(tmpName, fileName);
  });
  writeQueue = run.catch(err => {
    logger.error(extractErrorLogData(err), 'DBGM-00000 Could not write saved files metadata');
  });
  return writeQueue;
}

function folderEntries(all, folder) {
  if (!_.isPlainObject(all[folder])) all[folder] = {};
  return all[folder];
}

function ownEntry(entries, file) {
  return Object.prototype.hasOwnProperty.call(entries, file) && _.isPlainObject(entries[file]) ? entries[file] : null;
}

async function getFolderMeta(folder) {
  if (!isSafeKey(folder)) return {};
  const all = await readAll();
  return ownEntry(all, folder) ?? {};
}

function recordSave(folder, file, user, { conid = undefined, database = undefined } = {}) {
  if (!isSafeKey(folder) || !isSafeKey(file)) return Promise.resolve();
  return change(all => {
    const entries = folderEntries(all, folder);
    const old = ownEntry(entries, file);
    const now = Date.now();
    const savedConid = cleanString(conid);
    entries[file] = _.omitBy(
      {
        ...old,
        createdBy: old?.createdAt ? old.createdBy : user?.login,
        createdAt: old?.createdAt ?? now,
        updatedBy: user?.login,
        updatedByName: user?.name,
        updatedAt: now,
        // a save without a connection (eg. from a modal that has none) keeps the one saved before
        conid: savedConid ?? old?.conid,
        database: savedConid ? cleanString(database) : old?.database,
      },
      _.isNil
    );
  });
}

function rename(folder, file, newFile) {
  if (!isSafeKey(folder) || !isSafeKey(file) || !isSafeKey(newFile)) return Promise.resolve();
  return change(all => {
    const entries = folderEntries(all, folder);
    const old = ownEntry(entries, file);
    if (!old) return false;
    delete entries[file];
    entries[newFile] = old;
  });
}

function copy(folder, file, newFile, user) {
  if (!isSafeKey(folder) || !isSafeKey(file) || !isSafeKey(newFile)) return Promise.resolve();
  return change(all => {
    const entries = folderEntries(all, folder);
    const old = ownEntry(entries, file);
    const now = Date.now();
    entries[newFile] = _.omitBy(
      {
        createdBy: user?.login,
        createdAt: now,
        updatedBy: user?.login,
        updatedByName: user?.name,
        updatedAt: now,
        conid: old?.conid,
        database: old?.database,
        group: old?.group,
      },
      _.isNil
    );
  });
}

function remove(folder, file) {
  if (!isSafeKey(folder) || !isSafeKey(file)) return Promise.resolve();
  return change(all => {
    const entries = folderEntries(all, folder);
    if (!ownEntry(entries, file)) return false;
    delete entries[file];
  });
}

function setGroup(folder, file, group) {
  if (!isSafeKey(folder) || !isSafeKey(file)) return Promise.resolve();
  return change(all => {
    const entries = folderEntries(all, folder);
    const entry = { ...ownEntry(entries, file) };
    const cleanGroup = cleanString(group);
    if (cleanGroup) entry.group = cleanGroup;
    else delete entry.group;
    entries[file] = entry;
  });
}

module.exports = {
  getFolderMeta,
  recordSave,
  rename,
  copy,
  remove,
  setGroup,
};
