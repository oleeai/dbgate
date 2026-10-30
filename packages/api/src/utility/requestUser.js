// Who made a request, for display only: "saved by", "ran by" and the "Mine" history filter.
//
// At Olee AI, DbGate runs without a login of its own behind Caddy + Authentik forward auth, and
// Caddy passes the signed-in user on every request as X-Authentik-* headers. Anyone who reaches
// the API without going through Caddy can send these headers too, so the value is a label and
// never an access check. Without the headers (local development), DbGate's own login is used
// when there is one, otherwise there is no user.

const MAX_LENGTH = 200;

function readHeader(req, name) {
  const value = req?.headers?.[name];
  if (typeof value != 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean ? clean.substring(0, MAX_LENGTH) : null;
}

function getRequestUser(req) {
  const login = readHeader(req, 'x-authentik-username');
  if (login) {
    return {
      login,
      name: readHeader(req, 'x-authentik-name'),
      email: readHeader(req, 'x-authentik-email'),
    };
  }
  const dbgateLogin = req?.user?.login ?? req?.auth?.user;
  if (typeof dbgateLogin == 'string' && dbgateLogin) {
    return { login: dbgateLogin.substring(0, MAX_LENGTH), name: null, email: null };
  }
  return null;
}

module.exports = {
  getRequestUser,
};
