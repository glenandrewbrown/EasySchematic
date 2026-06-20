import { dispatchLiveControl } from "./dispatcher";
import type { LiveControlClientMessage, LiveControlRequest, LiveControlServerMessage } from "./protocol";
import {
  consumeQueryConfig,
  resolveLiveControlConfig,
  setLiveControlEnabled,
  setLiveControlToken,
  setLiveControlUrl,
  type LiveControlConfig,
} from "./runtimeConfig";
import { useSchematicStore } from "../store";

interface LiveControlRuntime {
  stop: () => void;
}

const APP_VERSION = "0.44.0";
const MAX_RETRY_DELAY_MS = 30_000;

export type LiveControlPhase = "disabled" | "connecting" | "connected" | "disconnected";

export interface LiveControlState {
  phase: LiveControlPhase;
  url: string | null;
  projectName: string | null;
  error?: string;
}

interface LiveControlApi {
  enable: (token?: string, url?: string) => LiveControlState;
  disable: () => LiveControlState;
  status: () => LiveControlState;
  config: () => { enabled: boolean; url: string; hasToken: boolean };
}

declare global {
  interface Window {
    easySchematicLiveControl?: LiveControlApi;
  }
}

// --- External store so an in-app indicator can reflect connection state ---

let state: LiveControlState = { phase: "disabled", url: null, projectName: null };
const listeners = new Set<() => void>();

function setState(next: Partial<LiveControlState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function getLiveControlState(): LiveControlState {
  return state;
}

export function subscribeLiveControl(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- Connection controller (reconnectable, driven by runtime config) ---

function send(ws: WebSocket, message: LiveControlClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function isRequest(message: LiveControlServerMessage): message is LiveControlRequest {
  return message.kind === "request" && typeof message.id === "string" && typeof message.method === "string";
}

class LiveControlController {
  private socket: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  private config: LiveControlConfig;

  constructor(config: LiveControlConfig) {
    this.config = config;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
    this.socket = null;
    setState({ phase: "disabled", url: null, projectName: null, error: undefined });
  }

  reconfigure(config: LiveControlConfig): void {
    this.config = config;
    this.retry = 0;
    this.socket?.close();
    this.socket = null;
    if (config.enabled && config.token) this.start();
    else this.stop();
  }

  private connect(): void {
    if (this.stopped) return;
    const { url } = this.config;
    setState({ phase: "connecting", url, error: undefined });
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      setState({ phase: "disconnected", error: error instanceof Error ? error.message : String(error) });
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.retry = 0;
      send(socket, {
        kind: "hello",
        role: "app",
        token: this.config.token ?? "",
        appVersion: APP_VERSION,
        projectName: useSchematicStore.getState().schematicName,
      });
      setState({ phase: "connected", url, projectName: useSchematicStore.getState().schematicName, error: undefined });
      console.info("[EasySchematic live-control] connected");
    });

    socket.addEventListener("message", async (event) => {
      let message: LiveControlServerMessage;
      try {
        message = JSON.parse(String(event.data)) as LiveControlServerMessage;
      } catch {
        console.warn("[EasySchematic live-control] ignored invalid bridge message");
        return;
      }
      if (!isRequest(message)) return;
      try {
        const result = await dispatchLiveControl(message.method, message.params);
        send(socket, { id: message.id, kind: "response", ok: true, result });
      } catch (error) {
        send(socket, {
          id: message.id,
          kind: "response",
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      setState({ phase: "disconnected" });
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      console.warn("[EasySchematic live-control] bridge socket error");
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** this.retry);
    this.retry += 1;
    console.info(`[EasySchematic live-control] disconnected; retrying in ${delay}ms`);
    window.setTimeout(() => this.connect(), delay);
  }
}

let controller: LiveControlController | null = null;

/** Create-or-reconfigure the singleton controller from the resolved runtime config. */
function ensureController(): void {
  const config = resolveLiveControlConfig();
  if (!config.enabled) {
    controller?.stop();
    setState({ phase: "disabled", url: null, projectName: null, error: undefined });
    return;
  }
  if (!config.token) {
    controller?.stop();
    setState({ phase: "disabled", url: config.url, projectName: null, error: "missing token" });
    console.warn(
      "[EasySchematic live-control] enabled but no token set. Run easySchematicLiveControl.enable(\"<token>\") with the EASYS_CONTROL_TOKEN from your MCP config.",
    );
    return;
  }
  if (!controller) controller = new LiveControlController(config);
  else controller.reconfigure(config);
  controller.start();
}

function installWindowApi(): void {
  if (typeof window === "undefined" || window.easySchematicLiveControl) return;
  window.easySchematicLiveControl = {
    enable(token?: string, url?: string) {
      if (token) setLiveControlToken(token);
      if (url) setLiveControlUrl(url);
      setLiveControlEnabled(true);
      ensureController();
      return getLiveControlState();
    },
    disable() {
      setLiveControlEnabled(false);
      controller?.stop();
      return getLiveControlState();
    },
    status() {
      return getLiveControlState();
    },
    config() {
      const config = resolveLiveControlConfig();
      return { enabled: config.enabled, url: config.url, hasToken: Boolean(config.token) };
    },
  };
}

/**
 * Boots live control. Always installs the `easySchematicLiveControl` console API
 * (so it can be enabled on any build at runtime) and connects immediately when
 * the resolved config is enabled with a token.
 */
export function startLiveControlClient(): LiveControlRuntime | null {
  if (typeof window !== "undefined") consumeQueryConfig();
  installWindowApi();
  ensureController();
  return {
    stop: () => controller?.stop(),
  };
}
