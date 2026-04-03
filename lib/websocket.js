/**
 * WebSocket class with TLS fingerprint spoofing
 * 
 * Compatible with the 'ws' package API but adds:
 * - TLS fingerprint spoofing via Go bridge
 * - Cookie injection for Cloudflare bypass
 * - Proxy support (SOCKS5, HTTP)
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default bridge binary location
const DEFAULT_BRIDGE_DIR = join(__dirname, '..', 'bin');

export class WebSocket extends EventEmitter {
  // Ready state constants (RFC 6455)
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  /**
   * Create a new WebSocket connection
   * 
   * @param {string} url - WebSocket URL
   * @param {Object} options - Connection options
   * @param {string} [options.fingerprint='chrome120'] - TLS fingerprint profile
   * @param {string|Array|Object} [options.cookies] - Cookies to send
   * @param {string} [options.proxy] - Proxy URL (socks5:// or http://)
   * @param {boolean} [options.perMessageDeflate=true] - Enable compression
   * @param {Object} [options.headers] - Additional HTTP headers
   */
  constructor(url, options = {}) {
    super();

    this.url = url;
    this.options = options;
    
    // Connection state
    this.readyState = WebSocket.CONNECTING;
    this.binaryType = 'nodebuffer';
    this.protocol = '';
    this.extensions = '';
    this.bufferedAmount = 0;

    // Bridge process
    this._bridge = null;
    this._buffer = '';
    this._closed = false;

    // Connect asynchronously
    setImmediate(() => this._connect());
  }

  /**
   * Establish connection via the Go bridge
   */
  async _connect() {
    const bridgePath = this._getBridgePath();
    
    // Check if bridge exists, if not try to use prebuild
    let binaryPath = bridgePath;
    if (!existsSync(bridgePath)) {
      binaryPath = this._getPrebuildPath();
    }

    // If no binary found, emit error
    if (!existsSync(binaryPath)) {
      this._handleError(new Error(
        `Stealth bridge not found. Please run: npm run postinstall\n` +
        `Tried paths:\n  - ${bridgePath}\n  - ${binaryPath}`
      ));
      return;
    }

    try {
      this._bridge = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'inherit'],
        windowsHide: true
      });

      // Handle stdin errors (e.g., EPIPE when process exits)
      this._bridge.stdin.on('error', (err) => {
        if (err.code !== 'EPIPE' && !this._closed) {
          this._handleError(err);
        }
      });

      // Collect and parse messages from bridge
      this._bridge.stdout.on('data', (chunk) => {
        this._buffer += chunk.toString();
        this._processBuffer();
      });

      this._bridge.on('exit', (code) => {
        if (!this._closed) {
          this.readyState = WebSocket.CLOSED;
          this.emit('close', 1006, '');
        }
      });

      this._bridge.on('error', (err) => {
        this._handleError(err);
      });

      // Send configuration to bridge
      this._sendConfig();

    } catch (err) {
      this._handleError(err);
    }
  }

  /**
   * Send configuration to the bridge
   */
  _sendConfig() {
    const config = {
      type: 'connect',
      url: this.url,
      fingerprint: this.options.fingerprint || 'chrome120',
      cookies: this._formatCookies(this.options.cookies),
      proxy: this.options.proxy,
      headers: this.options.headers || {},
      perMessageDeflate: this.options.perMessageDeflate !== false
    };

    this._bridge.stdin.write(JSON.stringify(config) + '\n');
  }

  /**
   * Process received data from bridge
   */
  _processBuffer() {
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        this._handleMessage(msg);
      } catch (e) {
        // Ignore malformed messages
      }
    }
  }

  /**
   * Handle messages from the bridge
   */
  _handleMessage(msg) {
    switch (msg.type) {
      case 'open':
        this.readyState = WebSocket.OPEN;
        this.protocol = msg.protocol || '';
        this.extensions = msg.extensions || '';
        this.emit('open');
        break;

      case 'message':
        this.emit('message', Buffer.from(msg.data), false);
        break;

      case 'binary':
        this.emit('message', Buffer.from(msg.data), true);
        break;

      case 'ping':
        // Auto-pong for ping messages
        if (this.readyState === WebSocket.OPEN) {
          this.pong();
        }
        this.emit('ping', msg.data ? Buffer.from(msg.data) : undefined);
        break;

      case 'close':
        this.readyState = WebSocket.CLOSED;
        this.emit('close', msg.code || 1000, msg.reason || '');
        break;

      case 'auth_required':
        this.emit('auth_required');
        break;

      case 'error':
        this._handleError(new Error(msg.message));
        break;

      case 'debug':
        // Debug messages (can be logged if DEBUG enabled)
        if (this.options.debug) {
          console.log('[stealth-ws:debug]', msg.message);
        }
        break;
    }
  }

  /**
   * Handle errors
   */
  _handleError(err) {
    if (this.readyState === WebSocket.CLOSED) return;
    
    this.readyState = WebSocket.CLOSED;
    this.emit('error', err);
  }

  /**
   * Send data through the WebSocket
   * 
   * @param {string|Buffer} data - Data to send
   * @param {Object} options - Send options
   * @param {Function} callback - Callback when sent
   */
  send(data, options = {}, callback) {
    if (this.readyState !== WebSocket.OPEN) {
      const err = new Error('WebSocket is not open');
      if (callback) callback(err);
      else this.emit('error', err);
      return;
    }

    const msg = {
      type: 'send',
      data: Buffer.isBuffer(data) ? data.toString('base64') : String(data),
      binary: options.binary ?? Buffer.isBuffer(data)
    };

    try {
      this._bridge.stdin.write(JSON.stringify(msg) + '\n');
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
      else this.emit('error', err);
    }
  }

  /**
   * Send a ping frame
   */
  ping(data, mask, callback) {
    if (this.readyState !== WebSocket.OPEN) return;

    const msg = {
      type: 'ping',
      data: data ? (Buffer.isBuffer(data) ? data.toString('base64') : String(data)) : undefined
    };

    try {
      this._bridge.stdin.write(JSON.stringify(msg) + '\n');
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  }

  /**
   * Send a pong frame
   */
  pong(data, mask, callback) {
    if (this.readyState !== WebSocket.OPEN) return;

    const msg = {
      type: 'pong',
      data: data ? (Buffer.isBuffer(data) ? data.toString('base64') : String(data)) : undefined
    };

    try {
      this._bridge.stdin.write(JSON.stringify(msg) + '\n');
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  }

  /**
   * Close the WebSocket connection
   * 
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  close(code = 1000, reason = '') {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CLOSING) return;

    this.readyState = WebSocket.CLOSING;
    this._closed = true;

    const msg = {
      type: 'close',
      code,
      reason: String(reason)
    };

    try {
      this._bridge.stdin.write(JSON.stringify(msg) + '\n');
    } catch (err) {
      // Ignore errors during close
    }
  }

  /**
   * Forcibly terminate the connection
   */
  terminate() {
    this._closed = true;
    this.readyState = WebSocket.CLOSED;

    if (this._bridge) {
      try {
        this._bridge.kill();
      } catch (err) {
        // Ignore kill errors
      }
      this._bridge = null;
    }
  }

  /**
   * Pause the connection
   */
  pause() {
    // Not implemented in bridge mode
  }

  /**
   * Resume the connection
   */
  resume() {
    // Not implemented in bridge mode
  }

  /**
   * Format cookies for bridge
   */
  _formatCookies(cookies) {
    if (!cookies) return '';
    if (typeof cookies === 'string') return cookies;
    if (Array.isArray(cookies)) {
      return cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }
    if (typeof cookies === 'object' && cookies.getCookieString) {
      return cookies.getCookieString(this.url);
    }
    return String(cookies);
  }

  /**
   * Get bridge binary path for current platform
   */
  _getBridgePath() {
    return join(DEFAULT_BRIDGE_DIR, this._getBridgeName());
  }

  /**
   * Get prebuild path for current platform
   */
  _getPrebuildPath() {
    const platform = process.platform;
    const arch = process.arch;
    
    const platformMap = {
      'win32': 'win32',
      'linux': 'linux',
      'darwin': 'darwin'
    };
    
    const archMap = {
      'x64': 'x64',
      'arm64': 'arm64'
    };

    const p = platformMap[platform] || platform;
    const a = archMap[arch] || arch;

    const ext = platform === 'win32' ? '.exe' : '';
    return join(__dirname, '..', 'prebuilds', `${p}-${a}`, `stealth-bridge${ext}`);
  }

  /**
   * Get bridge binary name for current platform
   */
  _getBridgeName() {
    if (process.platform === 'win32') {
      return 'stealth-bridge.exe';
    }
    return 'stealth-bridge';
  }
}

// Add EventTarget compatibility
WebSocket.prototype.addEventListener = function(type, listener, options) {
  if (options && options.once) {
    this.on(type, function wrapper(...args) {
      this.removeListener(type, wrapper);
      listener.apply(this, args);
    });
  } else {
    this.on(type, listener);
  }
};

WebSocket.prototype.removeEventListener = function(type, listener) {
  this.removeListener(type, listener);
};

WebSocket.prototype.dispatchEvent = function(event) {
  this.emit(event.type, event);
};
