/**
 * Test suite for stealth-ws
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { WebSocket } from '../lib/websocket.js';
import { WebSocketServer } from '../lib/server.js';
import { FingerprintProfiles } from '../lib/fingerprint.js';
import { CookieJar } from '../lib/cookie-jar.js';

describe('FingerprintProfiles', () => {
  test('list() returns array of profiles', () => {
    const profiles = FingerprintProfiles.list();
    assert.ok(Array.isArray(profiles));
    assert.ok(profiles.length > 0);
  });

  test('getSpecName() returns valid spec name', () => {
    const spec = FingerprintProfiles.getSpecName('chrome120');
    assert.strictEqual(spec, 'HelloChrome_120');
  });

  test('getSpecName() returns default for unknown profile', () => {
    const spec = FingerprintProfiles.getSpecName('unknown');
    assert.strictEqual(spec, 'HelloChrome_120');
  });

  test('isValid() validates known profiles', () => {
    assert.strictEqual(FingerprintProfiles.isValid('chrome120'), true);
    assert.strictEqual(FingerprintProfiles.isValid('firefox121'), true);
    assert.strictEqual(FingerprintProfiles.isValid('unknown'), false);
  });

  test('byCategory() returns profiles by category', () => {
    const chrome = FingerprintProfiles.byCategory('chrome');
    assert.ok(chrome.length > 0);
    assert.ok(chrome.every(p => p.startsWith('chrome')));
  });

  test('recommended() returns default profile', () => {
    const recommended = FingerprintProfiles.recommended();
    assert.strictEqual(recommended, 'chrome120');
  });
});

describe('CookieJar', () => {
  test('set() and get() work correctly', () => {
    const jar = new CookieJar();
    jar.set('test', 'value', { domain: '.example.com' });
    assert.strictEqual(jar.get('test', 'https://example.com'), 'value');
  });

  test('get() returns null for unknown cookie', () => {
    const jar = new CookieJar();
    assert.strictEqual(jar.get('unknown', 'https://example.com'), null);
  });

  test('has() checks for cookie existence', () => {
    const jar = new CookieJar();
    jar.set('test', 'value', { domain: '.example.com' });
    assert.strictEqual(jar.has('test', 'https://example.com'), true);
    assert.strictEqual(jar.has('unknown', 'https://example.com'), false);
  });

  test('remove() deletes cookie', () => {
    const jar = new CookieJar();
    jar.set('test', 'value', { domain: '.example.com' });
    jar.remove('test', 'https://example.com');
    assert.strictEqual(jar.get('test', 'https://example.com'), null);
  });

  test('clear() removes all cookies', () => {
    const jar = new CookieJar();
    jar.set('test1', 'value1', { domain: '.example.com' });
    jar.set('test2', 'value2', { domain: '.example.com' });
    jar.clear();
    assert.strictEqual(jar.size, 0);
  });

  test('loadFromPuppeteer() loads cookies', () => {
    const jar = new CookieJar();
    const puppeteerCookies = [
      { name: 'cf_clearance', value: 'abc123', domain: '.example.com', path: '/', expires: -1, maxAge: 0, secure: true, httpOnly: false, sameSite: 'none' }
    ];
    jar.loadFromPuppeteer(puppeteerCookies);
    assert.strictEqual(jar.get('cf_clearance', 'https://example.com'), 'abc123');
  });

  test('getCookieString() formats cookies correctly', () => {
    const jar = new CookieJar();
    jar.set('cookie1', 'value1', { domain: '.example.com' });
    jar.set('cookie2', 'value2', { domain: '.example.com' });
    const str = jar.getCookieString('https://example.com');
    assert.ok(str.includes('cookie1=value1'));
    assert.ok(str.includes('cookie2=value2'));
  });

  test('fromCookieString() creates jar from string', () => {
    const jar = CookieJar.fromCookieString('a=1; b=2', 'https://example.com');
    assert.strictEqual(jar.get('a', 'https://example.com'), '1');
    assert.strictEqual(jar.get('b', 'https://example.com'), '2');
  });
});

describe('WebSocket Ready States', () => {
  test('WebSocket has correct constants', () => {
    assert.strictEqual(WebSocket.CONNECTING, 0);
    assert.strictEqual(WebSocket.OPEN, 1);
    assert.strictEqual(WebSocket.CLOSING, 2);
    assert.strictEqual(WebSocket.CLOSED, 3);
  });
});

describe('WebSocketServer', () => {
  test('creates server with options', () => {
    const wss = new WebSocketServer({ port: 0 });
    assert.ok(wss.clients instanceof Set);
    assert.ok(typeof wss.close === 'function');
    wss.close();
  });

  test('creates server in noServer mode', () => {
    const wss = new WebSocketServer({ noServer: true });
    assert.ok(wss.clients instanceof Set);
  });
});
