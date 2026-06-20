# EasySchematic Live MCP

The live MCP bridge lets a local MCP client inspect and mutate the currently open EasySchematic browser tab through the app's real Zustand store.

## Browser App

Live control can be enabled **at runtime on any build** (dev server, desktop app,
or the beta deployment) — no rebuild required. In the browser console of the open
project run, using the same token as your MCP config's `EASYS_CONTROL_TOKEN`:

```js
easySchematicLiveControl.enable("<EASYS_CONTROL_TOKEN>")
// optional second arg overrides the bridge URL (default ws://127.0.0.1:39887/app)
easySchematicLiveControl.disable()   // turn it back off
easySchematicLiveControl.status()    // { phase: "connected" | "connecting" | ... }
```

This persists to `localStorage`, so it survives reloads. You can also pass it via
URL once — `?liveControl=1&liveControlToken=<token>` — which is consumed into
localStorage and stripped from the address bar. A small badge in the bottom-left
shows the live connection state whenever it is enabled.

Build-time env still works for a dev server that should always be live:

```sh
EASYS_CONTROL_TOKEN=change-me npm run dev:live      # picks the token up from the env
# or explicitly:
VITE_LIVE_CONTROL_ENABLED=true VITE_LIVE_CONTROL_TOKEN=change-me npm run dev
```

Resolution priority: URL query → localStorage → `VITE_LIVE_CONTROL_*` build env.

## Multiple clients (Claude Desktop + Claude Code + Codex at once)

Each client launches its own copy of `server.js`. The first to start binds the
WebSocket port and **hosts** the bridge; the rest detect this and **proxy** to it
over a local control channel (TCP `EASYS_BRIDGE_PORT + 1`, default 39888), so all
clients share the single connected app tab. If the host process exits, the next
request re-elects a new host automatically. `get_status` reports `bridge.mode`
(`host`/`proxy`) and never falsely claims to be listening.

## MCP Server

Build and start the MCP package:

```sh
npm run mcp:build
EASYS_CONTROL_TOKEN=change-me npm run mcp:start
```

Defaults:

- `EASYS_BRIDGE_HOST=127.0.0.1`
- `EASYS_BRIDGE_PORT=39887`
- app WebSocket path: `/app`

Remote-capable settings:

- `EASYS_PUBLIC_BRIDGE_URL`
- `EASYS_BRIDGE_HOST`
- `EASYS_BRIDGE_PORT`

Do not expose the bridge directly to the public internet without TLS and stronger auth. The v1 bridge uses a shared token only.

## Claude Desktop Config

After `npm run mcp:build`, add a server entry like:

```json
{
  "mcpServers": {
    "easyschematic-live": {
      "command": "node",
      "args": ["/Users/glenandrewbrown/Development/EasySchematic/mcp/dist/server.js"],
      "env": {
        "EASYS_CONTROL_TOKEN": "change-me"
      }
    }
  }
}
```

## Codex MCP Config

Use the same command/env shape for local MCP configuration:

```json
{
  "command": "node",
  "args": ["/Users/glenandrewbrown/Development/EasySchematic/mcp/dist/server.js"],
  "env": {
    "EASYS_CONTROL_TOKEN": "change-me"
  }
}
```

## Workflow

Read-only tools can be called directly. Mutations should use:

1. `draft_operation_plan`
2. `preview_operation_plan`
3. `apply_operation_plan`

Destructive steps such as `new_schematic` and `import_project` must appear explicitly in `plan.steps`.

## Agent Knowledge Layer

The MCP server is self-describing. Agents should start by reading these before complex work:

- `easyschematic://manual/overview`
- `easyschematic://manual/schema`
- `easyschematic://manual/workflows`
- `easyschematic://manual/best-practices`
- `easyschematic://manual/operation-recipes`
- `easyschematic://capabilities`
- `easyschematic://schema/project`
- `easyschematic://schema/operations`

Knowledge tools:

- `get_capabilities`: app domains, tools, paths, and guidance.
- `get_operation_guide`: recipes for goals like `build-system`, `connect-devices`, `rack-placement`, and `deep-edit`.
- `suggest_next_actions`: goal-aware recommended next tool calls, with live project context when connected.
- `explain_path`: explains a JSON Pointer path and risk level.
- `find_entities`: searches live devices, connections, rooms, pages, racks, layers, and inventory.
- `resolve_reference`: turns user phrases like "the ATEM switcher" into likely exact entity IDs.

Reliability and expert-task tools:

- `lint_project`: expanded health checks beyond validation, including duplicate labels, missing cable IDs/lengths, unassigned devices, and unused layers.
- `connect_by_device_names`: resolve source/target devices and ports from text, then return/apply a connection plan.
- `assign_cable_ids`: generate sequential cable IDs for all or selected connections.
- `place_devices_in_room`: set room parentage for named devices or node IDs.
- `create_rack_layout`: generate a rack-placement plan from existing rack pages/racks and rackable devices.
- `apply_layer_strategy`: assign layers in bulk, for example by signal type.
- `fix_validation_issue`: return deterministic fix guidance or a suggested plan for a validation issue.
- `create_system_from_spec`: turn structured rooms/devices input into an operation plan.

Preview and apply responses include structured diffs where possible. Agent operations are wrapped in a live-control batch so a multi-step plan is intended to become one undoable operation.

Recommended expert-agent loop:

1. `get_capabilities`
2. `get_operation_guide` for the user goal
3. `get_project_summary`, `list_devices`, `list_connections`, `list_rooms`, `validate_schematic`
4. `resolve_reference` / `find_entities` for ambiguous user phrases
5. `list_device_templates` / `get_device_template` before adding devices
6. `draft_operation_plan`
7. `preview_operation_plan`
8. `apply_operation_plan`
9. `validate_schematic`
10. `generate_report`

## Deep Read/Write Tools

For full-system agent work, the MCP server also exposes a generic JSON Pointer layer.

Scopes:

- `project`: the exported `SchematicFile`. Writes round-trip through `exportToJSON` and `importFromJSON`.
- `store`: the serializable live Zustand state. Writes patch the live store, push an undo snapshot, and save to local storage.

Useful tools:

- `list_device_templates`: discover exact device templates and port IDs before adding devices.
- `get_device_template`: fetch one full template.
- `list_deep_paths`: enumerate addressable paths.
- `get_deep_value`: read any value by path.
- `patch_deep_values`: set, merge, insert, or remove arbitrary nested values.

Example paths:

```text
/nodes/0/data/label
/nodes/0/data/ports/2/signalType
/edges/0/data/cableLength
/pages/0/racks/0/heightU
/layers/0/name
```

Example patch:

```json
{
  "scope": "project",
  "operations": [
    { "op": "set", "path": "/nodes/0/data/label", "value": "Main Stage Camera 1" },
    { "op": "merge", "path": "/edges/0/data", "value": { "cableLength": "25m", "cableId": "SDI-001" } }
  ]
}
```

Deep writes are powerful. For bulk or destructive changes, put the same operation inside a plan step:

```json
{
  "steps": [
    {
      "type": "patch_deep_values",
      "scope": "project",
      "operations": [
        { "op": "set", "path": "/name", "value": "Broadcast Control Room" }
      ]
    }
  ]
}
```
