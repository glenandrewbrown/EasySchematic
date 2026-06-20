import { randomUUID } from "node:crypto";
import type { JsonRpcRequest, JsonRpcResponse, OperationPlan } from "./protocol.js";
import { APPLY_TOOL_NAMES, READ_TOOL_NAMES } from "./protocol.js";
import type { BridgeLike } from "./bridgeTypes.js";
import {
  CAPABILITIES,
  explainPath,
  getManualResource,
  getOperationGuide,
  listManualResources,
  nextActionsForGoal,
} from "./knowledge.js";

const plans = new Map<string, OperationPlan>();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textContent(value: unknown) {
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];
}

function tool(name: string, description: string, inputSchema: Record<string, unknown> = { type: "object", properties: {} }) {
  return { name, description, inputSchema };
}

function planSchema() {
  return {
    type: "object",
    properties: {
      targetTabId: { type: "string" },
      plan_id: { type: "string" },
      plan: { type: "object" },
    },
  };
}

function deepReadSchema() {
  return {
    type: "object",
    properties: {
      targetTabId: { type: "string" },
      scope: { type: "string", enum: ["project", "store"] },
      path: { type: "string", description: "JSON Pointer path such as /nodes/0/data/ports/0/label. Empty string reads the root." },
      maxDepth: { type: "number" },
      limit: { type: "number" },
      includeValues: { type: "boolean" },
    },
  };
}

function deepPatchSchema() {
  return {
    type: "object",
    properties: {
      targetTabId: { type: "string" },
      scope: { type: "string", enum: ["project", "store"] },
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["set", "merge", "insert", "remove"] },
            path: { type: "string" },
            value: {},
          },
          required: ["op", "path"],
        },
      },
    },
    required: ["operations"],
  };
}

function passthroughSchema(extra: Record<string, unknown> = {}) {
  return { type: "object", properties: { targetTabId: { type: "string" }, apply: { type: "boolean" }, ...extra } };
}

function targetSchema(extra: Record<string, unknown> = {}) {
  return { type: "object", properties: { targetTabId: { type: "string" }, ...extra } };
}

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

function textMatches(value: unknown, query: string): boolean {
  return normalizedText(value).includes(query);
}

export class EasySchematicMcpServer {
  constructor(private readonly bridge: BridgeLike) {}

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (!("id" in request)) return null;
    try {
      const result = await this.dispatch(request.method, request.params);
      return { jsonrpc: "2.0", id: request.id ?? null, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: typeof asRecord(params).protocolVersion === "string" ? asRecord(params).protocolVersion : "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "easyschematic-live-mcp", version: "0.1.0" },
        };
      case "tools/list":
        return { tools: this.tools() };
      case "tools/call":
        return this.callTool(params);
      case "resources/list":
        return {
          resources: [
            { uri: "easyschematic://project/current", name: "Current EasySchematic project", mimeType: "application/json" },
            { uri: "easyschematic://selection/current", name: "Current EasySchematic selection", mimeType: "application/json" },
            { uri: "easyschematic://status", name: "EasySchematic bridge status", mimeType: "application/json" },
            ...listManualResources(),
          ],
        };
      case "resources/read":
        return this.readResource(params);
      case "ping":
        return {};
      default:
        throw new Error(`Unsupported MCP method ${method}`);
    }
  }

  private tools() {
    return [
      tool("get_status", "Return bridge, connected-tab, and current project status.", { type: "object", properties: { targetTabId: { type: "string" } } }),
      ...READ_TOOL_NAMES.filter((name) => !["get_status", "lint_project", "list_deep_paths", "get_deep_value", "list_device_templates", "get_device_template"].includes(name)).map((name) =>
        tool(name, `EasySchematic live read: ${name}.`, { type: "object", properties: { targetTabId: { type: "string" } } }),
      ),
      tool("list_device_templates", "Search/list available built-in and custom device templates, including ports.", {
        type: "object",
        properties: {
          targetTabId: { type: "string" },
          query: { type: "string" },
          limit: { type: "number" },
        },
      }),
      tool("get_device_template", "Return one full device template by templateId, deviceType, model, or label.", {
        type: "object",
        properties: {
          targetTabId: { type: "string" },
          templateId: { type: "string" },
          deviceType: { type: "string" },
          model: { type: "string" },
          label: { type: "string" },
        },
      }),
      tool("list_deep_paths", "List addressable JSON Pointer paths through the live project or serializable app store.", deepReadSchema()),
      tool("get_deep_value", "Read any value by JSON Pointer path from the exported project or serializable app store.", deepReadSchema()),
      tool("patch_deep_values", "Apply arbitrary nested set/merge/insert/remove operations by JSON Pointer path. Prefer preview/apply plans for destructive or bulk edits.", deepPatchSchema()),
      tool("lint_project", "Run expanded project health checks: validation, duplicate labels, missing cable IDs/lengths, unassigned rooms, unused layers.", targetSchema()),
      tool("connect_by_device_names", "Resolve device/port text and create or apply a connection plan.", passthroughSchema({
        source: { type: "string" },
        target: { type: "string" },
        sourcePort: { type: "string" },
        targetPort: { type: "string" },
        signalType: { type: "string" },
      })),
      tool("assign_cable_ids", "Generate sequential cable IDs for all or selected edges; returns a plan unless apply=true.", passthroughSchema({
        prefix: { type: "string" },
        start: { type: "number" },
        edgeIds: { type: "array", items: { type: "string" } },
      })),
      tool("place_devices_in_room", "Resolve devices and room, then generate/apply parentId placements.", passthroughSchema({
        roomId: { type: "string" },
        room: { type: "string" },
        nodeIds: { type: "array", items: { type: "string" } },
        devices: { type: "array", items: { type: "string" } },
      })),
      tool("create_rack_layout", "Generate/apply a rack layout plan using existing rack pages/racks and rackable devices.", passthroughSchema({
        pageId: { type: "string" },
        pageLabel: { type: "string" },
        limit: { type: "number" },
      })),
      tool("apply_layer_strategy", "Generate/apply layer assignments, for example by signal type.", passthroughSchema({
        signalToLayer: { type: "object" },
      })),
      tool("fix_validation_issue", "Return deterministic fix guidance or a suggested plan for a validation issue ID.", passthroughSchema({
        issueId: { type: "string" },
      })),
      tool("create_system_from_spec", "Generate/apply a deterministic system plan from structured rooms/devices spec. Use template discovery first.", passthroughSchema({
        title: { type: "string" },
        prompt: { type: "string" },
        rooms: { type: "array" },
        devices: { type: "array" },
      })),
      tool("get_capabilities", "Return the EasySchematic capability graph: app domains, relevant tools, important paths, and usage guidance.", targetSchema()),
      tool("get_operation_guide", "Return task-specific recipes and best practices for using EasySchematic tools well.", targetSchema({
        goal: { type: "string", description: "Examples: build-system, connect-devices, rack-placement, deep-edit, validate/fix." },
      })),
      tool("suggest_next_actions", "Given a user goal and optional live project context, suggest the next MCP tool calls an expert agent should make.", targetSchema({
        goal: { type: "string" },
      })),
      tool("explain_path", "Explain a JSON Pointer path, likely meaning, risk level, and recommended read/write tools.", targetSchema({
        path: { type: "string" },
      })),
      tool("find_entities", "Search live devices, connections, rooms, pages, racks, layers, and inventory by human text.", targetSchema({
        query: { type: "string" },
        kinds: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
      })),
      tool("resolve_reference", "Resolve a human phrase like 'the ATEM switcher' or 'Stage camera' to likely exact EasySchematic entity IDs.", targetSchema({
        reference: { type: "string" },
        kind: { type: "string" },
        limit: { type: "number" },
      })),
      tool("draft_operation_plan", "Create an explicit, editable operation plan. The MCP server does not use an LLM; agents should fill the returned steps before applying.", {
        type: "object",
        properties: {
          prompt: { type: "string" },
          constraints: { type: "object" },
          steps: { type: "array" },
          title: { type: "string" },
          destructive: { type: "boolean" },
        },
        required: ["prompt"],
      }),
      tool("preview_operation_plan", "Validate references and summarize expected changes without mutating the app.", planSchema()),
      tool("apply_operation_plan", "Apply an explicit operation plan to the connected EasySchematic app tab.", planSchema()),
      tool("undo", "Undo the last EasySchematic store mutation.", { type: "object", properties: { targetTabId: { type: "string" } } }),
      tool("redo", "Redo the last EasySchematic store mutation.", { type: "object", properties: { targetTabId: { type: "string" } } }),
      tool("save_local", "Force the current app tab to persist to browser localStorage.", { type: "object", properties: { targetTabId: { type: "string" } } }),
      tool("export_project", "Return the current exported SchematicFile JSON.", { type: "object", properties: { targetTabId: { type: "string" } } }),
      tool("import_project", "Import/replace the current project. Destructive: prefer apply_operation_plan with an explicit import_project step.", {
        type: "object",
        properties: { targetTabId: { type: "string" }, project: { type: "object" } },
        required: ["project"],
      }),
    ];
  }

  private async callTool(params: unknown): Promise<unknown> {
    const { name, arguments: args = {} } = asRecord(params);
    if (typeof name !== "string") throw new Error("tools/call requires a tool name");
    const toolArgs = asRecord(args);
    const targetTabId = typeof toolArgs.targetTabId === "string" ? toolArgs.targetTabId : undefined;

    if (name === "get_status") {
      let appStatus: unknown = null;
      try {
        appStatus = await this.bridge.request("get_status", {}, targetTabId);
      } catch (error) {
        appStatus = { error: error instanceof Error ? error.message : String(error) };
      }
      return { content: textContent({ ...(await this.bridge.status()), app: appStatus }) };
    }

    if (name === "draft_operation_plan") {
      const id = randomUUID();
      const plan: OperationPlan = {
        id,
        title: typeof toolArgs.title === "string" ? toolArgs.title : "EasySchematic operation plan",
        prompt: typeof toolArgs.prompt === "string" ? toolArgs.prompt : "",
        destructive: Boolean(toolArgs.destructive),
        steps: Array.isArray(toolArgs.steps) ? toolArgs.steps : [],
      };
      plans.set(id, plan);
      return { content: textContent({ plan, note: "Review/fill plan.steps, then call preview_operation_plan and apply_operation_plan." }) };
    }

    if (name === "get_capabilities") {
      return { content: textContent({ capabilities: CAPABILITIES, recommendedLoop: ["inspect", "resolve", "plan", "preview", "apply", "validate", "report"] }) };
    }

    if (name === "get_operation_guide") {
      return { content: textContent(getOperationGuide(typeof toolArgs.goal === "string" ? toolArgs.goal : "")) };
    }

    if (name === "suggest_next_actions") {
      const goal = typeof toolArgs.goal === "string" ? toolArgs.goal : "";
      const context = await this.safeLiveContext(targetTabId);
      return { content: textContent({ goal, nextActions: nextActionsForGoal(goal), liveContext: context }) };
    }

    if (name === "explain_path") {
      return { content: textContent(explainPath(typeof toolArgs.path === "string" ? toolArgs.path : "")) };
    }

    if (name === "find_entities") {
      const result = await this.findEntities(toolArgs, targetTabId);
      return { content: textContent(result) };
    }

    if (name === "resolve_reference") {
      const result = await this.findEntities({
        query: typeof toolArgs.reference === "string" ? toolArgs.reference : "",
        kinds: typeof toolArgs.kind === "string" ? [toolArgs.kind] : undefined,
        limit: typeof toolArgs.limit === "number" ? toolArgs.limit : 5,
      }, targetTabId);
      return { content: textContent({ reference: toolArgs.reference, candidates: result.results, confidence: result.results.length === 1 ? "high" : result.results.length > 1 ? "needs-user-or-context" : "none" }) };
    }

    if (name === "preview_operation_plan" || name === "apply_operation_plan") {
      const plan = this.resolvePlan(toolArgs);
      const result = await this.bridge.request(name, { plan }, targetTabId);
      return { content: textContent(result) };
    }

    if (name === "import_project") {
      const result = await this.bridge.request("import_project", { project: toolArgs.project }, targetTabId);
      return { content: textContent(result) };
    }

    if ([...READ_TOOL_NAMES, ...APPLY_TOOL_NAMES].includes(name as never)) {
      const result = await this.bridge.request(name, toolArgs, targetTabId);
      return { content: textContent(result) };
    }

    throw new Error(`Unknown EasySchematic MCP tool ${name}`);
  }

  private resolvePlan(args: Record<string, unknown>): OperationPlan {
    if (args.plan && typeof args.plan === "object") return args.plan as OperationPlan;
    if (typeof args.plan_id === "string") {
      const plan = plans.get(args.plan_id);
      if (!plan) throw new Error(`No draft operation plan with id ${args.plan_id}`);
      return plan;
    }
    throw new Error("Expected plan or plan_id");
  }

  private async readResource(params: unknown): Promise<unknown> {
    const uri = asRecord(params).uri;
    if (typeof uri !== "string") throw new Error("resources/read requires uri");
    let result: unknown;
    const manual = getManualResource(uri);
    if (manual) {
      result = manual;
    } else if (uri === "easyschematic://status") {
      result = await this.bridge.status();
    } else if (uri === "easyschematic://project/current") {
      result = await this.bridge.request("get_current_project");
    } else if (uri === "easyschematic://selection/current") {
      result = await this.bridge.request("get_selection");
    } else {
      throw new Error(`Unknown resource ${uri}`);
    }
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result, null, 2) }] };
  }

  private async safeLiveContext(targetTabId?: string): Promise<unknown> {
    try {
      return {
        status: await this.bridge.request("get_status", {}, targetTabId),
        summary: await this.bridge.request("get_project_summary", {}, targetTabId),
        validation: await this.bridge.request("validate_schematic", {}, targetTabId),
      };
    } catch (error) {
      return { unavailable: true, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private async findEntities(args: Record<string, unknown>, targetTabId?: string): Promise<{ query: string; results: unknown[] }> {
    const query = normalizedText(args.query);
    if (!query) throw new Error("find_entities requires query");
    const kindSet = new Set(Array.isArray(args.kinds) ? args.kinds.map((kind) => String(kind)) : []);
    const limit = typeof args.limit === "number" ? Math.max(1, Math.min(100, args.limit)) : 20;
    const wants = (kind: string) => kindSet.size === 0 || kindSet.has(kind) || kindSet.has(`${kind}s`);
    const results: unknown[] = [];

    const push = (kind: string, item: Record<string, unknown>, score = 1) => {
      if (results.length >= limit || !wants(kind)) return;
      results.push({ kind, score, ...item });
    };

    if (wants("device")) {
      const devices = await this.bridge.request("list_devices", {}, targetTabId) as Record<string, unknown>[];
      for (const device of devices) {
        const haystack = [device.id, device.label, device.manufacturer, device.model, device.deviceType].join(" ");
        if (haystack.toLowerCase().includes(query)) push("device", device, textMatches(device.label, query) ? 3 : 2);
        const ports = Array.isArray(device.ports) ? device.ports as Record<string, unknown>[] : [];
        for (const port of ports) {
          const portHaystack = [device.id, device.label, port.id, port.label, port.direction, port.signalType, port.connectorType].join(" ").toLowerCase();
          if ((wants("port") || wants("device")) && portHaystack.includes(query)) {
            push("port", {
              deviceId: device.id,
              deviceLabel: device.label,
              port,
              handle: port.id,
              direction: port.direction,
              signalType: port.signalType,
            }, textMatches(port.label, query) ? 4 : 2);
          }
        }
      }
    }

    if (wants("connection")) {
      const connections = await this.bridge.request("list_connections", {}, targetTabId) as Record<string, unknown>[];
      for (const connection of connections) {
        const haystack = [connection.id, connection.label, connection.cableId, connection.signalType, connection.source, connection.target].join(" ");
        if (haystack.toLowerCase().includes(query)) push("connection", connection, textMatches(connection.label, query) ? 3 : 1);
      }
    }

    if (wants("room")) {
      const rooms = await this.bridge.request("list_rooms", {}, targetTabId) as Record<string, unknown>[];
      for (const room of rooms) {
        const haystack = [room.id, room.label].join(" ");
        if (haystack.toLowerCase().includes(query)) push("room", room, textMatches(room.label, query) ? 3 : 2);
      }
    }

    if (wants("page") || wants("rack")) {
      const pagesResult = await this.bridge.request("list_pages", {}, targetTabId) as { pages?: Record<string, unknown>[] };
      for (const page of pagesResult.pages ?? []) {
        const haystack = [page.id, page.label, page.type].join(" ");
        if (wants("page") && haystack.toLowerCase().includes(query)) push("page", page, textMatches(page.label, query) ? 3 : 1);
      }
      const racks = await this.bridge.request("list_racks", {}, targetTabId) as Record<string, unknown>[];
      for (const rack of racks) {
        const haystack = [rack.id, rack.label, rack.pageId, rack.pageLabel].join(" ");
        if (haystack.toLowerCase().includes(query)) push("rack", rack, textMatches(rack.label, query) ? 3 : 1);
      }
    }

    if (wants("layer")) {
      const layers = await this.bridge.request("list_layers", {}, targetTabId) as Record<string, unknown>[];
      for (const layer of layers) {
        const haystack = [layer.id, layer.name].join(" ");
        if (haystack.toLowerCase().includes(query)) push("layer", layer, textMatches(layer.name, query) ? 3 : 1);
      }
    }

    return { query, results };
  }
}
