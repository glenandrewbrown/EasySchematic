import { LiveBridge } from "./bridge.js";
import { ControlChannelError, RemoteBridge } from "./remoteBridge.js";
import type { BridgeLike, BridgeStatus } from "./bridgeTypes.js";

export interface ResilientBridgeOptions {
  host: string;
  port: number;
  controlPort: number;
  token: string;
  publicUrl?: string;
  /** Called whenever the active role changes, for logging/diagnostics. */
  onMode?: (mode: "host" | "proxy") => void;
}

type Mode = "starting" | "host" | "proxy";

/**
 * Presents a single stable bridge to the MCP server while transparently being
 * either the host (owns the listen socket) or a proxy (forwards to the host).
 *
 * - First process to start binds the port and becomes the host.
 * - Later processes detect EADDRINUSE and proxy to it.
 * - If the host dies, the next request re-elects: a proxy retries binding and is
 *   promoted to host, or reconnects to whoever took over. This self-heals
 *   across client restarts without any external daemon.
 */
export class ResilientBridge implements BridgeLike {
  private host: LiveBridge | null = null;
  private remote: RemoteBridge | null = null;
  private mode: Mode = "starting";

  constructor(private readonly options: ResilientBridgeOptions) {}

  get currentMode(): Mode {
    return this.mode;
  }

  async start(): Promise<void> {
    await this.elect();
  }

  /** Try to become the host; on EADDRINUSE fall back to proxying the existing host. */
  private async elect(): Promise<void> {
    const host = new LiveBridge({
      host: this.options.host,
      port: this.options.port,
      controlPort: this.options.controlPort,
      token: this.options.token,
      publicUrl: this.options.publicUrl,
    });
    try {
      await host.start();
      this.host = host;
      this.remote = null;
      this.setMode("host");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      this.host = null;
      this.remote = new RemoteBridge({
        host: this.options.host,
        port: this.options.port,
        controlPort: this.options.controlPort,
        token: this.options.token,
      });
      this.setMode("proxy");
    }
  }

  private setMode(mode: "host" | "proxy"): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.options.onMode?.(mode);
  }

  async request(method: string, params?: unknown, targetTabId?: string): Promise<unknown> {
    return this.requestWithRetry(method, params, targetTabId, true);
  }

  private async requestWithRetry(method: string, params: unknown, targetTabId: string | undefined, canRetry: boolean): Promise<unknown> {
    if (this.mode === "host" && this.host) return this.host.request(method, params, targetTabId);
    if (this.mode === "proxy" && this.remote) {
      try {
        return await this.remote.request(method, params, targetTabId);
      } catch (error) {
        // The host process may have exited. Re-elect once, then retry.
        if (canRetry && error instanceof ControlChannelError) {
          this.remote.close();
          await this.elect();
          return this.requestWithRetry(method, params, targetTabId, false);
        }
        throw error;
      }
    }
    throw new Error("Live bridge is not started.");
  }

  async status(): Promise<BridgeStatus> {
    if (this.mode === "host" && this.host) return this.host.status();
    if (this.mode === "proxy" && this.remote) return this.remote.status();
    return {
      bridge: {
        listening: false,
        host: this.options.host,
        port: this.options.port,
        controlPort: this.options.controlPort,
        mode: "host",
      },
      tabs: [],
      activeTabRequired: false,
    };
  }

  async stop(): Promise<void> {
    if (this.host) await this.host.stop();
    if (this.remote) this.remote.close();
    this.host = null;
    this.remote = null;
  }
}
