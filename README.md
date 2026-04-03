# stealth-ws

WebSocket client with TLS fingerprint spoofing. Produces TLS `ClientHello` messages that are byte-for-byte identical to real browser handshakes, bypassing fingerprint-based bot detection at the transport layer.

---

## How TLS Fingerprinting Works

When any TLS client connects to a server, the first thing it sends is a `ClientHello` message. This message contains:

- **Cipher suites** — list of encryption algorithms the client supports, in preference order
- **TLS extensions** — e.g. `server_name` (SNI), `supported_groups`, `signature_algorithms`, `key_share`, `session_ticket`, `ALPN`, etc.
- **Extension ordering** — the exact sequence in which extensions appear
- **Compression methods**
- **Supported TLS versions**

Every TLS implementation has a unique combination of these fields. Chrome, Firefox, curl, Node.js's built-in `https`, Go's `net/tls` — they all produce structurally different `ClientHello` messages.

### JA3

JA3 (Salesforce, 2017) is the first widely adopted fingerprinting method. It computes an MD5 hash over five fields extracted from the `ClientHello`:

```
JA3 = MD5(TLSVersion, Ciphers, Extensions, EllipticCurves, EllipticCurvePointFormats)
```

Each field is a comma-separated list of decimal values, joined by `|`. For example:

```
771,4866-4867-4865-...,0-23-65281-10-11-35-16-5-13-...,29-23-24,0
```

This string is MD5-hashed to produce a 32-character fingerprint like `cd08e31494f9531f560d64c695473da9` (Chrome 120).

Because the hash is deterministic and stable per browser version, servers can maintain a database of known-good hashes (Chrome, Firefox, Safari) and reject anything that doesn't match — including raw TLS stacks like Go's `crypto/tls`, Node.js's `tls`, or Python's `ssl`.

### JA3S

The server-side counterpart. Hashes fields from the `ServerHello` response. Used to fingerprint servers, less commonly used for bot detection.

### JA4

JA4 (FoxIO, 2023) is a successor to JA3 that addresses several weaknesses:

- JA3 is broken by **extension randomization** (Chrome 110+ shuffles extension order) — the same browser produces different JA3 hashes across connections
- JA4 sorts extensions and cipher suites before hashing, making it **randomization-resistant**
- JA4 uses a human-readable format (`t13d1516h2_...`) instead of MD5, making it inspectable without a lookup table
- JA4 also captures ALPN first/last values and whether SNI is present

JA4 format:
```
{protocol}{tls_version}{sni}{cipher_count}{ext_count}{alpn_first_last}_{sorted_cipher_hash}_{sorted_ext_hash}
```

Example: `t13d1516h2_8daaf6152771_b0da82dd1658` (Chrome 120)

### What Gets Inspected in Practice

Bot detection services (Cloudflare, Akamai, DataDome, PerimeterX, etc.) don't just check JA3/JA4. A full fingerprint inspection layer includes:

| Layer | What's checked |
|-------|----------------|
| TLS | JA3, JA4, cipher suite order, extension order, `key_share` groups, ALPN |
| HTTP/1.1 | Header order, `User-Agent`, `Accept`, `Accept-Encoding`, `Accept-Language` |
| HTTP/2 | SETTINGS frame values, WINDOW_UPDATE size, header pseudo-order, HPACK huffman encoding |
| WebSocket | Upgrade header casing, extension negotiation |
| Behavioral | Request timing, mouse movement, JS challenge results |

A Node.js WebSocket client using the standard `ws` package over Node's built-in TLS will fail at the first layer — the TLS fingerprint — before any HTTP headers are even examined, because Go's and Node's `crypto/tls` produce well-known non-browser fingerprints that are trivially blocklisted.

---

## What This Package Does

### The Problem

Node.js's `tls` module uses Go's `crypto/tls` under the hood (via libuv/OpenSSL). Its `ClientHello` looks nothing like a browser. The cipher suite list, extension set, and ordering are all wrong. You can set `User-Agent: Mozilla/5.0 ...` all you want — the TLS handshake happens before HTTP and gives you away immediately.

### The Solution

This package spawns a Go subprocess (`stealth-bridge`) that uses [**uTLS**](https://github.com/refraction-networking/utls) — a fork of Go's `crypto/tls` that allows full manual control over `ClientHello` construction. uTLS ships pre-built `ClientHelloSpec` definitions for every major browser version, capturing the exact cipher suites, extensions, values, and ordering that real browsers produce.

The Go bridge:
1. Receives connection config from Node.js over stdin (JSON)
2. Dials the target with a uTLS connection using the specified browser spec
3. Performs the WebSocket upgrade over the spoofed TLS connection
4. Relays frames to/from Node.js over stdout/stdin (newline-delimited JSON)

Node.js never touches the TLS connection directly. The handshake is entirely owned by the Go process.

### ALPN Handling

WebSocket connections use HTTP/1.1 for the upgrade handshake. Chrome sends `ALPN: http/1.1` for WebSocket connections — not `h2`. If the server negotiates HTTP/2 in response to an `h2` ALPN offer, the WebSocket upgrade will fail because HTTP/2 doesn't support the `Connection: Upgrade` mechanism (RFC 7540 §8.1.1).

The bridge explicitly patches the ALPN extension in the cloned spec before the handshake:

```go
alpn.AlpnProtocols = []string{"http/1.1"}
```

This ensures the TLS fingerprint is still browser-accurate while forcing the connection to HTTP/1.1 for the WebSocket upgrade.

### Architecture

```
Node.js process
│
├── new WebSocket(url, options)
│     └── spawn stealth-bridge (Go binary)
│           │
│           ├── stdin  ← JSON config + send/close commands
│           └── stdout → JSON events (open/message/binary/close/error)
│
└── stealth-bridge
      ├── uTLS ClientHello (spoofed browser spec)
      ├── TCP → TLS → HTTP/1.1 Upgrade → WebSocket
      └── gorilla/websocket for frame handling
```

### Available Fingerprint Profiles

Profiles map to pre-built `ClientHelloSpec` definitions in uTLS v1.6.6:

| Profile | Maps to |
|---------|---------|
| `chrome120` | `HelloChrome_120` |
| `chrome115` | `HelloChrome_115_PQ` (post-quantum key share) |
| `chrome114` | `HelloChrome_114_Padding_PSK_Shuf` |
| `chrome112` | `HelloChrome_112_PSK_Shuf` |
| `chrome100` | `HelloChrome_100` |
| `chromeAuto` | `HelloChrome_Auto` (latest Chrome in uTLS) |
| `firefox120` | `HelloFirefox_120` |
| `firefoxAuto` | `HelloFirefox_Auto` |
| `safari16` | `HelloSafari_16_0` |
| `safariAuto` | `HelloSafari_Auto` |
| `edge106` | `HelloEdge_106` |
| `edgeAuto` | `HelloEdge_Auto` |
| `ios14` | `HelloIOS_14` |
| `iosAuto` | `HelloIOS_Auto` |
| `android11` | `HelloAndroid_11_OkHttp` |

> Note: uTLS v1.6.6 does not include specs for every minor browser version. Profiles without an exact match fall back to the nearest available spec. See `fingerprintMap` in `src/bridge/main.go` for the full mapping.

---

## Installation

```bash
npm install stealth-ws
```

The `postinstall` script copies the prebuilt binary for your platform from `prebuilds/{platform}-x64/` to `bin/`.

## Quick Start

```javascript
import WebSocket from 'stealth-ws';

const ws = new WebSocket('wss://example.com/ws', {
  fingerprint: 'chrome120',
  headers: {
    'Origin': 'https://example.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

ws.on('open', () => {
  ws.send('Hello!');
});

ws.on('message', (data, isBinary) => {
  console.log('Received:', data.toString());
});
```

## API

### `new WebSocket(url, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fingerprint` | `string` | `'chrome120'` | TLS fingerprint profile |
| `cookies` | `string\|Array\|CookieJar` | — | Cookie header value |
| `proxy` | `string` | — | `socks5://` or `http://` proxy URL |
| `headers` | `object` | — | HTTP headers sent on upgrade (Origin, User-Agent, etc.) |
| `perMessageDeflate` | `boolean` | `true` | Enable per-message deflate compression |
| `debug` | `boolean` | `false` | Log debug messages from bridge |

### Events

| Event | Args | Description |
|-------|------|-------------|
| `open` | — | Handshake complete |
| `message` | `(data: Buffer, isBinary: boolean)` | Frame received |
| `close` | `(code: number, reason: string)` | Connection closed |
| `error` | `(err: Error)` | Error |
| `auth_required` | — | Server returned 403 |

### Methods

| Method | Description |
|--------|-------------|
| `send(data, [options], [cb])` | Send text or binary frame |
| `close([code], [reason])` | Graceful close |
| `terminate()` | Kill bridge process immediately |
| `ping([data], [mask], [cb])` | Send ping frame |
| `pong([data], [mask], [cb])` | Send pong frame |

### Cookie Management

```javascript
// String
new WebSocket(url, { cookies: 'session=abc; token=xyz' });

// Array (Puppeteer format)
const cookies = await page.cookies();
new WebSocket(url, { cookies });

// CookieJar
import { CookieJar } from 'stealth-ws';
const jar = new CookieJar();
jar.loadFromFile('cookies.json');
new WebSocket(url, { cookies: jar });
```

### Proxy

```javascript
new WebSocket(url, { proxy: 'socks5://127.0.0.1:1080', fingerprint: 'chrome120' });
new WebSocket(url, { proxy: 'http://user:pass@proxy.example.com:8080' });
```

## Platform Support

| Platform | Status |
|----------|--------|
| Windows x64 | ✅ prebuilt |
| Linux x64 | ✅ prebuilt |
| macOS x64 | ✅ prebuilt |
| Any ARM64 | ❌ build from source: `npm run build:go` |

## Building from Source

Requires Go 1.21+.

```bash
# Current platform only
npm run build:go

# All x64 platforms (cross-compile)
npm run prebuild
```

## Migration from `ws`

```javascript
// Before
import WebSocket from 'ws';
const ws = new WebSocket('wss://example.com');

// After
import WebSocket from 'stealth-ws';
const ws = new WebSocket('wss://example.com', {
  fingerprint: 'chrome120',
  headers: { 'Origin': 'https://example.com' }
});
```

The API is compatible. Add `fingerprint` and `headers` as needed.

## License

MIT
