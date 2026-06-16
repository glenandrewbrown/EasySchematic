import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { DeviceNode as DeviceNodeType } from "../types";
import { useSchematicStore } from "../store";
import DeviceNode from "./DeviceNode";
import DevicePlanNode from "./DevicePlanNode";

/**
 * Thin dispatcher registered as the `device` node type. Reads the session canvas view
 * mode and renders the schematic DeviceNode or the to-scale DevicePlanNode. This keeps the
 * 712-line DeviceNode (and its load-bearing 20px port-grid invariant) free of view-mode
 * branching — mirroring RackRenderer's front/rear/side view split.
 */
function DeviceNodeDispatch(props: NodeProps<DeviceNodeType>) {
  const canvasViewMode = useSchematicStore((s) => s.canvasViewMode);
  return canvasViewMode === "plan" ? <DevicePlanNode {...props} /> : <DeviceNode {...props} />;
}

export default memo(DeviceNodeDispatch);
