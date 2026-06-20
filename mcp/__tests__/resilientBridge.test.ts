import { describe, expect, it } from "vitest";
import { LiveBridge } from "../src/bridge";
import { ResilientBridge } from "../src/resilientBridge";
import { EasySchematicMcpServer } from "../src/mcpServer";
import { connectFakeApp, waitForTab } from "./fakeApp";

// Fixed ports: cross-process election can't use an ephemeral port because the
// proxy must independently predict the control port. Uncommon range to dodge
// collisions; the suite skips cleanly if the OS refuses the bind.
const HOST = "127.0.0.1";
const TEST_PORT = 39951;
const CONTROL_PORT = TEST_PORT + 1;
const TOKEN = "shared-bridge-token";

function skippableBindError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EADDRINUSE" || code === "EACCES";
}

describe("ResilientBridge shared bridge", () => {
  it("proxies a second instance through the host so both share one app tab", async () => {
    const host = new ResilientBridge({ host: HOST, port: TEST_PORT, controlPort: CONTROL_PORT, token: TOKEN });
    try {
      await host.start();
    } catch (error) {
      if (skippableBindError(error)) return;
      throw error;
    }
    expect(host.currentMode).toBe("host");

    const proxy = new ResilientBridge({ host: HOST, port: TEST_PORT, controlPort: CONTROL_PORT, token: TOKEN });
    try {
      const app = await connectFakeApp(TEST_PORT, TOKEN, "Wedding Venue");
      await waitForTab(host);

      await proxy.start();
      expect(proxy.currentMode).toBe("proxy");

      // The proxy sees the host's connected tab via the control channel.
      const proxyStatus = await proxy.status();
      expect(proxyStatus.bridge.mode).toBe("proxy");
      expect(proxyStatus.proxy?.connected).toBe(true);
      expect(proxyStatus.tabs).toHaveLength(1);

      // A tool call through the proxy is forwarded host→app and the result returns.
      const server = new EasySchematicMcpServer(proxy);
      const responsePromise = server.handle({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "get_project_summary", arguments: {} },
      });
      const request = await app.nextMessage() as { id: string; method: string };
      expect(request.method).toBe("get_project_summary");
      app.send({ id: request.id, kind: "response", ok: true, result: { projectName: "Wedding Venue", deviceCount: 5 } });
      const response = await responsePromise;
      expect(JSON.stringify(response?.result)).toContain("Wedding Venue");

      app.close();
    } finally {
      await proxy.stop();
      await host.stop();
    }
  });

  it("reports listening:false when it fails to bind (honest status)", async () => {
    const first = new LiveBridge({ host: HOST, port: TEST_PORT, token: TOKEN });
    try {
      await first.start();
    } catch (error) {
      if (skippableBindError(error)) return;
      throw error;
    }
    expect(first.status().bridge.listening).toBe(true);

    const second = new LiveBridge({ host: HOST, port: TEST_PORT, token: TOKEN });
    await expect(second.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    // The losing instance must not pretend it owns the port.
    expect(second.status().bridge.listening).toBe(false);

    await second.stop();
    await first.stop();
  });
});
