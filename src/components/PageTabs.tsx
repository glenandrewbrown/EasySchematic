import { useCallback, useEffect, useRef, useState } from "react";
import { useSchematicStore } from "../store";

interface ContextMenuState {
  pageId: string;
  x: number;
  y: number;
}

export default function PageTabs() {
  const pages = useSchematicStore((s) => s.pages);
  const activePage = useSchematicStore((s) => s.activePage);
  const setActivePage = useSchematicStore((s) => s.setActivePage);
  const addRackPage = useSchematicStore((s) => s.addRackPage);
  const removeRackPage = useSchematicStore((s) => s.removeRackPage);
  const renameRackPage = useSchematicStore((s) => s.renameRackPage);
  const addPrintSheetPage = useSchematicStore((s) => s.addPrintSheetPage);
  const removePrintSheetPage = useSchematicStore((s) => s.removePrintSheetPage);
  const renamePrintSheetPage = useSchematicStore((s) => s.renamePrintSheetPage);
  const duplicateRackPage = useSchematicStore((s) => s.duplicateRackPage);
  const duplicatePrintSheetPage = useSchematicStore((s) => s.duplicatePrintSheetPage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", close);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const startRename = useCallback((pageId: string, currentLabel: string) => {
    setContextMenu(null);
    setEditingId(pageId);
    setEditValue(currentLabel);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (!editingId || !editValue.trim()) { setEditingId(null); return; }
    const page = pages.find((p) => p.id === editingId);
    if (!page) { setEditingId(null); return; }
    if (page.type === "print-sheet") renamePrintSheetPage(editingId, editValue.trim());
    else renameRackPage(editingId, editValue.trim());
    setEditingId(null);
  }, [editingId, editValue, pages, renameRackPage, renamePrintSheetPage]);

  const handleContextMenu = useCallback((e: React.MouseEvent, pageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ pageId, x: e.clientX, y: e.clientY });
  }, []);

  const menuPage = contextMenu ? pages.find((p) => p.id === contextMenu.pageId) : null;
  const isPrintSheet = menuPage?.type === "print-sheet";

  const handleRename = () => {
    if (!menuPage) return;
    startRename(menuPage.id, menuPage.label);
  };

  const handleDuplicate = () => {
    if (!menuPage) return;
    setContextMenu(null);
    if (menuPage.type === "print-sheet") duplicatePrintSheetPage(menuPage.id);
    else duplicateRackPage(menuPage.id);
  };

  const handleDelete = () => {
    if (!menuPage) return;
    setContextMenu(null);
    if (menuPage.type === "print-sheet") {
      if (confirm(`Delete print sheet "${menuPage.label}"?`)) removePrintSheetPage(menuPage.id);
    } else {
      if (confirm(`Delete rack page "${menuPage.label}"? This will remove all racks and placements on this page.`)) {
        removeRackPage(menuPage.id);
      }
    }
  };

  const tabClass = (isActive: boolean, isPrint = false) =>
    `px-3 py-1 my-1 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
      isActive
        ? isPrint
          ? "bg-[var(--color-surface-raised)] ring-1 ring-violet-400/60 shadow-[var(--ui-shadow-raised)] font-semibold text-violet-700 dark:text-violet-300"
          : "bg-[var(--color-surface-raised)] ring-1 ring-[var(--ui-border-strong)] shadow-[var(--ui-shadow-raised)] font-semibold text-[var(--color-text-heading)]"
        : isPrint
          ? "text-violet-600/80 hover:text-violet-700 hover:bg-violet-500/10 dark:text-violet-300/70 dark:hover:text-violet-300"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)]"
    }`;

  return (
    <>
      <div
        data-print-hide
        className="flex items-center gap-1 bg-[var(--color-surface)] border-b border-[var(--ui-border)] px-2 py-0 text-xs select-none overflow-x-auto"
        style={{ minHeight: 32 }}
      >
        {/* Page tabs */}
        {pages.map((page) => {
          const isPrint = page.type === "print-sheet";
          return (
            <button
              key={page.id}
              className={tabClass(activePage === page.id, isPrint)}
              onClick={() => setActivePage(page.id)}
              onDoubleClick={() => startRename(page.id, page.label)}
              onContextMenu={(e) => handleContextMenu(e, page.id)}
              title="Double-click to rename, right-click for options"
            >
              {editingId === page.id ? (
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
                <>{isPrint ? "📄 " : ""}{page.label}</>
              )}
            </button>
          );
        })}

        {/* Add rack page */}
        <button
          className="px-2 py-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
          onClick={() => addRackPage(`Rack Page ${pages.filter((p) => p.type === "rack-elevation").length + 1}`)}
          title="Add rack elevation page"
        >
          +
        </button>

        {/* Add print sheet */}
        <button
          className="px-2 py-1 rounded-md text-violet-500/80 hover:text-violet-700 hover:bg-violet-500/10 dark:hover:text-violet-300 transition-colors cursor-pointer"
          onClick={() => addPrintSheetPage()}
          title="Add print sheet"
        >
          📄+
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && menuPage && (
        <div
          ref={menuRef}
          className="chrome-menu fixed z-50 min-w-[150px] text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] truncate">
            {isPrintSheet ? "📄 " : ""}{menuPage.label}
          </div>
          <div className="h-px bg-[var(--ui-border)] my-1" />
          <button
            className="w-full text-left px-2.5 py-1.5 rounded-md text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            onClick={handleRename}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-2.5 py-1.5 rounded-md text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            onClick={handleDuplicate}
          >
            Duplicate
          </button>
          <div className="h-px bg-[var(--ui-border)] my-1" />
          <button
            className="w-full text-left px-2.5 py-1.5 rounded-md text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}
