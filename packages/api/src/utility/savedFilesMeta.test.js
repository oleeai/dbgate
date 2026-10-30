// Who saved a file and for which database, kept beside the files store (savedFilesMeta), and the
// display user taken from the forward-auth headers (requestUser).

const os = require('os');
const path = require('path');
const fsNode = require('fs');

const savedWorkspaceDir = process.env.WORKSPACE_DIR;
const workspaceDir = fsNode.mkdtempSync(path.join(os.tmpdir(), 'dbgate-files-meta-test-'));
process.env.WORKSPACE_DIR = workspaceDir;
afterAll(() => {
  if (savedWorkspaceDir === undefined) delete process.env.WORKSPACE_DIR;
  else process.env.WORKSPACE_DIR = savedWorkspaceDir;
});

const { filesdir } = require('./directories');
const savedFilesMeta = require('./savedFilesMeta');
const { getRequestUser } = require('./requestUser');

const alice = { login: 'alice', name: 'Alice Perera' };
const bob = { login: 'bob', name: null };

function readMetaFile() {
  return JSON.parse(fsNode.readFileSync(`${filesdir()}-meta.json`, 'utf-8'));
}

beforeEach(() => {
  fsNode.rmSync(`${filesdir()}-meta.json`, { force: true });
});

describe('savedFilesMeta', () => {
  test('a save records who saved the file and for which database, a later save keeps the creator', async () => {
    await savedFilesMeta.recordSave('sql', 'Orders', alice, { conid: 'pg', database: 'shop' });
    await savedFilesMeta.recordSave('sql', 'Orders', bob, {});

    const entry = (await savedFilesMeta.getFolderMeta('sql')).Orders;
    expect(entry).toMatchObject({
      createdBy: 'alice',
      updatedBy: 'bob',
      conid: 'pg',
      database: 'shop',
    });
    // the name of the previous editor does not stick to the new one
    expect(entry.updatedByName).toBeUndefined();
    expect(entry.updatedAt).toBeGreaterThanOrEqual(entry.createdAt);
  });

  test('a save without a user still records the time', async () => {
    await savedFilesMeta.recordSave('sql', 'Anonymous', null, {});
    const entry = (await savedFilesMeta.getFolderMeta('sql')).Anonymous;
    expect(entry.updatedAt).toEqual(expect.any(Number));
    expect(entry.updatedBy).toBeUndefined();
  });

  test('rename moves the entry, copy starts a new one for the copier, remove drops it', async () => {
    await savedFilesMeta.recordSave('sql', 'Orders', alice, { conid: 'pg', database: 'shop' });
    await savedFilesMeta.setGroup('sql', 'Orders', 'Reports');
    await savedFilesMeta.rename('sql', 'Orders', 'Orders by status');
    await savedFilesMeta.copy('sql', 'Orders by status', 'Orders copy', bob);

    let meta = await savedFilesMeta.getFolderMeta('sql');
    expect(meta.Orders).toBeUndefined();
    expect(meta['Orders by status']).toMatchObject({ createdBy: 'alice', group: 'Reports' });
    expect(meta['Orders copy']).toMatchObject({
      createdBy: 'bob',
      updatedBy: 'bob',
      conid: 'pg',
      database: 'shop',
      group: 'Reports',
    });

    await savedFilesMeta.setGroup('sql', 'Orders copy', '  ');
    await savedFilesMeta.remove('sql', 'Orders by status');
    meta = await savedFilesMeta.getFolderMeta('sql');
    expect(meta['Orders by status']).toBeUndefined();
    expect(meta['Orders copy'].group).toBeUndefined();
  });

  test('concurrent saves all end up in the file', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => savedFilesMeta.recordSave('sql', `q${i}`, alice, {})));
    expect(Object.keys(readMetaFile().sql)).toHaveLength(20);
  });

  test('prototype keys are refused', async () => {
    await savedFilesMeta.recordSave('__proto__', 'x', alice, {});
    await savedFilesMeta.recordSave('sql', '__proto__', alice, {});
    expect({}.updatedBy).toBeUndefined();
    expect(fsNode.existsSync(`${filesdir()}-meta.json`)).toBe(false);
  });

  test('a broken metadata file reads as empty and is replaced by the next save', async () => {
    fsNode.writeFileSync(`${filesdir()}-meta.json`, '{ broken');
    expect(await savedFilesMeta.getFolderMeta('sql')).toEqual({});
    await savedFilesMeta.recordSave('sql', 'Orders', alice, {});
    expect(readMetaFile().sql.Orders.createdBy).toBe('alice');
  });
});

describe('getRequestUser', () => {
  test('reads the forward-auth headers', () => {
    const req = {
      headers: {
        'x-authentik-username': ' alice ',
        'x-authentik-name': 'Alice Perera',
        'x-authentik-email': 'alice@example.com',
      },
    };
    expect(getRequestUser(req)).toEqual({ login: 'alice', name: 'Alice Perera', email: 'alice@example.com' });
  });

  test('strips control characters and caps the length', () => {
    const user = getRequestUser({ headers: { 'x-authentik-username': `bob\n\u0000${'x'.repeat(500)}` } });
    expect(user.login.startsWith('bobx')).toBe(true);
    expect(user.login.length).toBe(200);
  });

  test("falls back to DbGate's own login, else no user", () => {
    expect(getRequestUser({ headers: {}, user: { login: 'carol' } })).toEqual({
      login: 'carol',
      name: null,
      email: null,
    });
    expect(getRequestUser({ headers: { 'x-authentik-username': '  ' } })).toBeNull();
    expect(getRequestUser(undefined)).toBeNull();
  });
});
