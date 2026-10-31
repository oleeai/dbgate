// After a connection fails to open, the pings from the UI reopen it only after a growing pause, so a server
// that can't be reached (eg. an SSH host that is switched off) isn't retried every 20-30 seconds by every
// open tab. Explicit actions (refresh, "Try again", opening the connection) clear the pause and reconnect.

const RETRY_INITIAL_MS = 30 * 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;

function createConnectRetryBackoff() {
  const failures = {};

  return {
    recordFailure(key) {
      const count = (failures[key]?.count || 0) + 1;
      failures[key] = {
        count,
        retryAt: Date.now() + Math.min(RETRY_INITIAL_MS * 2 ** (count - 1), RETRY_MAX_MS),
      };
    },
    clear(key) {
      delete failures[key];
    },
    isWaiting(key) {
      const failure = failures[key];
      return !!failure && Date.now() < failure.retryAt;
    },
  };
}

module.exports = {
  createConnectRetryBackoff,
  RETRY_INITIAL_MS,
  RETRY_MAX_MS,
};
