import type { NodeTypes, EdgeTypes } from "@xyflow/react";
import DeviceNodeDispatch from "./components/DeviceNodeDispatch";
import RoomNodeComponent from "./components/RoomNode";
import NoteNodeComponent from "./components/NoteNode";
import AnnotationNodeComponent from "./components/AnnotationNode";
import StubLabelNodeComponent from "./components/StubLabelNode";
import WaypointNodeComponent from "./components/WaypointNode";
import ObjectPlanNode from "./components/ObjectPlanNode";
import ZoneNode from "./components/ZoneNode";
import OffsetEdgeComponent from "./components/OffsetEdge";

export const nodeTypes: NodeTypes = {
  device: DeviceNodeDispatch,
  room: RoomNodeComponent,
  note: NoteNodeComponent,
  annotation: AnnotationNodeComponent,
  "stub-label": StubLabelNodeComponent,
  waypoint: WaypointNodeComponent,
  object: ObjectPlanNode,
  zone: ZoneNode,
};

export const edgeTypes: EdgeTypes = {
  smoothstep: OffsetEdgeComponent,
};
