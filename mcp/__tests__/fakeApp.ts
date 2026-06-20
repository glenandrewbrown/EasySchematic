import { randomBytes } from "node:crypto";
import { Socket } from "node:net";
import type { BridgeStatus } from "../src/bridgeTypes";

/** Encodes a masked client→server WebSocket text frame (RFC 6455). */
export function encodeClientFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value));
  const mask = randomBytes(4);
  const header = payload.length < 126
    ? Buffer.from([0x81, 0x80 | payload.length])
    : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 0xff]);
  const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  return Buffer.concat([header, mask, masked]);
}

/** Decodes unmasked server→client text frames out of a buffer. */
export function readServerFrames(buffer: Buffer): { messages: unknown[]; rest: Buffer } {
  const messages: unknown[] = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const opcode = buffer[offset] & 0x0f;
    let length = buffer[offset + 1] & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (buffer.length - cursor < 2) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    }
    if (buffer.length - cursor < length) break;
    const payload = buffer.subarray(cursor, cursor + length);
    offset = cursor + length;
    if (opcode === 1) messages.push(JSON.parse(payload.toString("utf8")));
  }
  return { messages, rest: buffer.subarray(offset) };
}

export interface FakeApp {
  nextMessage: () => Promise<unknown>;
  send: (value: unknown) => void;
  close: () => void;
}

/** Opens a raw WebSocket as the browser app would, authenticates, and exposes a request/response queue. */
export async function connectFakeApp(port: number, token: string, projectName = "Fake"): Promise<FakeApp> {
  const socket = new Socket();
  let buffer = Buffer.alloc(0);
  let upgraded = false;
  const pendingMessages: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!upgraded) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      upgraded = true;
      buffer = buffer.subarray(end + 4);
      socket.write(encodeClientFrame({ kind: "hello", role: "app", token, appVersion: "test", projectName }));
    }
    const parsed = readServerFrames(buffer);
    buffer = parsed.rest;
    for (const message of parsed.messages) {
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else pendingMessages.push(message);
    }
  });

  await new Promise<void>((resolve) => socket.connect(port, "127.0.0.1", resolve));
  socket.write([
    "GET /app HTTP/1.1",
    "Host: 127.0.0.1",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n"));

  return {
    nextMessage: () => new Promise<unknown>((resolve) => {
      const message = pendingMessages.shift();
      if (message) resolve(message);
      else waiters.push(resolve);
    }),
    send: (value: unknown) => socket.write(encodeClientFrame(value)),
    close: () => socket.destroy(),
  };
}

/** Polls a bridge until at least one app tab is registered. */
export async function waitForTab(bridge: { status: () => BridgeStatus | Promise<BridgeStatus> }): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    const status = await bridge.status();
    if (status.tabs.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Fake app did not register with bridge");
}
