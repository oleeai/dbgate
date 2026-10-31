const { createConnectRetryBackoff, RETRY_INITIAL_MS, RETRY_MAX_MS } = require('./connectRetryBackoff');

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('a connection without failures is never held back', () => {
  const backoff = createConnectRetryBackoff();
  expect(backoff.isWaiting('conn1')).toBe(false);
});

test('the pause after a failure doubles with each failure, up to the maximum', () => {
  const backoff = createConnectRetryBackoff();

  backoff.recordFailure('conn1');
  expect(backoff.isWaiting('conn1')).toBe(true);
  expect(backoff.isWaiting('conn2')).toBe(false);
  jest.advanceTimersByTime(RETRY_INITIAL_MS);
  expect(backoff.isWaiting('conn1')).toBe(false);

  backoff.recordFailure('conn1');
  jest.advanceTimersByTime(RETRY_INITIAL_MS);
  expect(backoff.isWaiting('conn1')).toBe(true);
  jest.advanceTimersByTime(RETRY_INITIAL_MS);
  expect(backoff.isWaiting('conn1')).toBe(false);

  for (let i = 0; i < 10; i++) backoff.recordFailure('conn1');
  jest.advanceTimersByTime(RETRY_MAX_MS - 1);
  expect(backoff.isWaiting('conn1')).toBe(true);
  jest.advanceTimersByTime(1);
  expect(backoff.isWaiting('conn1')).toBe(false);
});

test('clearing (refresh, try again, connected) ends the pause and resets the count', () => {
  const backoff = createConnectRetryBackoff();
  backoff.recordFailure('conn1');
  backoff.recordFailure('conn1');
  backoff.clear('conn1');
  expect(backoff.isWaiting('conn1')).toBe(false);

  backoff.recordFailure('conn1');
  jest.advanceTimersByTime(RETRY_INITIAL_MS);
  expect(backoff.isWaiting('conn1')).toBe(false);
});
