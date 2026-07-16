import { useMemo } from "react";
import { useSchematicStore } from "../store";
import { DEFAULT_DISTANCE_SETTINGS } from "../types";
import { listTopLevelRooms, pairKey } from "../roomDistance";

interface RoomDistancesDialogProps {
  onClose: () => void;
}

export default function RoomDistancesDialog({ onClose }: RoomDistancesDialogProps) {
  const nodes = useSchematicStore((s) => s.nodes);
  const roomDistances = useSchematicStore((s) => s.roomDistances);
  const distanceSettings = useSchematicStore((s) => s.distanceSettings);
  const setRoomDistance = useSchematicStore((s) => s.setRoomDistance);
  const setDistanceSettings = useSchematicStore((s) => s.setDistanceSettings);

  const settings = distanceSettings ?? DEFAULT_DISTANCE_SETTINGS;
  const rooms = useMemo(() => listTopLevelRooms(nodes), [nodes]);

  const pairs = useMemo(() => {
    const out: Array<{ a: { id: string; label: string }; b: { id: string; label: string }; key: string }> = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        out.push({ a: rooms[i], b: rooms[j], key: pairKey(rooms[i].id, rooms[j].id) });
      }
    }
    return out;
  }, [rooms]);

  const labelClass = "block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1";
  const inputClass =
    "ui-input";

  return (
    <div
      className="ui-dialog-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-distances-dialog-title"
        className="ui-dialog w-[520px] max-h-[80vh]"
      >
        <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center justify-between">
          <h2 id="room-distances-dialog-title" className="text-sm font-semibold text-[var(--color-text-heading)]">Room Distances</h2>
          <button
            onClick={onClose}
            className="ui-btn ui-btn-ghost text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            Set the physical distance between top-level rooms. Estimated cable length
            for each connection is shown in the Cable Schedule alongside any manual
            length you&rsquo;ve entered. Devices in nested subrooms inherit the distance
            of their top-level room.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Unit</label>
              <div className="flex items-center gap-1">
                {(["m", "ft"] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setDistanceSettings({ unit: u })}
                    className={`ui-btn cursor-pointer transition-colors ${
                      settings.unit === u
                        ? "ui-btn-primary"
                        : "ui-btn-secondary"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Slack %</label>
              <input
                type="number"
                min={0}
                step={1}
                value={settings.slackPercent}
                onChange={(e) => setDistanceSettings({ slackPercent: Number(e.target.value) })}
                className={`${inputClass} w-24`}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className={labelClass}>Slack +{settings.unit}</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={settings.slackFixed}
                onChange={(e) => setDistanceSettings({ slackFixed: Number(e.target.value) })}
                className={`${inputClass} w-24`}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--ui-border)]">
            <div className={labelClass}>Room pairs ({settings.unit})</div>
            {rooms.length < 2 ? (
              <p className="text-xs text-[var(--color-text-muted)] mt-2">
                Create at least two top-level rooms to define distances.
              </p>
            ) : (
              <div className="space-y-1 mt-1 max-h-[50vh] overflow-y-auto pr-1">
                {pairs.map(({ a, b, key }) => {
                  const current = roomDistances?.[key];
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs text-[var(--color-text)] flex-1 truncate">
                        {a.label} <span className="text-[var(--color-text-muted)]">↔</span> {b.label}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={current ?? ""}
                        placeholder="—"
                        onChange={(e) => {
                          const raw = e.target.value;
                          const value = raw === "" ? undefined : Number(raw);
                          setRoomDistance(a.id, b.id, value);
                        }}
                        className={`${inputClass} w-24 text-right`}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[var(--ui-border)] flex justify-end">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-primary"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
