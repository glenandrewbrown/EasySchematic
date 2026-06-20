import { describe, expect, it } from "vitest";
import { LiveBridge } from "../src/bridge";
import { EasySchematicMcpServer } from "../src/mcpServer";
import { connectFakeApp, waitForTab } from "./fakeApp";

describe("LiveBridge MCP E2E", () => {
  it("routes an MCP tool call through a fake app WebSocket", async () => {
    const token = "test-token";
    const bridge = new LiveBridge({ host: "127.0.0.1", port: 0, token });
    try {
      await bridge.start();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    const port = bridge.status().bridge.port;
    const app = await connectFakeApp(port, token);
    await waitForTab(bridge);
    const server = new EasySchematicMcpServer(bridge);

    const responsePromise = server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_project_summary", arguments: {} },
    });
    const request = await app.nextMessage() as { id: string; method: string };
    expect(request.method).toBe("get_project_summary");
    app.send({ id: request.id, kind: "response", ok: true, result: { projectName: "Fake", deviceCount: 2 } });
    const response = await responsePromise;

    expect(JSON.stringify(response?.result)).toContain("deviceCount");
    app.close();
    await bridge.stop();
  });
});
