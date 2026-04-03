/**
 * CookieJar - Cookie management for WebSocket connections
 * 
 * Provides cookie storage and retrieval similar to browser CookieJar.
 * Can load cookies from Puppeteer or other sources.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse, serialize } from 'url';

export class CookieJar {
  /**
   * Create a new CookieJar
   */
  constructor() {
    this.cookies = new Map();
  }

  /**
   * Set a cookie
   * 
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {Object} options - Cookie options
   * @param {string} [options.domain] - Cookie domain
   * @param {string} [options.path] - Cookie path
   * @param {Date} [options.expires] - Expiration date
   * @param {number} [options.maxAge] - Max age in seconds
   * @param {boolean} [options.secure] - Secure flag
   * @param {boolean} [options.httpOnly] - HttpOnly flag
   * @param {string} [options.sameSite] - SameSite attribute
   */
  set(name, value, options = {}) {
    const cookie = {
      name,
      value,
      domain: options.domain || '',
      path: options.path || '/',
      expires: options.expires || null,
      maxAge: options.maxAge || null,
      secure: options.secure || false,
      httpOnly: options.httpOnly || false,
      sameSite: options.sameSite || null
    };

    const key = this._makeKey(cookie);
    this.cookies.set(key, cookie);
  }

  /**
   * Get a cookie by name for a URL
   * 
   * @param {string} name - Cookie name
   * @param {string} url - URL to get cookie for
   * @returns {string|null} Cookie value or null
   */
  get(name, url) {
    const cookie = this._findCookie(name, url);
    return cookie ? cookie.value : null;
  }

  /**
   * Get all cookies for a URL
   * 
   * @param {string} url - URL to get cookies for
   * @returns {Array} Array of cookie objects
   */
  getCookies(url) {
    const parsedUrl = parse(url);
    const domain = parsedUrl.hostname;
    const path = parsedUrl.pathname;
    const isSecure = parsedUrl.protocol === 'https:';

    const result = [];

    for (const cookie of this.cookies.values()) {
      if (this._matchesCookie(cookie, domain, path, isSecure)) {
        result.push({ ...cookie });
      }
    }

    return result;
  }

  /**
   * Get cookies as a string for a URL
   * 
   * @param {string} url - URL to get cookies for
   * @returns {string} Cookie string
   */
  getCookieString(url) {
    const cookies = this.getCookies(url);
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Check if a cookie exists
   * 
   * @param {string} name - Cookie name
   * @param {string} url - URL to check
   * @returns {boolean} True if exists
   */
  has(name, url) {
    return this._findCookie(name, url) !== null;
  }

  /**
   * Remove a cookie
   * 
   * @param {string} name - Cookie name
   * @param {string} url - URL
   */
  remove(name, url) {
    const cookie = this._findCookie(name, url);
    if (cookie) {
      const key = this._makeKey(cookie);
      this.cookies.delete(key);
    }
  }

  /**
   * Clear all cookies
   */
  clear() {
    this.cookies.clear();
  }

  /**
   * Load cookies from a Puppeteer cookies array
   * 
   * @param {Array} cookies - Puppeteer cookies
   */
  loadFromPuppeteer(cookies) {
    for (const cookie of cookies) {
      this.set(cookie.name, cookie.value, {
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires ? new Date(cookie.expires * 1000) : null,
        maxAge: cookie.maxAge,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite
      });
    }
  }

  /**
   * Load cookies from a JSON file
   * 
   * @param {string} filename - Path to JSON file
   */
  loadFromFile(filename) {
    if (!existsSync(filename)) {
      throw new Error(`Cookie file not found: ${filename}`);
    }

    const data = JSON.parse(readFileSync(filename, 'utf8'));
    
    // Handle array format (Puppeteer style)
    if (Array.isArray(data)) {
      this.loadFromPuppeteer(data);
    } else if (data.cookies && Array.isArray(data.cookies)) {
      this.loadFromPuppeteer(data.cookies);
    } else {
      throw new Error('Invalid cookie file format');
    }
  }

  /**
   * Save cookies to a JSON file
   * 
   * @param {string} filename - Path to save to
   */
  saveToFile(filename) {
    const cookies = Array.from(this.cookies.values());
    writeFileSync(filename, JSON.stringify(cookies, null, 2));
  }

  /**
   * Export cookies as Puppeteer format
   * 
   * @returns {Array} Cookies in Puppeteer format
   */
  toPuppeteerFormat() {
    return Array.from(this.cookies.values()).map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires ? Math.floor(cookie.expires.getTime() / 1000) : -1,
      maxAge: cookie.maxAge,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite
    }));
  }

  /**
   * Get cookie count
   * 
   * @returns {number} Number of cookies
   */
  get size() {
    return this.cookies.size;
  }

  /**
   * Create a CookieJar from a cookie string
   * 
   * @param {string} cookieString - Cookie string
   * @param {string} url - URL context
   * @returns {CookieJar} New CookieJar instance
   */
  static fromCookieString(cookieString, url) {
    const jar = new CookieJar();
    const parsedUrl = parse(url);
    const domain = parsedUrl.hostname;

    const parts = cookieString.split(';');
    for (const part of parts) {
      const [name, ...valueParts] = part.trim().split('=');
      if (name && valueParts.length > 0) {
        jar.set(name.trim(), valueParts.join('=').trim(), {
          domain: domain.startsWith('.') ? domain : `.${domain}`
        });
      }
    }

    return jar;
  }

  // Private methods

  _makeKey(cookie) {
    return `${cookie.domain}:${cookie.path}:${cookie.name}`;
  }

  _findCookie(name, url) {
    const parsedUrl = parse(url);
    const domain = parsedUrl.hostname;
    const path = parsedUrl.pathname;
    const isSecure = parsedUrl.protocol === 'https:';

    for (const cookie of this.cookies.values()) {
      if (cookie.name === name && this._matchesCookie(cookie, domain, path, isSecure)) {
        return cookie;
      }
    }

    return null;
  }

  _matchesCookie(cookie, domain, path, isSecure) {
    // Check domain
    if (cookie.domain) {
      if (cookie.domain.startsWith('.')) {
        if (!domain.endsWith(cookie.domain)) return false;
      } else {
        if (domain !== cookie.domain) return false;
      }
    }

    // Check path
    if (cookie.path) {
      if (!path.startsWith(cookie.path)) return false;
    }

    // Check secure
    if (cookie.secure && !isSecure) return false;

    // Check expiration
    if (cookie.expires && cookie.expires < new Date()) return false;

    return true;
  }
}
