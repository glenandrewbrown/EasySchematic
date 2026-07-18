import { useCallback, useEffect, useRef, useState } from "react";
import { useSchematicStore } from "../store";

export default function ProjectTabs() {
  const activeDocumentId = useSchematicStore((s) => s.activeDocumentId);
  const schematicName = useSchematicStore((s) => s.schematicName);
  const newDocument = useSchematicStore((s) => s.newDocument);
  const switchDocument = useSchematicStore((s) => s.switchDocument);
  const renameDocument = useSchematicStore((s) => s.renameDocument);
  const closeDocument = useSchematicStore((s) => s.closeDocument);
  const listDocuments = useSchematicStore((s) => s.listDocuments);

  // listDocuments() is a plain read (not itself a selector subscription), so
  // re-derive it on every render — activeDocumentId/schematicName above are
  // what actually change when documents are added/renamed/switched/closed.
  const documents = listDocuments();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback((docId: string, currentName: string) => {
    setEditingId(docId);
    setEditValue(currentName);
  }, []);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const commitRename = useCallback(() => {
    if (!editingId || !editValue.trim()) { setEditingId(null); return; }
    renameDocument(editingId, editValue.trim());
    setEditingId(null);
  }, [editingId, editValue, renameDocument]);

  const tabClass = (isActive: boolean) =>
    `group relative flex items-center gap-1 px-3 py-1 my-1 rounded-md whitespace-nowrap transition-colors cursor-pointer font-[var(--font-ui)] ${
      isActive
        ? "bg-[var(--color-surface-raised)] ring-1 ring-[var(--ui-border-strong)] shadow-[var(--ui-shadow-raised)] font-semibold text-[var(--color-text-heading)]"
        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)]"
    }`;

  return (
    <div
      data-print-hide
      className="flex items-center gap-1 bg-[var(--color-surface)] border-b border-[var(--ui-border)] px-2 py-0 text-xs select-none overflow-x-auto"
      style={{ minHeight: 32 }}
    >
      {documents.map((doc) => {
        const isActive = doc.id === activeDocumentId;
        const label = isActive ? schematicName : doc.name;
        return (
          <div
            key={doc.id}
            className={tabClass(isActive)}
            onClick={() => { if (!isActive) switchDocument(doc.id); }}
            onDoubleClick={() => startRename(doc.id, label)}
            title="Double-click to rename"
          >
            {editingId === doc.id ? (
              <input
                ref={inputRef}
                className="bg-[var(--color-surface-raised)] border border-[var(--color-accent)] rounded px-1 py-0 text-xs w-24 outline-none text-[var(--color-text-heading)]"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span>{label}</span>
            )}
            {documents.length > 1 && editingId !== doc.id && (
              <button
                className="text-red-500/70 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer leading-none"
                onClick={(e) => {
                  e.stopPropagation();
                  closeDocument(doc.id);
                }}
                title="Close document"
                aria-label={`Close ${label}`}
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      <button
        className="px-2 py-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
        onClick={() => newDocument()}
        title="New document"
        aria-label="New document"
      >
        +
      </button>
    </div>
  );
}
