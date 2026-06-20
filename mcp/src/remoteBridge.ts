import { connect, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import {
  CONTROL_STATUS_METHOD,
  type BridgeLike,
  type BridgeStatus,
  type ControlResponse,
} from "./bridgeTypes.js";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface RemoteBridgeOptions {
  host: string;
  port: number;
  controlPort: number;
  token: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

/** Error thrown when the control channel itself is unreachable (vs. an app-level error). */
export class ControlChannelError extends Error {}

/**
 * A bridge that forwards every request to another process's {@link LiveBridge}
 * over the local TCP control channel. Used by MCP server instances that lost the
 * race to bind the WebSocket port, so all clients share the one connected app tab.
 */
export class RemoteBridge implements BridgeLike {
  private socket: Socket | null = null;
  private connecting: Promise<Socket> | null = null;
  private buffer = "";
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly options: RemoteBridgeOptions) {}

  private async ensureConnected(): Promise<Socket> {
    if (this.socket && !this.socket.destroyed) return this.socket;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<Socket>((resolve, reject) => {
      const socket = connect({ host: this.options.host, port: this.options.controlPort });
      const onError = (error: Error) => {
        socket.removeListener("connect", onConnect);
        reject(new ControlChannelError(error.message));
      };
      const onConnect = () => {
        socket.removeListener("error", onError);
        socket.setEncoding("utf8");
        socket.on("data", (chunk: string) => this.onData(chunk));
        socket.on("close", () => this.onClose());
        socket.on("error", () => this.onClose());
        socket.write(`${JSON.stringify({ kind: "control-hello", token: this.options.token })}\n`);
        this.socket = socket;
        resolve(socket);
      };
      socket.once("connect", onConnect);
      socket.once("error", onError);
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      newlineIndex = this.buffer.indexOf("\n");
      if (!line) continue;
      let message: ControlResponse;
      try {
        message = JSON.parse(line) as ControlResponse;
      } catch {
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || "EasySchematic control request failed"));
    }
  }

  private onClose(): void {
    this.socket = null;
    this.buffer = "";
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new ControlChannelError("EasySchematic control channel closed."));
    }
    this.pending.clear();
  }

  async request(method: string, params?: unknown, targetTabId?: string): Promise<unknown> {
    const socket = await this.ensureConnected();
    const id = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for control response to ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      socket.write(`${JSON.stringify({ id, method, params, targetTabId })}\n`);
    });
  }

  async status(): Promise<BridgeStatus> {
    try {
      const remote = await this.request(CONTROL_STATUS_METHOD) as BridgeStatus;
      return { ...remote, bridge: { ...remote.bridge, mode: "proxy" }, proxy: { connected: true } };
    } catch (error) {
      return {
        bridge: {
          listening: false,
          host: this.options.host,
          port: this.options.port,
          controlPort: this.options.controlPort,
          mode: "proxy",
        },
        tabs: [],
        activeTabRequired: false,
        proxy: { connected: false, error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
  }
}
