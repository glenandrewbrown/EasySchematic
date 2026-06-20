export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface LiveControlRequest {
  id: string;
  kind: "request";
  method: string;
  params?: unknown;
}

export interface LiveControlResponse {
  id: string;
  kind: "response";
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface LiveControlHello {
  kind: "hello";
  role: "app";
  token: string;
  appVersion: string;
  projectName: string;
}

export type LiveControlMessage = LiveControlHello | LiveControlResponse;

export interface AppTab {
  id: string;
  appVersion: string;
  projectName: string;
  connectedAt: string;
  lastSeenAt: string;
}

export interface OperationPlan {
  id?: string;
  title?: string;
  prompt?: string;
  destructive?: boolean;
  steps: unknown[];
}

export const READ_TOOL_NAMES = [
  "get_status",
  "get_project_summary",
  "get_current_project",
  "list_devices",
  "list_connections",
  "list_rooms",
  "list_pages",
  "list_racks",
  "list_layers",
  "list_inventory",
  "validate_schematic",
  "lint_project",
  "generate_report",
  "list_device_templates",
  "get_device_template",
  "list_deep_paths",
  "get_deep_value",
] as const;

export const APPLY_TOOL_NAMES = [
  "patch_deep_values",
  "connect_by_device_names",
  "assign_cable_ids",
  "place_devices_in_room",
  "create_rack_layout",
  "apply_layer_strategy",
  "fix_validation_issue",
  "create_system_from_spec",
  "preview_operation_plan",
  "apply_operation_plan",
  "undo",
  "redo",
  "save_local",
  "export_project",
  "import_project",
] as const;

export type ReadToolName = typeof READ_TOOL_NAMES[number];
export type ApplyToolName = typeof APPLY_TOOL_NAMES[number];
