import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchLiveControl } from "../liveControl/dispatcher";
import { useSchematicStore } from "../store";

describe("live control dispatcher", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    useSchematicStore.getState().newSchematic();
  });

  it("returns status from the real schematic store", async () => {
    const status = await dispatchLiveControl("get_status");

    expect(status).toMatchObject({
      enabled: true,
      projectName: "Untitled Schematic",
      nodeCount: 0,
      edgeCount: 0,
      activePage: "schematic",
    });
  });

  it("previews and applies an add-room operation plan", async () => {
    const plan = {
      id: "test-plan",
      steps: [
        { type: "add_room" as const, label: "Stage", position: { x: 100, y: 120 } },
      ],
    };

    const preview = await dispatchLiveControl("preview_operation_plan", { plan });
    expect(preview).toMatchObject({
      valid: true,
      stepCount: 1,
      expectedCounts: { nodes: 1, edges: 0 },
    });

    const applied = await dispatchLiveControl("apply_operation_plan", { plan });
    expect(applied).toMatchObject({ applied: true, planId: "test-plan" });
    expect(useSchematicStore.getState().nodes).toHaveLength(1);
    expect(useSchematicStore.getState().nodes[0]).toMatchObject({
      type: "room",
      data: { label: "Stage" },
      position: { x: 100, y: 120 },
    });
  });

  it("reads and writes arbitrary project values by JSON Pointer", async () => {
    useSchematicStore.getState().addRoom("Stage", { x: 100, y: 120 });

    const before = await dispatchLiveControl("get_deep_value", {
      scope: "project",
      path: "/nodes/0/data/label",
    });
    expect(before).toMatchObject({ value: "Stage" });

    const patched = await dispatchLiveControl("patch_deep_values", {
      scope: "project",
      operations: [{ op: "set", path: "/nodes/0/data/label", value: "Main Stage" }],
    });
    expect(patched).toMatchObject({ applied: true, scope: "project", operationCount: 1 });
    expect(useSchematicStore.getState().nodes[0].data).toMatchObject({ label: "Main Stage" });
  });

  it("lists deep paths and exposes device templates for full-system planning", async () => {
    const paths = await dispatchLiveControl("list_deep_paths", {
      scope: "project",
      maxDepth: 2,
      includeValues: true,
    });
    expect(paths).toMatchObject({ root: "", truncated: false });

    const templates = await dispatchLiveControl("list_device_templates", { query: "switch", limit: 5 });
    expect(Array.isArray(templates)).toBe(true);
    expect(templates).not.toHaveLength(0);
  });
});
