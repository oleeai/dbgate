// Query history records who ran each query (from the forward-auth headers, never from the data the
// client sends) and filters by "mine", connection and database; entries written before users were
// recorded keep working.

const os = require('os');
const path = require('path');
const fsNode = require('fs');

const savedWorkspaceDir = process.env.WORKSPACE_DIR;
const workspaceDir = fsNode.mkdtempSync(path.join(os.tmpdir(), 'dbgate-query-history-test-'));
process.env.WORKSPACE_DIR = workspaceDir;
afterAll(() => {
  if (savedWorkspaceDir === undefined) delete process.env.WORKSPACE_DIR;
  else process.env.WORKSPACE_DIR = savedWorkspaceDir;
});

jest.mock('../utility/socket', () => ({ emit: jest.fn() }));
jest.mock('./storage', () => ({
  readQueryHistory: jest.fn(async () => null),
  writeQueryHistory: jest.fn(async () => null),
}));

const queryHistory = require('./queryHistory');

const historyFile = path.join(workspaceDir, 'query-history.jsonl');
const asUser = (login, name) => ({
  headers: { 'x-authentik-username': login, ...(name ? { 'x-authentik-name': name } : {}) },
});
const anonymous = { headers: {} };

beforeAll(async () => {
  // an entry from before users were recorded
  fsNode.writeFileSync(historyFile, JSON.stringify({ sql: 'SELECT 0', conid: 'pg', database: 'shop', date: 1 }) + '\n');
  await queryHistory.write(
    { data: { sql: 'SELECT 1', conid: 'pg', database: 'shop', date: 2 } },
    asUser('alice', 'Alice')
  );
  await queryHistory.write(
    { data: { sql: 'SELECT 2', conid: 'pg', database: 'postgres', date: 3, user: 'mallory', durationMs: 5 } },
    asUser('bob')
  );
  await queryHistory.write(
    { data: { sql: 'SELECT 3', conid: 'pg', database: 'shop', date: 4, user: 'mallory' } },
    anonymous
  );
});

test('the user comes from the request headers', () => {
  const lines = fsNode
    .readFileSync(historyFile, 'utf-8')
    .trim()
    .split('\n')
    .map(x => JSON.parse(x));
  expect(lines[1]).toMatchObject({ sql: 'SELECT 1', user: 'alice', userName: 'Alice' });
  expect(lines[2]).toMatchObject({ sql: 'SELECT 2', user: 'bob', durationMs: 5 });
  expect(lines[2].userName).toBeUndefined();
  expect(lines[3].user).toBeUndefined();
});

test('newest first, everyone', async () => {
  const res = await queryHistory.read({ limit: 10 }, asUser('alice'));
  expect(res.map(x => x.sql)).toEqual(['SELECT 3', 'SELECT 2', 'SELECT 1', 'SELECT 0']);
});

test('limit returns exactly that many entries, skip pages on', async () => {
  expect((await queryHistory.read({ limit: 2 }, anonymous)).map(x => x.sql)).toEqual(['SELECT 3', 'SELECT 2']);
  expect((await queryHistory.read({ limit: 2, skip: 2 }, anonymous)).map(x => x.sql)).toEqual(['SELECT 1', 'SELECT 0']);
});

test('only mine', async () => {
  expect((await queryHistory.read({ limit: 10, onlyMine: true }, asUser('bob'))).map(x => x.sql)).toEqual(['SELECT 2']);
  // without a known user, "mine" are the entries written without one
  expect((await queryHistory.read({ limit: 10, onlyMine: true }, anonymous)).map(x => x.sql)).toEqual([
    'SELECT 3',
    'SELECT 0',
  ]);
});

test('connection, database and text filters', async () => {
  expect((await queryHistory.read({ limit: 10, conid: 'pg', database: 'shop' }, anonymous)).map(x => x.sql)).toEqual([
    'SELECT 3',
    'SELECT 1',
    'SELECT 0',
  ]);
  expect((await queryHistory.read({ limit: 10, filter: 'alice' }, anonymous)).map(x => x.sql)).toEqual(['SELECT 1']);
});
