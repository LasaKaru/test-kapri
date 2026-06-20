// Minimal RFC6455 WebSocket server — pure Node, zero dependencies.
// Enough for text messaging (chat) and later realtime sync (co-op).
'use strict';
const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) { return crypto.createHash('sha1').update(key + GUID).digest('base64'); }

function encodeFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2); header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10); header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6);
  }
  header[0] = 0x81; // FIN + text
  return Buffer.concat([header, payload]);
}

class WSConn {
  constructor(socket) {
    this.socket = socket;
    this.open = true;
    this._buf = Buffer.alloc(0);
    this.onmessage = null;
    this.onclose = null;
    this.data = {}; // app state (name, room, ...)
  }
  send(str) { if (this.open) { try { this.socket.write(encodeFrame(str)); } catch (_) { this._closed(); } } }
  sendJSON(obj) { this.send(JSON.stringify(obj)); }
  close() { if (this.open) { try { this.socket.end(Buffer.from([0x88, 0x00])); } catch (_) {} this._closed(); } }
  _closed() { if (this.open) { this.open = false; try { this.socket.destroy(); } catch (_) {} if (this.onclose) this.onclose(); } }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    while (true) {
      if (this._buf.length < 2) return;
      const b0 = this._buf[0], b1 = this._buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) { if (this._buf.length < 4) return; len = this._buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (this._buf.length < 10) return; len = this._buf.readUInt32BE(6); offset = 10; }
      const maskLen = masked ? 4 : 0;
      if (this._buf.length < offset + maskLen + len) return; // wait for full frame
      const mask = masked ? this._buf.slice(offset, offset + 4) : null;
      const payload = this._buf.slice(offset + maskLen, offset + maskLen + len);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this._buf = this._buf.slice(offset + maskLen + len);

      if (opcode === 0x8) { this.close(); return; }           // close
      else if (opcode === 0x9) { try { this.socket.write(Buffer.from([0x8a, 0x00])); } catch (_) {} } // ping -> pong
      else if (opcode === 0x1) { if (this.onmessage) this.onmessage(payload.toString('utf8')); }
      // ignore binary/continuation for now
    }
  }
}

// attach to an http.Server; routeFn(pathname) -> handler(conn, req) | null
function attach(server, route) {
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const pathname = (req.url || '').split('?')[0];
    const handler = route(pathname);
    if (!key || !handler) { socket.destroy(); return; }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n'
    );
    const conn = new WSConn(socket);
    socket.on('data', (c) => conn._onData(c));
    socket.on('close', () => conn._closed());
    socket.on('error', () => conn._closed());
    handler(conn, req);
  });
}

module.exports = { attach, WSConn };
