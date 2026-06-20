import type { AppTab } from "./protocol.js";

/**
 * Shared shape returned by every bridge implementation (host or proxy) so the
 * MCP server can render an honest, mode-aware status without caring which one
 * is active.
 */
export interface BridgeStatus {
  bridge: {
    listening: boolean;
    host: string;
    port: number;
    controlPort?: number;
    publicUrl?: string;
    /** "host" owns the listen socket; "proxy" forwards to the host process. */
    mode: "host" | "proxy";
  };
  tabs: AppTab[];
  activeTabRequired: boolean;
  /** Present only when this instance proxies to another process's bridge. */
  proxy?: { connected: boolean; error?: string };
}

/**
 * The minimal surface the MCP server depends on. Both the in-process host
 * ({@link LiveBridge}) and the cross-process {@link RemoteBridge} implement it,
 * so {@link ResilientBridge} can swap between them transparently.
 */
export interface BridgeLike {
  request(method: string, params?: unknown, targetTabId?: string): Promise<unknown>;
  status(): BridgeStatus | Promise<BridgeStatus>;
}

/**
 * Reserved control-channel method: asks the host process for its own
 * {@link BridgeStatus} (which app tabs are connected to the shared bridge),
 * as opposed to the app-level `get_status` method.
 */
export const CONTROL_STATUS_METHOD = "__bridge_status__";

/** First line a proxy sends on the control channel to authenticate. */
export interface ControlHello {
  kind: "control-hello";
  token: string;
}

export interface ControlRequest {
  id: string;
  method: string;
  params?: unknown;
  targetTabId?: string;
}

export interface ControlResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
