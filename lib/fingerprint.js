/**
 * Fingerprint profile management
 * 
 * Manages TLS fingerprint profiles for different browsers.
 * These are passed to the Go bridge for TLS handshake spoofing.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Available fingerprint profiles
 * Maps profile name to Go uTLS Hello spec name
 */
export const PROFILES = {
  // Chrome versions
  'chrome120': 'HelloChrome_120',
  'chrome119': 'HelloChrome_119',
  'chrome118': 'HelloChrome_118',
  'chrome117': 'HelloChrome_117',
  'chrome116': 'HelloChrome_116',
  'chrome115': 'HelloChrome_115',
  'chrome114': 'HelloChrome_114',
  'chrome113': 'HelloChrome_113',
  'chrome112': 'HelloChrome_112',
  'chrome110': 'HelloChrome_110',
  'chrome100': 'HelloChrome_100_Auto',
  'chromeAuto': 'HelloChrome_Auto',

  // Firefox versions
  'firefox121': 'HelloFirefox_121',
  'firefox120': 'HelloFirefox_120',
  'firefox115': 'HelloFirefox_115',
  'firefox110': 'HelloFirefox_110',
  'firefox100': 'HelloFirefox_100',
  'firefoxAuto': 'HelloFirefox_Auto',

  // Safari versions
  'safari17': 'HelloSafari_17_0',
  'safari16': 'HelloSafari_16_6',
  'safari15': 'HelloSafari_15_6',
  'safari14': 'HelloSafari_14_1',
  'safariAuto': 'HelloSafari_Auto',

  // Edge versions
  'edge120': 'HelloEdge_120',
  'edge119': 'HelloEdge_119',
  'edge118': 'HelloEdge_118',
  'edge117': 'HelloEdge_117',
  'edge116': 'HelloEdge_116',
  'edgeAuto': 'HelloEdge_Auto',

  // iOS
  'ios17': 'HelloIOS_17_1',
  'ios16': 'HelloIOS_16_1',
  'ios15': 'HelloIOS_15_5',
  'iosAuto': 'HelloIOS_Auto',

  // Android
  'android12': 'HelloAndroid_12',
  'android11': 'HelloAndroid_11',
  'androidAuto': 'HelloAndroid_Auto'
};

/**
 * FingerprintProfiles class for managing browser fingerprints
 */
export class FingerprintProfiles {
  /**
   * List all available fingerprint profiles
   * 
   * @returns {string[]} Array of profile names
   */
  static list() {
    return Object.keys(PROFILES);
  }

  /**
   * Get the Go Hello spec name for a profile
   * 
   * @param {string} profile - Profile name
   * @returns {string} Go Hello spec name
   */
  static getSpecName(profile) {
    const specName = PROFILES[profile];
    if (!specName) {
      console.warn(`Unknown fingerprint profile: ${profile}, using chrome120`);
      return 'HelloChrome_120';
    }
    return specName;
  }

  /**
   * Validate a profile name
   * 
   * @param {string} profile - Profile name
   * @returns {boolean} True if valid
   */
  static isValid(profile) {
    return profile in PROFILES;
  }

  /**
   * Get profile by category
   * 
   * @param {string} category - 'chrome', 'firefox', 'safari', 'edge', 'ios', 'android'
   * @returns {string[]} Array of profile names in category
   */
  static byCategory(category) {
    const prefix = category.toLowerCase();
    return Object.keys(PROFILES).filter(name => name.startsWith(prefix));
  }

  /**
   * Get recommended profile for general use
   * 
   * @returns {string} Recommended profile name
   */
  static recommended() {
    return 'chrome120';
  }

  /**
   * Get profile with specific Chrome version
   * 
   * @param {number} version - Chrome version (e.g., 120)
   * @returns {string} Profile name
   */
  static chromeVersion(version) {
    const profile = `chrome${version}`;
    if (PROFILES[profile]) {
      return profile;
    }
    // Find closest version
    const versions = Object.keys(PROFILES)
      .filter(k => k.startsWith('chrome') && k !== 'chromeAuto')
      .map(k => parseInt(k.replace('chrome', '')))
      .sort((a, b) => b - a);
    
    const closest = versions.find(v => v <= version) || versions[0];
    return `chrome${closest}`;
  }

  /**
   * Get all Chrome profiles
   * 
   * @returns {string[]} Chrome profile names
   */
  static chrome() {
    return this.byCategory('chrome');
  }

  /**
   * Get all Firefox profiles
   * 
   * @returns {string[]} Firefox profile names
   */
  static firefox() {
    return this.byCategory('firefox');
  }

  /**
   * Get all Safari profiles
   * 
   * @returns {string[]} Safari profile names
   */
  static safari() {
    return this.byCategory('safari');
  }

  /**
   * Get all Edge profiles
   * 
   * @returns {string[]} Edge profile names
   */
  static edge() {
    return this.byCategory('edge');
  }
}

/**
 * Get default fingerprint configuration
 * 
 * @returns {Object} Default fingerprint config
 */
export function getDefaultFingerprint() {
  return {
    profile: 'chrome120',
    specName: PROFILES['chrome120']
  };
}

/**
 * Create a custom fingerprint configuration
 * 
 * @param {Object} options - Custom fingerprint options
 * @returns {Object} Fingerprint configuration
 */
export function createCustomFingerprint(options = {}) {
  return {
    profile: options.profile || 'custom',
    specName: options.specName || 'HelloChrome_Auto',
    customSpec: options.customSpec || null
  };
}
