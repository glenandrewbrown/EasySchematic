import type { Connection, XYPosition } from "@xyflow/react";
import type { ConnectionData, DeviceData, SchematicFile } from "../types";

export interface LiveControlRequest {
  id: string;
  kind: "request";
  method: LiveControlMethod;
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

export type LiveControlClientMessage = LiveControlHello | LiveControlResponse;
export type LiveControlServerMessage = LiveControlRequest;

export type LiveControlMethod =
  | "get_status"
  | "get_project_summary"
  | "get_current_project"
  | "get_selection"
  | "list_devices"
  | "list_connections"
  | "list_rooms"
  | "list_pages"
  | "list_racks"
  | "list_layers"
  | "list_inventory"
  | "validate_schematic"
  | "generate_report"
  | "lint_project"
  | "list_device_templates"
  | "get_device_template"
  | "list_deep_paths"
  | "get_deep_value"
  | "patch_deep_values"
  | "connect_by_device_names"
  | "assign_cable_ids"
  | "place_devices_in_room"
  | "create_rack_layout"
  | "apply_layer_strategy"
  | "fix_validation_issue"
  | "create_system_from_spec"
  | "preview_operation_plan"
  | "apply_operation_plan"
  | "undo"
  | "redo"
  | "save_local"
  | "export_project"
  | "import_project";

export type LiveOperationStep =
  | { type: "add_room"; label: string; position?: XYPosition }
  | { type: "add_device"; templateId?: string; deviceType?: string; model?: string; label?: string; position?: XYPosition; dataPatch?: Partial<DeviceData> }
  | { type: "add_devices"; devices: Array<{ templateId?: string; deviceType?: string; model?: string; label?: string; position?: XYPosition; dataPatch?: Partial<DeviceData> }> }
  | { type: "connect"; connection: Connection }
  | { type: "patch_device"; nodeId: string; patch: Partial<DeviceData> }
  | { type: "patch_edge"; edgeId: string; patch: Partial<ConnectionData> }
  | { type: "add_layer"; name: string }
  | { type: "add_rack_page"; label: string }
  | { type: "add_rack"; pageId: string; rack: Record<string, unknown> }
  | { type: "add_rack_placement"; pageId: string; placement: Record<string, unknown> }
  | { type: "patch_deep_values"; scope?: "project" | "store"; operations: DeepPatchOperation[] }
  | { type: "assign_cable_ids"; prefix?: string; start?: number; edgeIds?: string[] }
  | { type: "place_devices_in_room"; roomId: string; nodeIds: string[] }
  | { type: "new_schematic" }
  | { type: "import_project"; project: SchematicFile };

export interface LiveOperationPlan {
  id?: string;
  title?: string;
  prompt?: string;
  destructive?: boolean;
  steps: LiveOperationStep[];
}

export interface LiveControlStatus {
  enabled: boolean;
  projectName: string;
  nodeCount: number;
  edgeCount: number;
  activePage: string;
  undoSize: number;
  redoSize: number;
}

export interface ConnectByDeviceNamesParams {
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  signalType?: string;
  apply?: boolean;
}

export type DeepPatchOperation =
  | { op: "set"; path: string; value: unknown }
  | { op: "merge"; path: string; value: Record<string, unknown> }
  | { op: "insert"; path: string; value: unknown }
  | { op: "remove"; path: string };
