const { getReadyTimeout } = require('./SSHConnection');

afterEach(() => {
  delete process.env.SSH_READY_TIMEOUT_MS;
});

test('the SSH handshake timeout is 10 s unless SSH_READY_TIMEOUT_MS sets another one', () => {
  expect(getReadyTimeout()).toBe(10000);
  process.env.SSH_READY_TIMEOUT_MS = '20000';
  expect(getReadyTimeout()).toBe(20000);
  process.env.SSH_READY_TIMEOUT_MS = 'soon';
  expect(getReadyTimeout()).toBe(10000);
});
