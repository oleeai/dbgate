const fs = require('fs-extra');
const path = require('path');
const { datadir } = require('../utility/directories');
const _ = require('lodash');
const { filterName } = require('dbgate-tools');
const socket = require('../utility/socket');
const readFileReverse = require('../utility/readFileReverse');
const { getRequestUser } = require('../utility/requestUser');

// An entry is { sql, conid, database, date } as sent by the query tab (with durationMs, rowCount
// and failed when the run finished), plus the user who ran it (user = login, userName) when the
// request has one. Entries written before users were recorded have no user.

function readCore(reader, skip, limit, matches) {
  return new Promise((resolve, reject) => {
    const res = [];
    let readed = 0;
    reader.on('data', line => {
      if (!line || !line.trim()) return;
      try {
        const json = JSON.parse(line);
        if (matches(json)) {
          if (!skip || readed >= skip) {
            res.push(json);
          }
          readed++;
          if (limit && readed >= (skip || 0) + limit) {
            reader.destroy();
            resolve(res);
          }
        }
      } catch (err) {
        reader.destroy();
        reject(err);
      }
    });
    reader.on('error', err => reject(err));
    reader.on('end', () => resolve(res));
  });
}

// onlyMine keeps the caller's own entries - or, without a known caller (local use), the entries
// written without a user
function createMatcher({ filter, onlyMine, conid, database }, req) {
  const mine = onlyMine ? (getRequestUser(req)?.login ?? null) : undefined;
  return json =>
    filterName(filter, json.sql, json.database, json.user, json.userName) &&
    (mine === undefined || (json.user ?? null) == mine) &&
    (!conid || json.conid == conid) &&
    (!database || json.database == database);
}

async function readJsonl({ skip, limit, matches }) {
  const fileName = path.join(datadir(), 'query-history.jsonl');
  // @ts-ignore
  if (!(await fs.exists(fileName))) return [];
  const reader = readFileReverse(fileName);
  return readCore(reader, skip, limit, matches);
}

module.exports = {
  read_access: { permission: 'widgets/history' },
  read_meta: true,
  async read({ skip, limit, filter, onlyMine, conid, database }, req) {
    const storage = require('./storage');
    const storageResult = await storage.readQueryHistory({ skip, limit, filter, onlyMine, conid, database }, req);
    if (storageResult) return storageResult;
    return readJsonl({ skip, limit, matches: createMatcher({ filter, onlyMine, conid, database }, req) });
  },

  write_access: 'user',

  write_meta: true,
  async write({ data }, req) {
    // who ran the query comes from the request, never from the data the client sent
    const user = getRequestUser(req);
    const entry = {
      ..._.omit(data, ['user', 'userName']),
      ...(user ? _.omitBy({ user: user.login, userName: user.name }, _.isNil) : {}),
    };

    const storage = require('./storage');
    const written = await storage.writeQueryHistory({ data: entry }, req);
    if (written) {
      socket.emit('query-history-changed');
      return 'OK';
    }

    const fileName = path.join(datadir(), 'query-history.jsonl');
    await fs.appendFile(fileName, JSON.stringify(entry) + '\n');
    socket.emit('query-history-changed');
    return 'OK';
  },
};
