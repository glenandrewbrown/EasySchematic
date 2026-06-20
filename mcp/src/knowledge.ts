export type GuideName =
  | "overview"
  | "schema"
  | "workflows"
  | "best-practices"
  | "operation-recipes"
  | "build-system"
  | "deep-write-safety";

export interface Capability {
  id: string;
  name: string;
  description: string;
  readTools: string[];
  writeTools: string[];
  keyPaths: string[];
  guidance: string[];
}

export const CAPABILITIES: Capability[] = [
  {
    id: "schematic",
    name: "Signal-flow schematic",
    description: "Create and edit AV system devices, ports, and connections on the main schematic canvas.",
    readTools: ["list_devices", "list_connections", "get_current_project", "list_device_templates", "get_deep_value"],
    writeTools: ["draft_operation_plan", "preview_operation_plan", "apply_operation_plan", "patch_deep_values"],
    keyPaths: ["/nodes", "/edges", "/nodes/{index}/data/ports", "/edges/{index}/data"],
    guidance: [
      "Use templates to create devices; do not invent port IDs unless creating a custom project import.",
      "Use native connect steps for normal connections so EasySchematic can validate ports and auto-insert adapters.",
      "Use deep writes for labels, cable IDs, run lengths, metadata, colors, and precise nested fields.",
    ],
  },
  {
    id: "rooms-layout",
    name: "Rooms and layout",
    description: "Create rooms, place devices in rooms, and edit room geometry/scale/layout metadata.",
    readTools: ["list_rooms", "list_deep_paths", "get_deep_value"],
    writeTools: ["apply_operation_plan", "patch_deep_values"],
    keyPaths: ["/nodes/{roomIndex}", "/nodes/{roomIndex}/data", "/nodes/{deviceIndex}/parentId", "/roomDistances"],
    guidance: [
      "Rooms are nodes with type `room`; devices can be parented to rooms using `parentId`.",
      "When changing geometry, inspect the live room node first because width/height/shape may live on the node and data object.",
    ],
  },
  {
    id: "racks",
    name: "Rack elevations",
    description: "Create rack pages, racks, placements, shelves, and accessories.",
    readTools: ["list_pages", "list_racks", "get_deep_value"],
    writeTools: ["apply_operation_plan", "patch_deep_values"],
    keyPaths: ["/pages", "/pages/{index}/racks", "/pages/{index}/placements", "/pages/{index}/accessories"],
    guidance: [
      "Prefer native add_rack_page/add_rack/add_rack_placement plan steps for creation.",
      "Use deep writes for exact rack metadata, labels, dimensions, and placement tweaks after creation.",
    ],
  },
  {
    id: "layers",
    name: "Layers and visibility",
    description: "Organize devices, rooms, edges, objects, and zones with named layers and visibility/lock state.",
    readTools: ["list_layers", "list_deep_paths"],
    writeTools: ["apply_operation_plan", "patch_deep_values"],
    keyPaths: ["/layers", "/nodes/{index}/data/layerId", "/edges/{index}/data/layerId"],
    guidance: [
      "Create layers with `add_layer`; assign items by setting `data.layerId` on nodes/edges.",
      "Respect locked layers when acting like an end-user; deep writes can bypass UI locks, so use them deliberately.",
    ],
  },
  {
    id: "inventory-reports",
    name: "Inventory, reports, and validation",
    description: "Read owned gear/cables/inventory, validate schematics, and generate project reports.",
    readTools: ["list_inventory", "validate_schematic", "generate_report"],
    writeTools: ["patch_deep_values"],
    keyPaths: ["/ownedGear", "/ownedCables", "/ownedInventory", "/gearUnits", "/edges/{index}/data/assignedCableIds"],
    guidance: [
      "After building or editing a system, always run validation and summarize warnings/errors.",
      "Use report output for pack-list and inventory summaries; use deep writes for inventory metadata only after inspecting shape.",
    ],
  },
  {
    id: "project-file",
    name: "Project import/export",
    description: "Read, replace, save, and export full EasySchematic projects.",
    readTools: ["get_current_project", "export_project"],
    writeTools: ["import_project", "save_local", "apply_operation_plan"],
    keyPaths: ["/", "/name", "/version"],
    guidance: [
      "Treat import/replace as destructive and represent it explicitly in plans.",
      "Use `save_local` after important live changes if the user expects persistence in the browser.",
    ],
  },
];

const SCHEMA_GUIDE = {
  title: "EasySchematic Project Shape",
  format: "SchematicFile JSON exported by the app",
  topLevel: {
    version: "Schema version number.",
    name: "Project/schematic name.",
    nodes: "Canvas entities: devices, rooms, notes, annotations, objects, zones, dimensions, waypoints, stub labels.",
    edges: "Connections between device ports. React Flow source/target fields identify devices and handles; data stores AV metadata.",
    customTemplates: "User-created device templates.",
    ownedGear: "Quantity-based owned gear inventory.",
    ownedCables: "Owned cable inventory.",
    ownedInventory: "General inventory items.",
    layers: "Named visibility/lock/color layers.",
    pages: "Rack elevation and print sheet pages.",
    reportLayouts: "Report layout settings.",
    titleBlock: "Drawing metadata.",
  },
  nodeRules: [
    "Device nodes have `type: device` and a `data` object with label, deviceType, ports, model/manufacturer metadata, layerId, rack metadata, costs, power, thermal, and other per-device fields.",
    "Room nodes have `type: room` and carry label/shape/scale/lock/layout fields.",
    "Furniture/layout objects have `type: object`; zones have `type: zone`; notes/annotations carry text/html data.",
  ],
  edgeRules: [
    "Connection edges use `source`, `sourceHandle`, `target`, and `targetHandle` to connect device port handles.",
    "Edge `data.signalType` should match the connected ports unless intentionally overridden.",
    "Cable ID, length, labels, line style, assigned owned-cable IDs, layerId, and routing waypoints live under `edge.data`.",
  ],
  pathRules: [
    "Deep paths use JSON Pointer syntax.",
    "Use `list_deep_paths` before editing unfamiliar structures.",
    "Use `get_deep_value` on the parent object before `patch_deep_values`.",
  ],
};

const OPERATION_RECIPES = [
  {
    id: "add-device",
    goal: "Add a device from the real library.",
    steps: [
      "Call `list_device_templates` with a query.",
      "Choose a template and inspect ports if connections are needed.",
      "Create an operation plan with `add_device` or `add_devices`.",
      "Patch label/metadata with `dataPatch` or `patch_deep_values` if needed.",
      "Preview, apply, validate.",
    ],
  },
  {
    id: "connect-devices",
    goal: "Connect two existing devices.",
    steps: [
      "Call `list_devices` and inspect each device's ports.",
      "Pick source output/bidirectional and target input/bidirectional port IDs.",
      "Use a `connect` plan step with source, sourceHandle, target, targetHandle.",
      "Use `patch_edge` or `patch_deep_values` for cable ID, length, labels, and layer.",
      "Run `validate_schematic`.",
    ],
  },
  {
    id: "build-system",
    goal: "Build a full AV system from a natural language brief.",
    steps: [
      "Get `get_capabilities` and this operation guide.",
      "Inspect current project summary, rooms, layers, devices, and validation.",
      "Search templates for each required role; do not guess template IDs.",
      "Draft an operation plan: rooms first, bulk devices second, connections third, metadata fourth, racks/layers/inventory last.",
      "Preview the plan and confirm missing references are empty.",
      "Apply the plan, validate, generate report, and summarize changed entities.",
    ],
  },
  {
    id: "rack-placement",
    goal: "Create rack elevation information.",
    steps: [
      "Inspect `list_pages` and `list_racks`.",
      "Add a rack page if needed.",
      "Add racks with native plan steps.",
      "Place devices using `add_rack_placement`; inspect existing device IDs first.",
      "Use deep writes only for precise placement/accessory metadata after inspecting `/pages/{index}`.",
    ],
  },
  {
    id: "deep-edit",
    goal: "Edit an arbitrary field.",
    steps: [
      "Call `list_deep_paths` around the likely parent path.",
      "Call `get_deep_value` on the exact parent path.",
      "Use `patch_deep_values` with set/merge/insert/remove.",
      "For bulk edits, put `patch_deep_values` inside a plan and preview first.",
      "Validate and undo if the result is wrong.",
    ],
  },
];

const BEST_PRACTICES = [
  "Prefer semantic/native plan steps for creation and topology changes; use deep writes for exact field edits.",
  "Always inspect before writing: project summary, relevant entities, template ports, and parent deep values.",
  "Never invent node IDs, edge IDs, page IDs, rack IDs, or port handles when the app can provide them.",
  "Use bulk device addition for multiple devices so the app creates a cleaner undo history.",
  "After mutation, run `validate_schematic`; for deliverables, also call `generate_report`.",
  "When multiple tabs are connected, pass `targetTabId` from `get_status`.",
  "Represent destructive changes explicitly in plans: import project, new schematic, bulk remove, or large deep patches.",
];

const AGENT_PROMPT_PACK = {
  title: "EasySchematic MCP Agent Instructions",
  role: "Act as an expert AV system designer and EasySchematic power user.",
  operatingRules: [
    "Begin complex tasks with get_capabilities and get_operation_guide.",
    "Inspect live state before writing. Never assume IDs, port handles, rack IDs, or layer IDs.",
    "Use semantic/native tools for topology and creation; use deep writes for exact property edits.",
    "For any mutation, prefer draft_operation_plan -> preview_operation_plan -> apply_operation_plan unless the user explicitly requested a direct low-risk edit.",
    "After applying changes, run validate_schematic and summarize changed nodes/edges/fields.",
    "When references are ambiguous, call resolve_reference/find_entities and ask only if ambiguity remains material.",
    "Treat import_project, new_schematic, bulk remove, port ID changes, and source/target handle edits as destructive/high-risk.",
  ],
  antiPatterns: [
    "Do not invent device templates when list_device_templates can discover real ones.",
    "Do not directly edit edge source/target fields when connect_by_device_names or connect plan steps can be used.",
    "Do not change port IDs without checking all edges that reference them.",
    "Do not return huge raw project JSON when a summary, fields, limit, or specific path will do.",
  ],
  defaultWorkflow: ["inspect", "resolve references", "discover templates/ports", "draft", "preview", "apply", "validate", "report"],
};

export function getManualResource(uri: string): unknown {
  switch (uri) {
    case "easyschematic://manual/overview":
      return {
        purpose: "Help agents operate EasySchematic as a power user.",
        recommendedLoop: ["inspect", "resolve references/templates", "draft plan", "preview", "apply", "validate", "report"],
        corePrinciple: "Use native app actions for semantics; use deep paths for precision.",
      };
    case "easyschematic://manual/schema":
    case "easyschematic://schema/project":
      return SCHEMA_GUIDE;
    case "easyschematic://manual/workflows":
      return {
        workflows: [
          "Inspect current project: get_status → get_project_summary → list_devices/list_connections/list_rooms → validate_schematic.",
          "Build system: get_operation_guide(build-system) → list_device_templates per role → draft/preview/apply → validate/report.",
          "Deep edit: list_deep_paths → get_deep_value → patch_deep_values → validate.",
        ],
      };
    case "easyschematic://manual/best-practices":
      return { bestPractices: BEST_PRACTICES };
    case "easyschematic://manual/agent-instructions":
      return AGENT_PROMPT_PACK;
    case "easyschematic://manual/operation-recipes":
    case "easyschematic://schema/operations":
      return { recipes: OPERATION_RECIPES };
    case "easyschematic://capabilities":
      return { capabilities: CAPABILITIES };
    default:
      return null;
  }
}

export function listManualResources() {
  return [
    { uri: "easyschematic://manual/overview", name: "EasySchematic agent overview", mimeType: "application/json" },
    { uri: "easyschematic://manual/schema", name: "EasySchematic project schema guide", mimeType: "application/json" },
    { uri: "easyschematic://manual/workflows", name: "EasySchematic agent workflows", mimeType: "application/json" },
    { uri: "easyschematic://manual/best-practices", name: "EasySchematic agent best practices", mimeType: "application/json" },
    { uri: "easyschematic://manual/agent-instructions", name: "EasySchematic MCP agent instruction pack", mimeType: "application/json" },
    { uri: "easyschematic://manual/operation-recipes", name: "EasySchematic operation recipes", mimeType: "application/json" },
    { uri: "easyschematic://capabilities", name: "EasySchematic capability graph", mimeType: "application/json" },
    { uri: "easyschematic://schema/project", name: "SchematicFile schema guide", mimeType: "application/json" },
    { uri: "easyschematic://schema/operations", name: "Operation plan schema guide", mimeType: "application/json" },
  ];
}

export function getOperationGuide(goal: string): unknown {
  const key = goal.toLowerCase().trim();
  const matches = OPERATION_RECIPES.filter((recipe) =>
    recipe.id.includes(key) ||
    recipe.goal.toLowerCase().includes(key) ||
    key.split(/\s+/).some((token) => recipe.id.includes(token) || recipe.goal.toLowerCase().includes(token)),
  );
  return {
    goal,
    recipes: matches.length > 0 ? matches : OPERATION_RECIPES,
    bestPractices: BEST_PRACTICES,
  };
}

export function explainPath(path: string): unknown {
  const normalized = path || "/";
  const hints: string[] = [];
  let safety = "inspect-before-write";
  if (/^\/nodes(\/\d+)?$/.test(path)) hints.push("Canvas node collection or a specific node. Node type determines data shape.");
  if (/^\/nodes\/\d+\/data/.test(path)) hints.push("Node-specific editable data. Device data includes ports, labels, model metadata, layerId, power, cost, rack metadata, and more.");
  if (/^\/nodes\/\d+\/data\/ports/.test(path)) {
    hints.push("Device ports. Port IDs are used as connection handles; changing IDs can break edges.");
    safety = "high-risk";
  }
  if (/^\/edges/.test(path)) hints.push("Connection edges. Topology uses source/target handles; metadata lives under data.");
  if (/^\/edges\/\d+\/(source|target|sourceHandle|targetHandle)/.test(path)) {
    hints.push("Connection topology field. Prefer native connect/reconnect flows over direct edits.");
    safety = "high-risk";
  }
  if (/^\/edges\/\d+\/data/.test(path)) hints.push("Connection metadata such as signalType, cableId, cableLength, labels, layerId, assignedCableIds, and routing waypoints.");
  if (/^\/pages/.test(path)) hints.push("Rack elevation or print sheet pages. Inspect the page type before editing nested fields.");
  if (/^\/layers/.test(path)) hints.push("Layer definitions. Assign membership from node.data.layerId or edge.data.layerId.");
  if (/^\/owned/.test(path) || /^\/gearUnits/.test(path)) hints.push("Inventory data. Inspect exact item shape before inserting or merging.");
  if (path === "" || path === "/") hints.push("Project root. Replacing root should be done through explicit import_project or a destructive plan.");
  return {
    path: normalized,
    safety,
    hints: hints.length > 0 ? hints : ["Unknown path pattern. Use list_deep_paths and get_deep_value before writing."],
    recommendedTools: ["list_deep_paths", "get_deep_value", "patch_deep_values", "validate_schematic"],
  };
}

export function nextActionsForGoal(goal: string): string[] {
  const text = goal.toLowerCase();
  if (/(build|create|add|system|design)/.test(text)) {
    return [
      "Call get_project_summary and validate_schematic.",
      "Call get_operation_guide with build-system or the closest goal.",
      "Search list_device_templates for each required device role.",
      "Draft an operation plan with rooms/devices/connections/metadata.",
      "Preview the plan, then apply only after the user approves or asks you to proceed.",
      "Run validate_schematic and generate_report.",
    ];
  }
  if (/(fix|validate|issue|warning|error)/.test(text)) {
    return [
      "Call validate_schematic.",
      "Use listed nodeIds/edgeId to inspect devices and connections.",
      "Explain candidate fixes before applying.",
      "Patch with semantic tools or deep paths.",
      "Validate again.",
    ];
  }
  if (/(rack|elevation)/.test(text)) {
    return [
      "Call list_pages and list_racks.",
      "Inspect devices needing rack placement.",
      "Use add_rack_page/add_rack/add_rack_placement plan steps.",
      "Use deep writes only after inspecting /pages/{index}.",
    ];
  }
  return [
    "Call get_capabilities.",
    "Call get_project_summary.",
    "Use find_entities or resolve_reference for ambiguous user wording.",
    "Choose semantic tools first, deep writes second.",
    "Preview mutations before applying.",
  ];
}
