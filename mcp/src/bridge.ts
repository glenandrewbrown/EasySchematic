import { createServer, type Server } from "node:http";
import { createServer as createTcpServer, type Server as NetServer, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { AppTab, LiveControlHello, LiveControlMessage, LiveControlRequest, LiveControlResponse } from "./protocol.js";
import { acceptWebSocket, WebSocketPeer } from "./ws.js";
import {
  CONTROL_STATUS_METHOD,
  type BridgeLike,
  type BridgeStatus,
  type ControlHello,
  type ControlRequest,
  type ControlResponse,
} from "./bridgeTypes.js";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface ConnectedTab {
  info: AppTab;
  peer: WebSocketPeer;
  pending: Map<string, PendingRequest>;
}

export interface BridgeOptions {
  host: string;
  port: number;
  token: string;
  /** TCP port sibling MCP processes use to proxy through this host. Defaults to port + 1. */
  controlPort?: number;
  publicUrl?: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Hosts the WebSocket bridge the browser app connects to, plus a small
 * line-delimited-JSON control server other MCP server processes use to forward
 * their tool calls here. Exactly one process per machine wins the listen socket;
 * the rest become {@link RemoteBridge} proxies pointing at this one.
 */
export class LiveBridge implements BridgeLike {
  private server: Server | null = null;
  private controlServer: NetServer | null = null;
  private readonly tabs = new Map<string, ConnectedTab>();

  constructor(private readonly options: BridgeOptions) {}

  private get controlPort(): number {
    return this.options.controlPort ?? this.options.port + 1;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((_req, res) => {
      res.writeHead(404);
      res.end("EasySchematic live bridge only accepts WebSocket app sessions.\n");
    });
    server.on("upgrade", (req, socket) => {
      if (req.url !== "/app") {
        socket.destroy();
        return;
      }
      const peer = acceptWebSocket(req, socket as Socket);
      if (!peer) return;
      this.attachUnauthenticatedPeer(peer);
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        // Honest failure: never retain a server we did not bind.
        this.server = null;
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        this.server = server;
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.options.port, this.options.host);
    });
    await this.startControlServer();
  }

  /**
   * Best-effort: lets sibling MCP processes forward requests here. A failure to
   * bind (e.g. the control port is taken) is logged but does not fail start —
   * the local client still works, only cross-process sharing is unavailable.
   */
  private async startControlServer(): Promise<void> {
    // An ephemeral (0) WS port can't expose a predictable control port for sibling
    // processes to discover, so cross-process proxying is unavailable — skip quietly.
    if (this.options.port === 0 && this.options.controlPort === undefined) return;
    const control = createTcpServer((socket) => this.handleControlConnection(socket));
    control.on("error", (error) => {
      process.stderr.write(`[easyschematic-mcp] control server error: ${error instanceof Error ? error.message : String(error)}\n`);
    });
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      control.once("error", () => {
        this.controlServer = null;
        done();
      });
      control.once("listening", () => {
        this.controlServer = control;
        done();
      });
      control.listen(this.controlPort, this.options.host);
    });
  }

  private handleControlConnection(socket: Socket): void {
    socket.setEncoding("utf8");
    let authenticated = false;
    let buffer = "";

    const reply = (response: ControlResponse) => {
      if (!socket.destroyed) socket.write(`${JSON.stringify(response)}\n`);
    };

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
        if (!line) continue;
        let message: ControlHello | ControlRequest;
        try {
          message = JSON.parse(line);
        } catch {
          socket.destroy();
          return;
        }
        if (!authenticated) {
          const hello = message as ControlHello;
          if (hello.kind !== "control-hello" || hello.token !== this.options.token) {
            socket.destroy();
            return;
          }
          authenticated = true;
          continue;
        }
        void this.handleControlRequest(message as ControlRequest, reply);
      }
    });
    socket.on("error", () => socket.destroy());
  }

  private async handleControlRequest(request: ControlRequest, reply: (response: ControlResponse) => void): Promise<void> {
    try {
      const result = request.method === CONTROL_STATUS_METHOD
        ? this.status()
        : await this.request(request.method, request.params, request.targetTabId);
      reply({ id: request.id, ok: true, result });
    } catch (error) {
      reply({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async stop(): Promise<void> {
    for (const tab of this.tabs.values()) tab.peer.close();
    this.tabs.clear();
    if (this.controlServer) {
      await new Promise<void>((resolve) => this.controlServer!.close(() => resolve()));
      this.controlServer = null;
    }
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  status(): BridgeStatus {
    const address = this.server?.address() as AddressInfo | null;
    return {
      bridge: {
        listening: Boolean(this.server),
        host: this.options.host,
        port: address?.port ?? this.options.port,
        controlPort: this.controlServer ? this.controlPort : undefined,
        publicUrl: this.options.publicUrl,
        mode: "host",
      },
      tabs: [...this.tabs.values()].map((tab) => tab.info),
      activeTabRequired: this.tabs.size > 1,
    };
  }

  selectTab(targetTabId?: string): ConnectedTab {
    if (targetTabId) {
      const tab = this.tabs.get(targetTabId);
      if (!tab) throw new Error(`No connected EasySchematic tab with id ${targetTabId}`);
      return tab;
    }
    if (this.tabs.size === 0) throw new Error("No EasySchematic app tab is connected to the live bridge.");
    if (this.tabs.size > 1) throw new Error("Multiple EasySchematic tabs are connected; pass targetTabId.");
    return [...this.tabs.values()][0];
  }

  async request(method: string, params?: unknown, targetTabId?: string): Promise<unknown> {
    const tab = this.selectTab(targetTabId);
    const id = randomUUID();
    const request: LiveControlRequest = { id, kind: "request", method, params };
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        tab.pending.delete(id);
        reject(new Error(`Timed out waiting for app response to ${method}`));
      }, REQUEST_TIMEOUT_MS);
      tab.pending.set(id, { resolve, reject, timer });
      tab.peer.sendJson(request);
    });
    tab.info.lastSeenAt = new Date().toISOString();
    return result;
  }

  private attachUnauthenticatedPeer(peer: WebSocketPeer): void {
    let tabId: string | null = null;
    let authenticated = false;

    peer.onText((text) => {
      let message: LiveControlMessage;
      try {
        message = JSON.parse(text) as LiveControlMessage;
      } catch {
        peer.close(1003, "invalid json");
        return;
      }

      if (!authenticated) {
        const hello = message as LiveControlHello;
        if (hello.kind !== "hello" || hello.role !== "app" || hello.token !== this.options.token) {
          peer.close(1008, "invalid token");
          return;
        }
        authenticated = true;
        tabId = randomUUID();
        const now = new Date().toISOString();
        this.tabs.set(tabId, {
          info: {
            id: tabId,
            appVersion: hello.appVersion,
            projectName: hello.projectName,
            connectedAt: now,
            lastSeenAt: now,
          },
          peer,
          pending: new Map(),
        });
        return;
      }

      const response = message as LiveControlResponse;
      if (!tabId || response.kind !== "response") return;
      const tab = this.tabs.get(tabId);
      const pending = tab?.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      tab!.pending.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error || "EasySchematic app request failed"));
    });

    peer.onClose(() => {
      if (!tabId) return;
      const tab = this.tabs.get(tabId);
      if (!tab) return;
      for (const pending of tab.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("EasySchematic app tab disconnected."));
      }
      this.tabs.delete(tabId);
    });
  }
}
