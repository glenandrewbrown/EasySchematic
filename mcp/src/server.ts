#!/usr/bin/env node
import { ResilientBridge } from "./resilientBridge.js";
import { EasySchematicMcpServer } from "./mcpServer.js";
import { StdioTransport } from "./stdio.js";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function log(message: string): void {
  // stderr only — stdout is reserved for the MCP JSON-RPC stream.
  process.stderr.write(`[easyschematic-mcp] ${message}\n`);
}

async function main(): Promise<void> {
  const token = process.env.EASYS_CONTROL_TOKEN;
  if (!token) {
    log("EASYS_CONTROL_TOKEN is required.");
    process.exit(1);
  }

  const port = envNumber("EASYS_BRIDGE_PORT", 39887);
  const bridge = new ResilientBridge({
    host: process.env.EASYS_BRIDGE_HOST || "127.0.0.1",
    port,
    controlPort: envNumber("EASYS_CONTROL_PORT", port + 1),
    token,
    publicUrl: process.env.EASYS_PUBLIC_BRIDGE_URL,
    onMode: (mode) => {
      log(mode === "host"
        ? `hosting live bridge on ${process.env.EASYS_BRIDGE_HOST || "127.0.0.1"}:${port} (app path /app).`
        : `another process owns the bridge port; proxying to it so all clients share one app tab.`);
    },
  });
  try {
    await bridge.start();
  } catch (error) {
    // Non-fatal: knowledge/manual tools still work without a live bridge. Surface
    // the reason so a genuinely broken bridge is diagnosable instead of silent.
    log(`live bridge unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  const mcp = new EasySchematicMcpServer(bridge);
  const transport = new StdioTransport();
  transport.onMessage(async (message) => {
    const response = await mcp.handle(message);
    if (response) transport.send(response);
  });
  transport.start();

  const shutdown = async () => {
    await bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
