import type { JsonRpcRequest, JsonRpcResponse } from "./protocol.js";

export class StdioTransport {
  private buffer = Buffer.alloc(0);
  private framing: "content-length" | "jsonl" = "content-length";
  private readonly handlers: Array<(message: JsonRpcRequest) => void | Promise<void>> = [];

  constructor(
    private readonly input: NodeJS.ReadStream = process.stdin,
    private readonly output: NodeJS.WriteStream = process.stdout,
  ) {}

  start(): void {
    this.input.on("data", (chunk) => this.handleData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  }

  onMessage(handler: (message: JsonRpcRequest) => void | Promise<void>): void {
    this.handlers.push(handler);
  }

  send(message: JsonRpcResponse): void {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    if (this.framing === "jsonl") {
      this.output.write(`${body.toString("utf8")}\n`);
      return;
    }
    this.output.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.output.write(body);
  }

  parseChunk(chunk: Buffer): JsonRpcRequest[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: JsonRpcRequest[] = [];
    while (true) {
      const firstNonWhitespace = this.buffer.findIndex((byte) => ![9, 10, 13, 32].includes(byte));
      if (firstNonWhitespace > 0) this.buffer = this.buffer.subarray(firstNonWhitespace);
      if (this.buffer[0] === 123) {
        const lineEnd = this.buffer.indexOf("\n");
        if (lineEnd < 0) break;
        const line = this.buffer.subarray(0, lineEnd).toString("utf8").replace(/\r$/, "");
        this.buffer = this.buffer.subarray(lineEnd + 1);
        if (!line.trim()) continue;
        this.framing = "jsonl";
        messages.push(JSON.parse(line) as JsonRpcRequest);
        continue;
      }

      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const match = /^Content-Length:\s*(\d+)/im.exec(header);
      if (!match) {
        this.buffer = Buffer.alloc(0);
        throw new Error("MCP message missing Content-Length header");
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) break;
      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);
      this.framing = "content-length";
      messages.push(JSON.parse(body) as JsonRpcRequest);
    }
    return messages;
  }

  private handleData(chunk: Buffer): void {
    let messages: JsonRpcRequest[];
    try {
      messages = this.parseChunk(chunk);
    } catch (error) {
      this.send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: error instanceof Error ? error.message : String(error) },
      });
      return;
    }
    for (const message of messages) {
      for (const handler of this.handlers) {
        void handler(message);
      }
    }
  }
}
