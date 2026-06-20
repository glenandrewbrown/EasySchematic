import { describe, expect, it } from "vitest";
import { EasySchematicMcpServer } from "../src/mcpServer";

const fakeBridge = {
  status: () => ({ bridge: { listening: false }, tabs: [] }),
  request: async () => {
    throw new Error("no live app in unit test");
  },
};

describe("EasySchematic MCP knowledge layer", () => {
  it("advertises agent-superuser tools", async () => {
    const server = new EasySchematicMcpServer(fakeBridge as never);
    const response = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = (response?.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name);

    expect(tools).toContain("get_capabilities");
    expect(tools).toContain("get_operation_guide");
    expect(tools).toContain("suggest_next_actions");
    expect(tools).toContain("explain_path");
    expect(tools).toContain("find_entities");
    expect(tools).toContain("resolve_reference");
  });

  it("serves manual resources without a connected browser tab", async () => {
    const server = new EasySchematicMcpServer(fakeBridge as never);
    const response = await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/read",
      params: { uri: "easyschematic://manual/operation-recipes" },
    });
    const contents = (response?.result as { contents: Array<{ text: string }> }).contents;

    expect(contents[0].text).toContain("build-system");
    expect(contents[0].text).toContain("connect-devices");
  });
});
