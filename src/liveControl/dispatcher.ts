import type { XYPosition } from "@xyflow/react";
import { countIssues, validateSchematic } from "../validation";
import { DEVICE_TEMPLATES } from "../deviceLibrary";
import { useSchematicStore } from "../store";
import type { ConnectionEdge, DeviceNode, DeviceTemplate, RoomNode, SchematicFile } from "../types";
import { SIGNAL_LABELS } from "../types";
import type { DeepPatchOperation, LiveControlMethod, LiveControlStatus, LiveOperationPlan, LiveOperationStep } from "./protocol";

type StoreState = ReturnType<typeof useSchematicStore.getState>;

function assertRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function decodePointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new Error(`Path must be a JSON Pointer starting with "/": ${path}`);
  return path.slice(1).split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function childPath(base: string, segment: string | number): string {
  return `${base}/${encodePointerSegment(String(segment))}`;
}

function valueAtPath(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of decodePointer(path)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) throw new Error(`Array index not found at ${path}`);
      current = current[index];
    } else if (isRecord(current)) {
      if (!(segment in current)) throw new Error(`Object key not found at ${path}`);
      current = current[segment];
    } else {
      throw new Error(`Cannot descend into non-object value at ${path}`);
    }
  }
  return current;
}

function parentAndKey(root: unknown, path: string): { parent: unknown; key: string } {
  const segments = decodePointer(path);
  if (segments.length === 0) throw new Error("Operation path cannot be the document root");
  const key = segments[segments.length - 1];
  const parent = valueAtPath(root, `/${segments.slice(0, -1).map(encodePointerSegment).join("/")}`.replace(/\/$/, ""));
  return { parent, key };
}

function applyDeepOperation(root: unknown, operation: DeepPatchOperation): void {
  const { parent, key } = parentAndKey(root, operation.path);
  if (Array.isArray(parent)) {
    const index = key === "-" ? parent.length : Number(key);
    if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`Invalid array index in ${operation.path}`);
    if (operation.op === "insert") parent.splice(index, 0, operation.value);
    else if (operation.op === "remove") {
      if (index >= parent.length) throw new Error(`Array index not found at ${operation.path}`);
      parent.splice(index, 1);
    } else if (operation.op === "set") {
      if (index >= parent.length) throw new Error(`Array index not found at ${operation.path}`);
      parent[index] = operation.value;
    } else if (operation.op === "merge") {
      if (!isRecord(parent[index])) throw new Error(`Cannot merge into non-object at ${operation.path}`);
      parent[index] = { ...parent[index], ...operation.value };
    }
    return;
  }
  if (!isRecord(parent)) throw new Error(`Cannot write into non-object parent at ${operation.path}`);
  if (operation.op === "remove") delete parent[key];
  else if (operation.op === "set" || operation.op === "insert") parent[key] = operation.value;
  else if (operation.op === "merge") {
    const current = parent[key];
    if (!isRecord(current)) throw new Error(`Cannot merge into non-object at ${operation.path}`);
    parent[key] = { ...current, ...operation.value };
  }
}

function serializableStoreSnapshot(state: StoreState): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state) as [string, unknown][]) {
    if (typeof value !== "function") snapshot[key] = value;
  }
  return snapshot;
}

function listDeepPaths(value: unknown, options: { path: string; maxDepth: number; includeValues: boolean; limit: number }) {
  const start = valueAtPath(value, options.path);
  const paths: Array<{ path: string; type: string; value?: unknown; keys?: number }> = [];
  const visit = (current: unknown, path: string, depth: number) => {
    if (paths.length >= options.limit) return;
    const entry: { path: string; type: string; value?: unknown; keys?: number } = {
      path,
      type: Array.isArray(current) ? "array" : current === null ? "null" : typeof current,
    };
    if (Array.isArray(current) || isRecord(current)) entry.keys = Object.keys(current).length;
    if (options.includeValues && (!current || typeof current !== "object")) entry.value = current;
    paths.push(entry);
    if (depth >= options.maxDepth) return;
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, childPath(path, index), depth + 1));
    } else if (isRecord(current)) {
      for (const [key, item] of Object.entries(current)) {
        visit(item, childPath(path, key), depth + 1);
      }
    }
  };
  visit(start, options.path, 0);
  return { root: options.path, count: paths.length, truncated: paths.length >= options.limit, paths };
}

function jsonDiff(before: unknown, after: unknown, path = "", limit = 500) {
  const changes: Array<{ type: "added" | "removed" | "changed"; path: string; before?: unknown; after?: unknown }> = [];
  const visit = (left: unknown, right: unknown, currentPath: string) => {
    if (changes.length >= limit) return;
    if (Object.is(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      const max = Math.max(left.length, right.length);
      for (let i = 0; i < max; i += 1) {
        if (i >= left.length) changes.push({ type: "added", path: childPath(currentPath, i), after: right[i] });
        else if (i >= right.length) changes.push({ type: "removed", path: childPath(currentPath, i), before: left[i] });
        else visit(left[i], right[i], childPath(currentPath, i));
      }
      return;
    }
    if (isRecord(left) && isRecord(right)) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) {
        if (!(key in left)) changes.push({ type: "added", path: childPath(currentPath, key), after: right[key] });
        else if (!(key in right)) changes.push({ type: "removed", path: childPath(currentPath, key), before: left[key] });
        else visit(left[key], right[key], childPath(currentPath, key));
      }
      return;
    }
    changes.push({ type: "changed", path: currentPath, before: left, after: right });
  };
  visit(before, after, path);
  return { changes, truncated: changes.length >= limit };
}

function selectFields<T extends Record<string, unknown>>(item: T, fields: string[] | undefined): Partial<T> {
  if (!fields?.length) return item;
  const result: Partial<T> = {};
  for (const field of fields) {
    if (field in item) result[field as keyof T] = item[field] as T[keyof T];
  }
  return result;
}

function listOptions(params?: unknown) {
  const rec = isRecord(params) ? params : {};
  return {
    limit: typeof rec.limit === "number" ? Math.max(1, Math.min(1000, rec.limit)) : 1000,
    fields: Array.isArray(rec.fields) ? rec.fields.map(String) : undefined,
    includePorts: rec.includePorts !== false,
  };
}

function validateProjectShape(project: SchematicFile) {
  const issues: Array<{ severity: "error" | "warning"; path: string; message: string }> = [];
  const nodeIds = new Set<string>();
  const validSignals = new Set(Object.keys(SIGNAL_LABELS));
  const portKeys = new Set<string>();
  project.nodes.forEach((node, nodeIndex) => {
    if (!node.id) issues.push({ severity: "error", path: `/nodes/${nodeIndex}/id`, message: "Node is missing id." });
    if (nodeIds.has(node.id)) issues.push({ severity: "error", path: `/nodes/${nodeIndex}/id`, message: `Duplicate node id ${node.id}.` });
    nodeIds.add(node.id);
    if (node.type === "device") {
      const data = node.data as DeviceNode["data"];
      if (!data.label) issues.push({ severity: "warning", path: `/nodes/${nodeIndex}/data/label`, message: "Device has no label." });
      const portIds = new Set<string>();
      data.ports.forEach((port, portIndex) => {
        if (portIds.has(port.id)) issues.push({ severity: "error", path: `/nodes/${nodeIndex}/data/ports/${portIndex}/id`, message: `Duplicate port id ${port.id}.` });
        portIds.add(port.id);
        portKeys.add(`${node.id}::${port.id}`);
        if (!validSignals.has(port.signalType)) issues.push({ severity: "error", path: `/nodes/${nodeIndex}/data/ports/${portIndex}/signalType`, message: `Invalid signal type ${port.signalType}.` });
      });
    }
  });
  project.edges.forEach((edge, edgeIndex) => {
    if (!edge.id) issues.push({ severity: "error", path: `/edges/${edgeIndex}/id`, message: "Edge is missing id." });
    if (!nodeIds.has(edge.source)) issues.push({ severity: "error", path: `/edges/${edgeIndex}/source`, message: `Edge source ${edge.source} does not exist.` });
    if (!nodeIds.has(edge.target)) issues.push({ severity: "error", path: `/edges/${edgeIndex}/target`, message: `Edge target ${edge.target} does not exist.` });
    if (edge.sourceHandle && !portKeys.has(`${edge.source}::${edge.sourceHandle.replace(/-(in|out|source|target)$/i, "")}`)) {
      issues.push({ severity: "error", path: `/edges/${edgeIndex}/sourceHandle`, message: `Source handle ${edge.sourceHandle} does not match a source port.` });
    }
    if (edge.targetHandle && !portKeys.has(`${edge.target}::${edge.targetHandle.replace(/-(in|out|source|target)$/i, "")}`)) {
      issues.push({ severity: "error", path: `/edges/${edgeIndex}/targetHandle`, message: `Target handle ${edge.targetHandle} does not match a target port.` });
    }
    if (edge.data?.signalType && !validSignals.has(edge.data.signalType)) {
      issues.push({ severity: "error", path: `/edges/${edgeIndex}/data/signalType`, message: `Invalid edge signal type ${edge.data.signalType}.` });
    }
  });
  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    counts: {
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      total: issues.length,
    },
    issues,
  };
}

function positionFrom(value: unknown, fallback: XYPosition): XYPosition {
  if (!value || typeof value !== "object") return fallback;
  const rec = value as Record<string, unknown>;
  return {
    x: typeof rec.x === "number" ? rec.x : fallback.x,
    y: typeof rec.y === "number" ? rec.y : fallback.y,
  };
}

function allTemplates(state: StoreState): DeviceTemplate[] {
  return [...DEVICE_TEMPLATES, ...state.customTemplates];
}

function deepRoot(scope: "project" | "store", state: StoreState): Record<string, unknown> | SchematicFile {
  return scope === "project" ? state.exportToJSON() : serializableStoreSnapshot(state);
}

function templateMatches(template: DeviceTemplate, query: { templateId?: string; deviceType?: string; model?: string; label?: string }): boolean {
  const text = [template.deviceType, template.manufacturer, template.modelNumber, template.label, template.shortName, template.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return Boolean(
    (query.templateId && template.id === query.templateId) ||
    (query.deviceType && template.deviceType === query.deviceType) ||
    (query.model && [template.modelNumber, template.label, template.shortName].filter(Boolean).some((value) => value!.toLowerCase() === query.model!.toLowerCase())) ||
    (query.label && text.includes(query.label.toLowerCase())),
  );
}

function resolveTemplate(state: StoreState, query: { templateId?: string; deviceType?: string; model?: string; label?: string }): DeviceTemplate {
  const template = allTemplates(state).find((candidate) => templateMatches(candidate, query));
  if (!template) {
    throw new Error(`No device template matched ${JSON.stringify(query)}`);
  }
  return template;
}

function deviceNodes(state: StoreState): DeviceNode[] {
  return state.nodes.filter((node): node is DeviceNode => node.type === "device");
}

function roomNodes(state: StoreState): RoomNode[] {
  return state.nodes.filter((node): node is RoomNode => node.type === "room");
}

function summarizeDevice(node: DeviceNode) {
  return {
    id: node.id,
    label: node.data.label,
    manufacturer: node.data.manufacturer,
    model: node.data.model,
    deviceType: node.data.deviceType,
    parentId: node.parentId,
    position: node.position,
    portCount: node.data.ports.length,
    ports: node.data.ports.map((port) => ({
      id: port.id,
      label: port.label,
      direction: port.direction,
      signalType: port.signalType,
      connectorType: port.connectorType,
    })),
  };
}

function summarizeConnection(edge: ConnectionEdge) {
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    signalType: edge.data?.signalType,
    label: edge.data?.label,
    cableId: edge.data?.cableId,
    cableLength: edge.data?.cableLength,
  };
}

function status(state: StoreState): LiveControlStatus {
  return {
    enabled: true,
    projectName: state.schematicName,
    nodeCount: state.nodes.length,
    edgeCount: state.edges.length,
    activePage: state.activePage,
    undoSize: state.undoSize,
    redoSize: state.redoSize,
  };
}

function projectSummary(state: StoreState) {
  const issues = validateSchematic(state.nodes, state.edges);
  const rooms = roomNodes(state);
  const devices = deviceNodes(state);
  return {
    ...status(state),
    deviceCount: devices.length,
    roomCount: rooms.length,
    pageCount: state.pages.length,
    rackCount: state.pages.reduce((count, page) => count + (page.type === "rack-elevation" ? page.racks.length : 0), 0),
    validation: countIssues(issues),
  };
}

function selected(state: StoreState) {
  return {
    activePage: state.activePage,
    nodes: state.nodes.filter((node) => node.selected).map((node) => ({ id: node.id, type: node.type })),
    edges: state.edges.filter((edge) => edge.selected).map((edge) => ({ id: edge.id })),
  };
}

function generateReport(state: StoreState) {
  const issues = validateSchematic(state.nodes, state.edges);
  const devices = deviceNodes(state);
  return {
    summary: projectSummary(state),
    validation: { counts: countIssues(issues), issues },
    inventory: {
      ownedGear: state.ownedGear,
      ownedCables: state.ownedCables,
      ownedInventory: state.ownedInventory,
      gearUnits: state.gearUnits,
      placedDevices: devices.map((node) => ({
        id: node.id,
        label: node.data.label,
        manufacturer: node.data.manufacturer,
        model: node.data.model,
        deviceType: node.data.deviceType,
      })),
    },
  };
}

function lintProject(state: StoreState) {
  const validationIssues = validateSchematic(state.nodes, state.edges);
  const issues: Array<{ severity: "error" | "warning" | "info"; kind: string; message: string; nodeIds?: string[]; edgeId?: string; path?: string }> =
    validationIssues.map((issue) => ({ ...issue, severity: issue.severity, kind: issue.kind }));
  const labelOwners = new Map<string, string[]>();
  for (const node of deviceNodes(state)) {
    const label = node.data.label?.trim();
    if (!label) issues.push({ severity: "warning", kind: "missing-device-label", message: `Device ${node.id} has no label.`, nodeIds: [node.id] });
    else labelOwners.set(label.toLowerCase(), [...(labelOwners.get(label.toLowerCase()) ?? []), node.id]);
    if (!node.parentId) issues.push({ severity: "info", kind: "device-not-in-room", message: `${label || node.id} is not assigned to a room.`, nodeIds: [node.id] });
  }
  for (const [label, ids] of labelOwners) {
    if (ids.length > 1) issues.push({ severity: "warning", kind: "duplicate-device-label", message: `Duplicate device label "${label}" appears ${ids.length} times.`, nodeIds: ids });
  }
  for (const edge of state.edges) {
    if (!edge.data?.cableId) issues.push({ severity: "info", kind: "missing-cable-id", message: `Connection ${edge.id} has no cable ID.`, edgeId: edge.id });
    if (!edge.data?.cableLength) issues.push({ severity: "info", kind: "missing-cable-length", message: `Connection ${edge.id} has no cable length.`, edgeId: edge.id });
  }
  const usedLayerIds = new Set<string>();
  for (const node of state.nodes) {
    const layerId = isRecord(node.data) && typeof node.data.layerId === "string" ? node.data.layerId : undefined;
    if (layerId) usedLayerIds.add(layerId);
  }
  for (const edge of state.edges) {
    if (edge.data?.layerId) usedLayerIds.add(edge.data.layerId);
  }
  for (const layer of state.layers) {
    if (layer.id !== "base" && !usedLayerIds.has(layer.id)) {
      issues.push({ severity: "info", kind: "unused-layer", message: `Layer "${layer.name}" is not used by any node or edge.`, path: `/layers/${state.layers.indexOf(layer)}` });
    }
  }
  return {
    counts: {
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length,
      total: issues.length,
    },
    issues,
  };
}

function listDeviceTemplates(state: StoreState, params?: unknown) {
  const rec = isRecord(params) ? params : {};
  const query = typeof rec.query === "string" ? rec.query.toLowerCase() : "";
  const limit = typeof rec.limit === "number" ? Math.max(1, Math.min(500, rec.limit)) : 200;
  return allTemplates(state)
    .filter((template) => !query || [template.id, template.deviceType, template.label, template.shortName, template.manufacturer, template.modelNumber, ...(template.searchTerms ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query))
    .slice(0, limit)
    .map((template) => ({
      id: template.id,
      label: template.label,
      shortName: template.shortName,
      deviceType: template.deviceType,
      category: template.category,
      manufacturer: template.manufacturer,
      modelNumber: template.modelNumber,
      portCount: template.ports.length,
      ports: template.ports.map((port) => ({
        id: port.id,
        label: port.label,
        direction: port.direction,
        signalType: port.signalType,
        connectorType: port.connectorType,
      })),
    }));
}

function getDeviceTemplate(state: StoreState, params?: unknown) {
  const rec = assertRecord(params, "params");
  return resolveTemplate(state, {
    templateId: typeof rec.templateId === "string" ? rec.templateId : undefined,
    deviceType: typeof rec.deviceType === "string" ? rec.deviceType : undefined,
    model: typeof rec.model === "string" ? rec.model : undefined,
    label: typeof rec.label === "string" ? rec.label : undefined,
  });
}

function patchDeepValues(params?: unknown) {
  const rec = assertRecord(params, "params");
  const scope = rec.scope === "store" ? "store" : "project";
  const operations = rec.operations;
  if (!Array.isArray(operations)) throw new Error("operations must be an array");
  const beforeState = useSchematicStore.getState();
  const before = projectSummary(beforeState);
  const root = cloneJson(deepRoot(scope, beforeState));
  const beforeRoot = cloneJson(root);
  for (const operation of operations) {
    applyDeepOperation(root, operation as DeepPatchOperation);
  }
  if (scope === "project") {
    const integrity = validateProjectShape(root as SchematicFile);
    if (!integrity.valid) return { applied: false, scope, operationCount: operations.length, integrity, diff: jsonDiff(beforeRoot, root) };
    beforeState.importFromJSON(root as SchematicFile);
  } else {
    beforeState.pushSnapshot();
    const patch: Record<string, unknown> = {};
    const next = root as Record<string, unknown>;
    const current = serializableStoreSnapshot(beforeState);
    for (const [key, value] of Object.entries(next)) {
      if (current[key] !== value) patch[key] = value;
    }
    useSchematicStore.setState(patch as Partial<StoreState>);
    useSchematicStore.getState().saveToLocalStorage();
  }
  const afterState = useSchematicStore.getState();
  return {
    applied: true,
    scope,
    operationCount: operations.length,
    diff: jsonDiff(beforeRoot, root),
    before,
    after: projectSummary(afterState),
  };
}

function resolveDeviceByText(state: StoreState, text: string): DeviceNode {
  const query = text.toLowerCase();
  const matches = deviceNodes(state).filter((node) =>
    [node.id, node.data.label, node.data.shortName, node.data.model, node.data.modelNumber, node.data.deviceType, node.data.manufacturer]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  if (matches.length === 0) throw new Error(`No device matched "${text}"`);
  if (matches.length > 1) throw new Error(`Multiple devices matched "${text}": ${matches.map((node) => node.id).join(", ")}`);
  return matches[0];
}

function resolvePortId(device: DeviceNode, query: string | undefined, direction: "source" | "target", signalType?: string): string {
  const ports = device.data.ports.filter((port) => {
    const directionOk = direction === "source"
      ? port.direction === "output" || port.direction === "bidirectional" || port.direction === "passthrough"
      : port.direction === "input" || port.direction === "bidirectional" || port.direction === "passthrough";
    return directionOk && (!signalType || port.signalType === signalType);
  });
  if (ports.length === 0) throw new Error(`No ${direction} port found on ${device.data.label}`);
  if (!query) return ports[0].id;
  const lower = query.toLowerCase();
  const matches = ports.filter((port) => [port.id, port.label, port.signalType, port.connectorType].filter(Boolean).join(" ").toLowerCase().includes(lower));
  if (matches.length === 0) throw new Error(`No ${direction} port on ${device.data.label} matched "${query}"`);
  return matches[0].id;
}

function connectByDeviceNames(params?: unknown) {
  const rec = assertRecord(params, "params");
  const state = useSchematicStore.getState();
  const source = resolveDeviceByText(state, String(rec.source ?? ""));
  const target = resolveDeviceByText(state, String(rec.target ?? ""));
  const signalType = typeof rec.signalType === "string" ? rec.signalType : undefined;
  const connection = {
    source: source.id,
    target: target.id,
    sourceHandle: resolvePortId(source, typeof rec.sourcePort === "string" ? rec.sourcePort : undefined, "source", signalType),
    targetHandle: resolvePortId(target, typeof rec.targetPort === "string" ? rec.targetPort : undefined, "target", signalType),
  };
  const plan = { id: `connect-${Date.now()}`, title: `Connect ${source.data.label} to ${target.data.label}`, steps: [{ type: "connect", connection }] };
  return rec.apply === true ? applyPlan(plan as LiveOperationPlan) : { plan, preview: previewPlan(plan as LiveOperationPlan) };
}

function assignCableIds(params?: unknown) {
  const rec = isRecord(params) ? params : {};
  const prefix = typeof rec.prefix === "string" ? rec.prefix : "C";
  const start = typeof rec.start === "number" ? rec.start : 1;
  const state = useSchematicStore.getState();
  const edgeIds = Array.isArray(rec.edgeIds) ? rec.edgeIds.map(String) : state.edges.map((edge) => edge.id);
  const operations = edgeIds.map((edgeId, index) => {
    const edgeIndex = state.edges.findIndex((edge) => edge.id === edgeId);
    if (edgeIndex < 0) throw new Error(`No edge ${edgeId}`);
    return { op: "merge" as const, path: `/edges/${edgeIndex}/data`, value: { cableId: `${prefix}-${String(start + index).padStart(3, "0")}` } };
  });
  return rec.apply === true ? patchDeepValues({ scope: "project", operations }) : { plan: { steps: [{ type: "patch_deep_values", scope: "project", operations }] }, operations };
}

function placeDevicesInRoom(params?: unknown) {
  const rec = assertRecord(params, "params");
  const state = useSchematicStore.getState();
  const roomId = typeof rec.roomId === "string" ? rec.roomId : roomNodes(state).find((room) => room.data.label.toLowerCase().includes(String(rec.room ?? "").toLowerCase()))?.id;
  if (!roomId) throw new Error("roomId or matching room is required");
  const nodeIds = Array.isArray(rec.nodeIds) ? rec.nodeIds.map(String) : [];
  const names = Array.isArray(rec.devices) ? rec.devices.map(String) : [];
  for (const name of names) nodeIds.push(resolveDeviceByText(state, name).id);
  const operations = nodeIds.map((nodeId) => {
    const index = state.nodes.findIndex((node) => node.id === nodeId);
    if (index < 0) throw new Error(`No node ${nodeId}`);
    return { op: "set" as const, path: `/nodes/${index}/parentId`, value: roomId };
  });
  return rec.apply === true ? patchDeepValues({ scope: "project", operations }) : { plan: { steps: [{ type: "patch_deep_values", scope: "project", operations }] }, operations };
}

function applyLayerStrategy(params?: unknown) {
  const rec = isRecord(params) ? params : {};
  const state = useSchematicStore.getState();
  const signalToLayer = isRecord(rec.signalToLayer) ? rec.signalToLayer : {};
  const operations: DeepPatchOperation[] = [];
  for (const [signal, layerId] of Object.entries(signalToLayer)) {
    state.edges.forEach((edge, index) => {
      if (edge.data?.signalType === signal) operations.push({ op: "merge", path: `/edges/${index}/data`, value: { layerId } });
    });
  }
  return rec.apply === true ? patchDeepValues({ scope: "project", operations }) : { plan: { steps: [{ type: "patch_deep_values", scope: "project", operations }] }, operations };
}

function fixValidationIssue(params?: unknown) {
  const rec = assertRecord(params, "params");
  const issueId = String(rec.issueId ?? "");
  const state = useSchematicStore.getState();
  const issue = validateSchematic(state.nodes, state.edges).find((candidate) => candidate.id === issueId);
  if (!issue) throw new Error(`No validation issue ${issueId}`);
  if (issue.kind === "missing-power") {
    return { issue, message: "Add a power source/distribution device and connect it to the listed node's power inlet. Automatic power-source selection is not yet deterministic." };
  }
  if (issue.kind === "port-incompatible") {
    return { issue, message: "Use an adapter template or intentionally set allowIncompatible on the edge after user approval.", suggestedPlan: issue.edgeId ? { steps: [{ type: "patch_edge", edgeId: issue.edgeId, patch: { allowIncompatible: true } }] } : undefined };
  }
  return { issue, message: "No deterministic automatic fix is available; inspect the referenced entities and patch explicitly." };
}

function createRackLayout(params?: unknown) {
  const rec = isRecord(params) ? params : {};
  const state = useSchematicStore.getState();
  const pageId = typeof rec.pageId === "string" ? rec.pageId : state.pages.find((page) => page.type === "rack-elevation")?.id;
  const plan: LiveOperationPlan = { id: `rack-layout-${Date.now()}`, title: "Create rack layout", steps: [] };
  let targetPageId = pageId;
  if (!targetPageId) {
    plan.steps.push({ type: "add_rack_page", label: typeof rec.pageLabel === "string" ? rec.pageLabel : "Rack Page 1" });
    targetPageId = "__created_page__";
  }
  if (targetPageId !== "__created_page__" && state.pages.some((page) => page.id === targetPageId && page.type === "rack-elevation")) {
    const rackPage = state.pages.find((page) => page.id === targetPageId && page.type === "rack-elevation");
    const rackId = rackPage && "racks" in rackPage ? rackPage.racks[0]?.id : undefined;
    if (rackId) {
      const rackable = deviceNodes(state).filter((node) => node.data.heightMm || node.data.rackForm);
      rackable.slice(0, typeof rec.limit === "number" ? rec.limit : 20).forEach((node, index) => {
        plan.steps.push({ type: "add_rack_placement", pageId: targetPageId, placement: { rackId, deviceNodeId: node.id, uPosition: index + 1, heightU: 1, face: "front" } });
      });
    }
  }
  return rec.apply === true ? applyPlan(plan) : { plan, preview: previewPlan(plan) };
}

function createSystemFromSpec(params?: unknown) {
  const rec = assertRecord(params, "params");
  const devices = Array.isArray(rec.devices) ? rec.devices as Record<string, unknown>[] : [];
  const rooms = Array.isArray(rec.rooms) ? rec.rooms as Record<string, unknown>[] : [];
  const plan: LiveOperationPlan = { id: `system-${Date.now()}`, title: typeof rec.title === "string" ? rec.title : "Generated system plan", prompt: typeof rec.prompt === "string" ? rec.prompt : undefined, steps: [] };
  rooms.forEach((room, index) => plan.steps.push({ type: "add_room", label: String(room.label ?? room.name ?? `Room ${index + 1}`), position: positionFrom(room.position, { x: 80 + index * 320, y: 80 }) }));
  devices.forEach((device, index) => plan.steps.push({
    type: "add_device",
    templateId: typeof device.templateId === "string" ? device.templateId : undefined,
    label: typeof device.label === "string" ? device.label : typeof device.role === "string" ? device.role : undefined,
    deviceType: typeof device.deviceType === "string" ? device.deviceType : undefined,
    model: typeof device.model === "string" ? device.model : undefined,
    position: positionFrom(device.position, { x: 240 + index * 220, y: 260 }),
  }));
  return rec.apply === true ? applyPlan(plan) : { plan, preview: previewPlan(plan) };
}

function previewPlan(plan: LiveOperationPlan) {
  const state = useSchematicStore.getState();
  const beforeProject = state.exportToJSON();
  const simulatedProject = cloneJson(beforeProject);
  const missing: string[] = [];
  const touched = new Set<string>();
  const predicted: Array<Record<string, unknown>> = [];
  for (const step of plan.steps) {
    switch (step.type) {
      case "add_device":
        resolveTemplate(state, step);
        predicted.push({ type: step.type, action: "add one device", label: step.label, templateId: step.templateId, deviceType: step.deviceType, model: step.model });
        break;
      case "add_devices":
        for (const device of step.devices) resolveTemplate(state, device);
        predicted.push({ type: step.type, action: "add devices", count: step.devices.length });
        break;
      case "patch_device":
        if (!state.nodes.some((node) => node.id === step.nodeId && node.type === "device")) missing.push(step.nodeId);
        touched.add(step.nodeId);
        break;
      case "patch_edge":
        if (!state.edges.some((edge) => edge.id === step.edgeId)) missing.push(step.edgeId);
        touched.add(step.edgeId);
        break;
      case "connect":
        if (!state.nodes.some((node) => node.id === step.connection.source)) missing.push(String(step.connection.source));
        if (!state.nodes.some((node) => node.id === step.connection.target)) missing.push(String(step.connection.target));
        touched.add(String(step.connection.source));
        touched.add(String(step.connection.target));
        predicted.push({ type: step.type, action: "add connection", connection: step.connection });
        break;
      case "add_rack":
      case "add_rack_placement":
        if (!state.pages.some((page) => page.id === step.pageId)) missing.push(step.pageId);
        touched.add(step.pageId);
        break;
      case "patch_deep_values":
        for (const operation of step.operations) {
          const root = deepRoot(step.scope ?? "project", state);
          parentAndKey(root, operation.path);
          if (operation.op === "remove" || operation.op === "merge") valueAtPath(root, operation.path);
          if ((step.scope ?? "project") === "project") applyDeepOperation(simulatedProject, operation);
          touched.add(`${step.scope ?? "project"}:${operation.path}`);
        }
        break;
      case "assign_cable_ids": {
        const result = assignCableIds({ prefix: step.prefix, start: step.start, edgeIds: step.edgeIds }) as { operations?: DeepPatchOperation[] };
        for (const operation of result.operations ?? []) applyDeepOperation(simulatedProject, operation);
        predicted.push({ type: step.type, action: "assign cable IDs", count: result.operations?.length ?? 0 });
        break;
      }
      case "place_devices_in_room": {
        const result = placeDevicesInRoom({ roomId: step.roomId, nodeIds: step.nodeIds }) as { operations?: DeepPatchOperation[] };
        for (const operation of result.operations ?? []) applyDeepOperation(simulatedProject, operation);
        predicted.push({ type: step.type, action: "place devices in room", count: step.nodeIds.length, roomId: step.roomId });
        break;
      }
      case "add_room":
      case "add_layer":
      case "add_rack_page":
      case "new_schematic":
      case "import_project":
        break;
      default:
        step satisfies never;
    }
  }
  return {
    valid: missing.length === 0,
    missingReferences: [...new Set(missing)],
    stepCount: plan.steps.length,
    destructive: Boolean(plan.destructive || plan.steps.some((step) => step.type === "new_schematic" || step.type === "import_project")),
    touchedEntityIds: [...touched],
    predicted,
    diff: jsonDiff(beforeProject, simulatedProject),
    integrity: validateProjectShape(simulatedProject),
    expectedCounts: {
      nodes: state.nodes.length + plan.steps.reduce((count, step) => count + (step.type === "add_room" || step.type === "add_device" ? 1 : step.type === "add_devices" ? step.devices.length : 0), 0),
      edges: state.edges.length + plan.steps.filter((step) => step.type === "connect").length,
    },
  };
}

function applyStep(step: LiveOperationStep, index: number): Record<string, unknown> {
  const state = useSchematicStore.getState();
  switch (step.type) {
    case "add_room": {
      const before = new Set(state.nodes.map((node) => node.id));
      state.addRoom(step.label, positionFrom(step.position, { x: 160 + index * 40, y: 160 + index * 40 }));
      const created = useSchematicStore.getState().nodes.find((node) => !before.has(node.id));
      return { type: step.type, nodeId: created?.id };
    }
    case "add_device": {
      const template = resolveTemplate(state, step);
      const before = new Set(state.nodes.map((node) => node.id));
      state.addDevice(template, positionFrom(step.position, { x: 240 + index * 40, y: 240 + index * 40 }));
      const created = useSchematicStore.getState().nodes.find((node) => !before.has(node.id) && node.type === "device") as DeviceNode | undefined;
      if (created && (step.label || step.dataPatch)) {
        useSchematicStore.getState().patchDeviceData(created.id, { ...step.dataPatch, ...(step.label ? { label: step.label } : {}) });
      }
      return { type: step.type, nodeId: created?.id };
    }
    case "add_devices": {
      const before = new Set(state.nodes.map((node) => node.id));
      const items = step.devices.map((device, offset) => ({
        template: resolveTemplate(state, device),
        position: positionFrom(device.position, { x: 240 + (index + offset) * 40, y: 240 + (index + offset) * 40 }),
      }));
      state.addDevices(items);
      const created = useSchematicStore.getState().nodes.filter((node) => !before.has(node.id) && node.type === "device") as DeviceNode[];
      for (let i = 0; i < created.length; i += 1) {
        const patch = step.devices[i];
        if (patch && (patch.label || patch.dataPatch)) {
          useSchematicStore.getState().patchDeviceData(created[i].id, { ...patch.dataPatch, ...(patch.label ? { label: patch.label } : {}) });
        }
      }
      return { type: step.type, nodeIds: created.map((node) => node.id) };
    }
    case "connect": {
      const before = new Set(state.edges.map((edge) => edge.id));
      state.onConnect(step.connection);
      const created = useSchematicStore.getState().edges.find((edge) => !before.has(edge.id));
      return { type: step.type, edgeId: created?.id };
    }
    case "patch_device":
      state.patchDeviceData(step.nodeId, step.patch);
      return { type: step.type, nodeId: step.nodeId };
    case "patch_edge":
      state.patchEdgeData(step.edgeId, step.patch);
      return { type: step.type, edgeId: step.edgeId };
    case "add_layer":
      state.addLayer(step.name);
      return { type: step.type, name: step.name };
    case "add_rack_page": {
      const pageId = state.addRackPage(step.label);
      return { type: step.type, pageId };
    }
    case "add_rack": {
      const rackId = state.addRack(step.pageId, step.rack as never);
      return { type: step.type, rackId };
    }
    case "add_rack_placement": {
      const placementId = state.addRackPlacement(step.pageId, step.placement as never);
      return { type: step.type, placementId };
    }
    case "patch_deep_values":
      return { type: step.type, result: patchDeepValues({ scope: step.scope, operations: step.operations }) };
    case "assign_cable_ids":
      return { type: step.type, result: assignCableIds({ prefix: step.prefix, start: step.start, edgeIds: step.edgeIds, apply: true }) };
    case "place_devices_in_room":
      return { type: step.type, result: placeDevicesInRoom({ roomId: step.roomId, nodeIds: step.nodeIds, apply: true }) };
    case "new_schematic":
      state.newSchematic();
      return { type: step.type };
    case "import_project":
      state.importFromJSON(step.project);
      return { type: step.type, projectName: step.project.name };
    default:
      step satisfies never;
      return { type: "unknown" };
  }
}

function applyPlan(plan: LiveOperationPlan) {
  const preview = previewPlan(plan);
  if (!preview.valid) return { applied: false, preview };
  const before = projectSummary(useSchematicStore.getState());
  const beforeProject = useSchematicStore.getState().exportToJSON();
  const state = useSchematicStore.getState();
  state.beginLiveControlBatch();
  try {
    const results = plan.steps.map((step, index) => applyStep(step, index));
    state.commitLiveControlBatch();
    const afterState = useSchematicStore.getState();
    const after = projectSummary(afterState);
    return { applied: true, planId: plan.id, before, after, results, diff: jsonDiff(beforeProject, afterState.exportToJSON()) };
  } catch (error) {
    state.cancelLiveControlBatch();
    throw error;
  }
}

export async function dispatchLiveControl(method: LiveControlMethod, params?: unknown): Promise<unknown> {
  const state = useSchematicStore.getState();
  switch (method) {
    case "get_status":
      return status(state);
    case "get_project_summary":
      return projectSummary(state);
    case "get_current_project":
    case "export_project":
      return state.exportToJSON();
    case "get_selection":
      return selected(state);
    case "list_devices":
      {
        const options = listOptions(params);
        return deviceNodes(state).slice(0, options.limit).map((node) => {
          const summary = summarizeDevice(node);
          const shaped = options.includePorts ? summary : { ...summary, ports: undefined };
          return selectFields(shaped as unknown as Record<string, unknown>, options.fields);
        });
      }
    case "list_connections":
      {
        const options = listOptions(params);
        return state.edges.slice(0, options.limit).map((edge) => selectFields(summarizeConnection(edge) as unknown as Record<string, unknown>, options.fields));
      }
    case "list_rooms":
      return roomNodes(state).map((room) => ({ id: room.id, label: room.data.label, position: room.position, width: room.width, height: room.height }));
    case "list_pages":
      return { activePage: state.activePage, pages: state.pages };
    case "list_racks":
      return state.pages.flatMap((page) => page.type === "rack-elevation" ? page.racks.map((rack) => ({ ...rack, pageId: page.id, pageLabel: page.label })) : []);
    case "list_layers":
      return state.layers;
    case "list_inventory":
      return { ownedGear: state.ownedGear, ownedCables: state.ownedCables, ownedInventory: state.ownedInventory, gearUnits: state.gearUnits };
    case "validate_schematic": {
      const issues = validateSchematic(state.nodes, state.edges);
      return { counts: countIssues(issues), issues };
    }
    case "generate_report":
      return generateReport(state);
    case "lint_project":
      return lintProject(state);
    case "list_device_templates":
      return listDeviceTemplates(state, params);
    case "get_device_template":
      return getDeviceTemplate(state, params);
    case "list_deep_paths": {
      const rec = isRecord(params) ? params : {};
      const scope = rec.scope === "store" ? "store" : "project";
      const path = typeof rec.path === "string" ? rec.path : "";
      const maxDepth = typeof rec.maxDepth === "number" ? Math.max(0, Math.min(12, rec.maxDepth)) : 4;
      const limit = typeof rec.limit === "number" ? Math.max(1, Math.min(10_000, rec.limit)) : 1000;
      return listDeepPaths(deepRoot(scope, state), {
        path,
        maxDepth,
        limit,
        includeValues: rec.includeValues === true,
      });
    }
    case "get_deep_value": {
      const rec = isRecord(params) ? params : {};
      const scope = rec.scope === "store" ? "store" : "project";
      const path = typeof rec.path === "string" ? rec.path : "";
      return {
        scope,
        path,
        value: valueAtPath(deepRoot(scope, state), path),
      };
    }
    case "patch_deep_values":
      return patchDeepValues(params);
    case "connect_by_device_names":
      return connectByDeviceNames(params);
    case "assign_cable_ids":
      return assignCableIds(params);
    case "place_devices_in_room":
      return placeDevicesInRoom(params);
    case "create_rack_layout":
      return createRackLayout(params);
    case "apply_layer_strategy":
      return applyLayerStrategy(params);
    case "fix_validation_issue":
      return fixValidationIssue(params);
    case "create_system_from_spec":
      return createSystemFromSpec(params);
    case "preview_operation_plan": {
      const rec = assertRecord(params, "params");
      return previewPlan((rec.plan ?? rec) as LiveOperationPlan);
    }
    case "apply_operation_plan": {
      const rec = assertRecord(params, "params");
      return applyPlan((rec.plan ?? rec) as LiveOperationPlan);
    }
    case "undo":
      state.undo();
      return status(useSchematicStore.getState());
    case "redo":
      state.redo();
      return status(useSchematicStore.getState());
    case "save_local":
      state.saveToLocalStorage();
      return { saved: true, status: status(useSchematicStore.getState()) };
    case "import_project": {
      const rec = assertRecord(params, "params");
      state.importFromJSON(rec.project as SchematicFile);
      return projectSummary(useSchematicStore.getState());
    }
    default:
      method satisfies never;
      throw new Error(`Unknown live-control method: ${String(method)}`);
  }
}
