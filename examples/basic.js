/**
 * Example: Basic WebSocket connection with fingerprint spoofing
 */

import WebSocket from '../lib/index.js';

// Connect to a WebSocket server with Chrome fingerprint
const ws = new WebSocket('wss://example.com/ws', {
  fingerprint: 'chrome120',
  headers: {
    'Origin': 'https://example.com'
  }
});

ws.on('open', () => {
  console.log('Connected with spoofed Chrome fingerprint!');

  // Send a message
  ws.send('Hello, server!');
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    console.log('Binary message:', data.toString('hex'));
  } else {
    console.log('Text message:', data.toString());
  }
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} - ${reason}`);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error.message);
});
