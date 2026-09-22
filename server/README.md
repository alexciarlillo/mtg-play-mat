# Lobby relay

A small WebSocket relay so two to four copies of the app can find each other with a short
code instead of pasting WebRTC offers by hand. It is a dumb pipe: it hands out seats, moves
opaque strings between them, and never looks inside a message.

The wire contract lives in `src/shared/net/relay.ts` and `src/shared/net/lobbyCode.ts`, which
the Electron client imports too, so the two ends cannot drift.

## Shape of a session

1. The host `POST`s `/v1/lobbies` and gets back a six-character `code` and a `hostToken`.
2. The host opens `/v1/ws` with the token and lands in seat 1.
3. Guests open `/v1/ws` with the code alone and take seats 2, 3, 4.
4. Everyone sends `{"op":"send","to":"all"|[seats],"data":"…"}`; the relay delivers
   `{"ev":"data","from":<seat>,"data":"…"}` to the addressed seats.
5. The host leaving closes the lobby, because the pod is a star with the host at its centre.

Seats, not identities: who a seat _is_ stays the app's business, decided by the `hello`
messages inside `data`.

## API

|                                             |                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /healthz`                              | `{"ok":true,"v":1}`. No key needed, so a monitor can poll it.                                                  |
| `POST /v1/lobbies`                          | Headers `x-app-id`, `x-app-key`. Body `{"slots":4}` (optional). → `201 {v, code, hostToken, slots, expiresAt}` |
| `GET /v1/ws?v=1&app=…&key=…&code=…&token=…` | WebSocket upgrade. `token` only for the host.                                                                  |

`POST /v1/lobbies` accepts its credentials in the headers **or** in the query
(`?app=…&key=…`); a header wins when both are present. The WebSocket has only the query,
because the client is the standard `WebSocket` API, which cannot set request headers. Sending
both means one reverse-proxy rule can gate both endpoints — see "Auth at the proxy" below.

Client frames: `{op:'send',to,data}`, `{op:'close',seat}` (host only), `{op:'leave'}`.
Server frames: `{ev:'seated',…}`, `{ev:'peer',seat,state}`, `{ev:'data',from,data}`,
`{ev:'error',code,message}`.

Close codes are in the 4000-4999 range — see `RelayClose` in `src/shared/net/relay.ts`.

## Auth at the proxy

The relay can do no authentication at all and leave the whole gate to nginx. Because every
request carries `?key=` — the WebSocket by necessity, lobby creation by choice — one rule
covers both endpoints:

```nginx
map $http_upgrade $connection_upgrade {
	default upgrade;
	''      close;
}

map $arg_key $relay_ok {
	default        0;
	"YOUR-SECRET"  1;
}

server {
	server_name relay.example.com;

	location /healthz { proxy_pass http://127.0.0.1:8787; }

	location /v1/ {
		if ($relay_ok = 0) { return 401; }

		proxy_pass http://127.0.0.1:8787;
		proxy_http_version 1.1;
		proxy_set_header Upgrade    $http_upgrade;
		proxy_set_header Connection $connection_upgrade;
		proxy_set_header Host       $host;
		proxy_set_header X-Real-IP  $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_read_timeout 1h;
	}
}
```

Run the relay with `RELAY_ALLOW_ANY_APP=1` and no `RELAY_APP_KEYS`, and set the same secret as
the app's relay key in Settings. Nothing unauthenticated reaches Node. Keep
`RELAY_TRUST_PROXY=1` so the rate limits still key on the real address, and
`RELAY_HOST=127.0.0.1` so the relay is not reachable except through nginx.

Two things to know:

- **HTTP Basic auth cannot work here.** Node's global `WebSocket` is the WHATWG API: it
  cannot set request headers, and it drops userinfo from the URL rather than turning it into
  an `Authorization` header (verified against Node 24.21). `auth_basic` would gate lobby
  creation and then fail every WebSocket upgrade.
- **A query string is more visible than a header** — it lands in access logs and in any
  intermediary's. Either add `access_log off;` to that `location`, or keep the relay's own
  `RELAY_APP_KEYS` as the gate and skip the proxy rule.

## Security

An app key is the whole gate today: it keeps drive-by scanners off a public endpoint, and it
is a handle to revoke one app without touching another. It ships inside a desktop app, so it
is not a secret — treat it as namespacing with teeth. `server/auth.ts` is the seam; anything
stronger later (proof of work on lobby creation, signed tokens, per-user keys) replaces
`createAuthenticator` and nothing else.

What actually limits damage:

- **Byte budgets.** A per-connection token bucket and a per-lobby lifetime cap, so the relay
  cannot be turned into a free file transfer service.
- **Caps.** Sockets per address, lobbies per address per hour, lobbies in total, 256 KB per
  frame, six-hour lobby lifetime, two-minute sweep of abandoned lobbies.
- **Pre-upgrade rejection.** A bad key or version never gets a WebSocket, only a bare HTTP
  error. Lobby problems (unknown code, full) do upgrade, so the app can tell the user why.

Traffic is **not** encrypted beyond TLS, and the relay can read every message it carries.
That is fine for a relay you run yourself; it would not be for someone else's.

## Running it

```sh
npm run dev:server     # straight from TypeScript
npm run build:server   # one bundled file: out/server/index.cjs
npm run start:server
```

The bundle has no `node_modules` at all, so deploying is copying `out/server/index.cjs` to a
box with Node 24 on it.

### Configuration

| Variable                                       | Default              |                                                               |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| `RELAY_APP_KEYS`                               | —                    | `appId:key,appId:key`. Required.                              |
| `RELAY_ALLOW_ANY_APP`                          | `0`                  | Dev only, and only when no keys are set.                      |
| `RELAY_HOST` / `RELAY_PORT`                    | `0.0.0.0` / `8787`   |                                                               |
| `RELAY_DEFAULT_SLOTS`                          | `4`                  |                                                               |
| `RELAY_MAX_LOBBIES`                            | `500`                |                                                               |
| `RELAY_LOBBY_TTL_MS`                           | `21600000`           | Six hours.                                                    |
| `RELAY_EMPTY_GRACE_MS`                         | `120000`             | How long an empty lobby is kept.                              |
| `RELAY_MAX_SOCKETS_PER_IP`                     | `12`                 |                                                               |
| `RELAY_LOBBIES_PER_IP_PER_HOUR`                | `30`                 |                                                               |
| `RELAY_BYTES_PER_SECOND` / `RELAY_BURST_BYTES` | `524288` / `4194304` | Per connection.                                               |
| `RELAY_LOBBY_BYTE_BUDGET`                      | `2147483648`         | Per lobby, for its whole life.                                |
| `RELAY_PING_INTERVAL_MS`                       | `30000`              | Two missed pongs and the socket goes.                         |
| `RELAY_TRUST_PROXY`                            | `0`                  | Set behind a reverse proxy so limits key on the real address. |

Nothing is persisted. A restart drops live lobbies, which is the intended trade: lobbies are
minutes long, and the app can start a new one.

### Behind Caddy

```
relay.example.com {
	reverse_proxy 127.0.0.1:8787
}
```

```ini
# /etc/systemd/system/mtg-lobby-relay.service
[Service]
ExecStart=/usr/bin/node /opt/mtg-lobby-relay/index.cjs
Environment=RELAY_APP_KEYS=mtg-play-mat:CHANGE-ME
Environment=RELAY_TRUST_PROXY=1
Environment=RELAY_HOST=127.0.0.1
Restart=always
DynamicUser=yes

[Install]
WantedBy=multi-user.target
```

## Tests

`npm test` runs them with everything else; `npx vitest run --project server` on its own. The
integration tests boot a real server on an ephemeral port and talk to it over a real
WebSocket, so seating, relaying, kicks, budgets and close codes are all exercised for real.
