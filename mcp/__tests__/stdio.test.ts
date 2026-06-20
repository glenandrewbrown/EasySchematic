import { describe, expect, it } from "vitest";
import { StdioTransport } from "../src/stdio";

function frame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

describe("StdioTransport", () => {
  it("parses MCP Content-Length framed JSON-RPC messages", () => {
    const transport = new StdioTransport();
    const messages = transport.parseChunk(frame({ jsonrpc: "2.0", id: 1, method: "ping" }));

    expect(messages).toEqual([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
  });

  it("parses newline-delimited JSON-RPC messages used by some MCP clients", () => {
    const transport = new StdioTransport();
    const messages = transport.parseChunk(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })}\n`));

    expect(messages).toEqual([{ jsonrpc: "2.0", id: 1, method: "initialize" }]);
  });

  it("buffers partial frames until the body is complete", () => {
    const transport = new StdioTransport();
    const bytes = frame({ jsonrpc: "2.0", id: "abc", method: "tools/list" });
    const first = transport.parseChunk(bytes.subarray(0, 12));
    const second = transport.parseChunk(bytes.subarray(12));

    expect(first).toEqual([]);
    expect(second).toEqual([{ jsonrpc: "2.0", id: "abc", method: "tools/list" }]);
  });
});
