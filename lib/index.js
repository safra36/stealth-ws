/**
 * stealth-ws - WebSocket client with TLS fingerprint spoofing
 * 
 * A drop-in replacement for the 'ws' package that spoofs browser
 * TLS fingerprints to bypass Cloudflare and other bot detection systems.
 */

import { WebSocket } from './websocket.js';
import { FingerprintProfiles } from './fingerprint.js';
import { CookieJar } from './cookie-jar.js';

// Re-export WebSocket class as default export
export default WebSocket;

// Export named exports
export {
  WebSocket,
  FingerprintProfiles,
  CookieJar
};

// Static properties for compatibility with ws
WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.CLOSING = 2;
WebSocket.CLOSED = 3;

// Version
export const VERSION = '1.0.0';
