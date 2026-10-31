import { _t } from '../translations';
import { apiCall } from './api';

export type ConnectionProblemKind = 'unreachable' | 'refused' | 'dns' | 'auth' | 'sshAuth' | 'lost' | 'unknown';

export interface ConnectionProblem {
  kind: ConnectionProblemKind;
  icon: string;
  reason: string;
}

// Raw driver and SSH messages, checked in this order (sign-in messages may also mention a failed connection)
const PATTERNS: [ConnectionProblemKind, RegExp][] = [
  ['sshAuth', /all configured authentication methods failed|cannot parse privatekey|encrypted private (openssh )?key/i],
  [
    'auth',
    /password authentication failed|access denied for user|login failed for user|authentication failed|wrongpass|noauth|invalid password|sasl/i,
  ],
  ['dns', /enotfound|eai_again|getaddrinfo/i],
  ['refused', /econnrefused|connection refused|could not connect \(sequence\)/i],
  [
    'unreachable',
    /waiting for handshake|etimedout|ehostunreach|enetunreach|ehostdown|connection timeout|connect timeout|connection timed out|server selection timed out|failed to connect to .* in \d+ ?ms/i,
  ],
  [
    'lost',
    /dbgm-00309|connection (was )?closed|connection terminated|econnreset|socket hang up|epipe|ssh forward process exited/i,
  ],
];

export function getConnectionProblemKind(message: string): ConnectionProblemKind | null {
  if (!message) return null;
  const text = String(message);
  for (const [kind, regex] of PATTERNS) {
    if (regex.test(text)) return kind;
  }
  return null;
}

export function isConnectionProblem(message: string): boolean {
  return getConnectionProblemKind(message) != null;
}

/** Plain-language reason and icon for a failed connection. Unknown errors get a generic reason. */
export function describeConnectionProblem(message: string): ConnectionProblem {
  const kind = getConnectionProblemKind(message) ?? 'unknown';
  switch (kind) {
    case 'unreachable':
      return {
        kind,
        icon: 'icon server-offline',
        reason: _t('connectionProblem.unreachable', {
          defaultMessage: "The server didn't answer. It may be switched off.",
        }),
      };
    case 'refused':
      return {
        kind,
        icon: 'icon disconnected',
        reason: _t('connectionProblem.refused', {
          defaultMessage: 'The server refused the connection. The database may not be running.',
        }),
      };
    case 'dns':
      return {
        kind,
        icon: 'icon address-offline',
        reason: _t('connectionProblem.dns', {
          defaultMessage: "The server's address couldn't be found. Check the host name and your network.",
        }),
      };
    case 'auth':
      return {
        kind,
        icon: 'icon sign-in-failed',
        reason: _t('connectionProblem.auth', {
          defaultMessage: "The server didn't accept the user name or password.",
        }),
      };
    case 'sshAuth':
      return {
        kind,
        icon: 'icon sign-in-failed',
        reason: _t('connectionProblem.sshAuth', {
          defaultMessage: "The SSH server didn't accept the key or password.",
        }),
      };
    case 'lost':
      return {
        kind,
        icon: 'icon disconnected',
        reason: _t('connectionProblem.lost', { defaultMessage: 'The connection to the server was lost.' }),
      };
    default:
      return {
        kind,
        icon: 'icon server-offline',
        reason: _t('connectionProblem.unknown', {
          defaultMessage: 'Something went wrong. Details shows the message from the server.',
        }),
      };
  }
}

/**
 * "Try again": reopens the connection at once (the API skips its retry pause and the cached SSH tunnel error).
 * The server connection, which lists the databases, is reopened too if it failed.
 */
export async function reopenConnection(conid: string, database: string = null, connection: any = null) {
  if (!conid) return;
  const calls = [];
  if (database) calls.push(apiCall('database-connections/refresh', { conid, database }));
  if (!connection?.singleDatabase) calls.push(apiCall('server-connections/refresh', { conid, keepOpen: !!database }));
  await Promise.all(calls);
}
