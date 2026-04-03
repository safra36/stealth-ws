/// <reference types="node" />

import { EventEmitter } from 'events';

export interface WebSocketOptions {
  fingerprint?: string;
  cookies?: string | Array<{ name: string; value: string }> | CookieJar;
  proxy?: string;
  headers?: Record<string, string>;
  perMessageDeflate?: boolean;
  debug?: boolean;
}

export declare class WebSocket extends EventEmitter {
  static readonly CONNECTING: 0;
  static readonly OPEN: 1;
  static readonly CLOSING: 2;
  static readonly CLOSED: 3;

  readonly url: string;
  readonly readyState: 0 | 1 | 2 | 3;
  readonly protocol: string;
  readonly extensions: string;
  readonly bufferedAmount: number;
  binaryType: 'nodebuffer' | 'arraybuffer' | 'fragments';

  constructor(url: string, options?: WebSocketOptions);

  send(data: string | Buffer, options?: { binary?: boolean }, callback?: (err?: Error) => void): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  ping(data?: string | Buffer, mask?: boolean, callback?: (err?: Error) => void): void;
  pong(data?: string | Buffer, mask?: boolean, callback?: (err?: Error) => void): void;
  pause(): void;
  resume(): void;

  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (data: Buffer, isBinary: boolean) => void): void;
  addEventListener(type: 'close', listener: (code: number, reason: string) => void): void;
  addEventListener(type: 'error', listener: (err: Error) => void): void;
  addEventListener(type: string, listener: (...args: unknown[]) => void): void;

  removeEventListener(type: string, listener: (...args: unknown[]) => void): void;

  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: Buffer, isBinary: boolean) => void): this;
  on(event: 'close', listener: (code: number, reason: string) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'ping', listener: (data?: Buffer) => void): this;
  on(event: 'auth_required', listener: () => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

export declare class FingerprintProfiles {
  static list(): string[];
  static getSpecName(profile: string): string;
  static isValid(profile: string): boolean;
  static byCategory(category: 'chrome' | 'firefox' | 'safari' | 'edge' | 'ios' | 'android'): string[];
  static recommended(): string;
  static chromeVersion(version: number): string;
  static chrome(): string[];
  static firefox(): string[];
  static safari(): string[];
  static edge(): string[];
}

export declare class CookieJar {
  loadFromFile(path: string): void;
  getCookieString(url: string): string;
}

export declare const VERSION: string;

export default WebSocket;
