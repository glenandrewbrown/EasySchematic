import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "@xyflow/react";
import { useSchematicStore } from "../store";
import { exportImage } from "../exportUtils";
import { exportDxf } from "../dxfExport";
import { exportPdf } from "../pdfExport";
import { exportTemplatesToFile, readTemplateFile } from "../templateExport";
import { loadSchematicTemplate } from "../templateApi";
import { getPaperSize } from "../printConfig";
import type { SchematicFile, SchematicNode, AnnotationData } from "../types";
import ReportsDialog, { type ReportsTab } from "./ReportsDialog";
import TitleBlockDialog from "./TitleBlockDialog";
import AboutDialog from "./AboutDialog";
import WhatsNewDialog from "./WhatsNewDialog";
import PreferencesDialog from "./PreferencesDialog";
import RoomDistancesDialog from "./RoomDistancesDialog";
import AlignmentMenu from "./AlignmentMenu";
import UserMenuButton from "./UserMenuButton";
import SchematicBrowser from "./SchematicBrowser";
import LoginDialog from "./LoginDialog";
import { checkSession, saveSchematicToCloud, updateSchematicInCloud } from "../templateApi";
import ViewOptionsPanel from "./ViewOptionsPanel";
import ShowInfoPanel from "./ShowInfoPanel";
import CsvImportWizard from "./CsvImportWizard";
import SignalColorPanel from "./SignalColorPanel";
import { useTheme } from "../hooks/useTheme";

// ─── Menu data types ─────────────────────────────────────────────

interface MenuItemDef {
  type: "item";
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

interface MenuSeparatorDef {
  type: "separator";
}

/** A nested sublist — renders as a hover flyout on desktop, an indented group on mobile. */
interface MenuSubmenuDef {
  type: "submenu";
  label: string;
  title?: string;
  disabled?: boolean;
  items: MenuEntry[];
}

type MenuEntry = MenuItemDef | MenuSeparatorDef | MenuSubmenuDef;

// ─── Sub-components ──────────────────────────────────────────────

function MenuSeparator() {
  return <div className="h-px bg-[var(--ui-border)] my-1" />;
}

function MenuItem({
  label,
  shortcut,
  checked,
  disabled,
  title,
  onClick,
}: {
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex items-center w-full px-2 py-1.5 text-xs rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-left gap-2"
    >
      <span className="w-4 text-center shrink-0 text-[10px]">
        {checked != null ? (checked ? "✓" : "") : ""}
      </span>
      <span className="flex-1 text-[var(--color-text)]">{label}</span>
      {shortcut && (
        <span
          className="text-[var(--color-text-muted)] text-[10px] ml-4 whitespace-nowrap"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}

/** A parsed object is an importable schematic only if it's an object carrying a `nodes`
 *  array. Guards every import path so junk/non-schematic JSON is rejected with a clear
 *  alert instead of being silently loaded as an empty schematic that wipes the canvas. (#176) */
function looksLikeSchematic(data: unknown): data is SchematicFile {
  return !!data && typeof data === "object" && Array.isArray((data as SchematicFile).nodes);
}

/** One row that opens a nested sublist to the side on hover (desktop menus). */
function SubmenuRow({ entry, onClose }: { entry: MenuSubmenuDef; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const [flipLeft, setFlipLeft] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { cancel(); closeTimer.current = setTimeout(() => setOpen(false), 220); };
  const openNow = () => {
    cancel();
    // Flip to the left when there isn't ~240px of room to the right of the row.
    const r = rowRef.current?.getBoundingClientRect();
    setFlipLeft(!!r && r.right + 240 > window.innerWidth);
    setOpen(true);
  };
  return (
    <div ref={rowRef} className="relative" onMouseEnter={openNow} onMouseLeave={scheduleClose}>
      <button
        disabled={entry.disabled}
        title={entry.title}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center w-full px-2 py-1.5 text-xs rounded-md hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-left gap-2"
      >
        <span className="w-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{entry.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {open && !entry.disabled && (
        <div
          role="menu"
          className={`chrome-menu absolute top-0 -mt-1 min-w-[220px] z-50 ${flipLeft ? "right-full mr-0.5" : "left-full ml-0.5"}`}
        >
          {entry.items.map((sub, i) => renderMenuEntry(sub, i, onClose))}
        </div>
      )}
    </div>
  );
}

/** Render one menu entry (item / separator / submenu) inside a dropdown. */
function renderMenuEntry(entry: MenuEntry, key: number, onClose: () => void) {
  if (entry.type === "separator") return <MenuSeparator key={key} />;
  if (entry.type === "submenu") return <SubmenuRow key={key} entry={entry} onClose={onClose} />;
  return (
    <MenuItem
      key={key}
      label={entry.label}
      shortcut={entry.shortcut}
      checked={entry.checked}
      disabled={entry.disabled}
      title={entry.title}
      onClick={() => {
        entry.onClick();
        onClose();
      }}
    />
  );
}

function MenuDropdown({ items, onClose, side = "below" }: { items: MenuEntry[]; onClose: () => void; side?: "below" | "right" }) {
  // "below" = under its trigger (top-bar menu buttons); "right" = a cascading flyout beside
  // its row (the ≡ root menu, so sibling menu names aren't covered).
  const pos = side === "right" ? "top-0 left-full ml-0.5" : "top-full left-0 mt-1";
  return (
    <div className={`chrome-menu absolute ${pos} min-w-[230px] z-50`}>
      {items.map((entry, i) => renderMenuEntry(entry, i, onClose))}
    </div>
  );
}

// ─── Main MenuBar ────────────────────────────────────────────────

export default function MenuBar({ variant = "full" }: { variant?: "full" | "menu" } = {}) {
  // variant="menu" renders only a compact ≡ menu (for embedding in the new unified
  // top bar) plus all the dialogs + window-event handlers; the legacy desktop bar is
  // suppressed. variant="full" is the original standalone menu bar.
  const [menuRootOpen, setMenuRootOpen] = useState(false);
  const {
    schematicName,
    setSchematicName,
    exportToJSON,
    importFromJSON,
    newSchematic,
    undo,
    redo,
  } = useSchematicStore();

  const printView = useSchematicStore((s) => s.printView);
  const showOwnedGearPane = useSchematicStore((s) => s.showOwnedGearPane);
  const undoSize = useSchematicStore((s) => s.undoSize);
  const redoSize = useSchematicStore((s) => s.redoSize);

  const reactFlowInstance = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const { isDark, toggle: toggleTheme } = useTheme();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [activeMobilePanel, setActiveMobilePanel] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(schematicName);
  const [reportsTab, setReportsTab] = useState<ReportsTab | null>(null);
  const [showTitleBlockDialog, setShowTitleBlockDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(
    () => localStorage.getItem("easyschematic-whatsnew-v43") !== "1",
  );
  const [showPreferences, setShowPreferences] = useState(false);
  const [showRoomDistances, setShowRoomDistances] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showSchematicBrowser, setShowSchematicBrowser] = useState(false);
  const [showCloudLogin, setShowCloudLogin] = useState(false);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check login state on mount
  useEffect(() => {
    checkSession().then((u) => setIsLoggedIn(!!u));
  }, []);

  const cloudSchematicId = useSchematicStore((s) => s.cloudSchematicId);
  const cloudSavedAt = useSchematicStore((s) => s.cloudSavedAt);
  const fileHandle = useSchematicStore((s) => s.fileHandle);
  const isOnline = useSchematicStore((s) => s.isOnline);

  // Keep nameValue in sync when schematicName changes externally
  useEffect(() => {
    if (!editingName) setNameValue(schematicName);
  }, [schematicName, editingName]);

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  // Close mobile menu/panel on Escape + lock body scroll
  useEffect(() => {
    if (!mobileMenuOpen && !activeMobilePanel) return;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        setActiveMobilePanel(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileMenuOpen, activeMobilePanel]);

  // ─── File actions ──────────────────────────────────────

  // Write schematic JSON to a FileSystemFileHandle (silent, no dialog)
  const writeToFileHandle = useCallback(async (handle: FileSystemFileHandle) => {
    const data = exportToJSON();
    const json = JSON.stringify(data, null, 2);
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
  }, [exportToJSON]);

  // Legacy download fallback (always triggers browser download)
  const downloadFile = useCallback(() => {
    const data = exportToJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportToJSON]);

  // Show the native file picker and return the chosen handle
  const pickFileHandle = useCallback(async (): Promise<FileSystemFileHandle | null> => {
    const store = useSchematicStore.getState();
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: `${store.schematicName.replace(/[^a-zA-Z0-9-_ ]/g, "")}.json`,
        types: [{ description: "EasySchematic files", accept: { "application/json": [".json"] } }],
      });
      return handle;
    } catch {
      // User cancelled the picker
      return null;
    }
  }, []);

  // Save: reuse existing handle/cloud, or prompt for first save
  const handleSave = useCallback(async () => {
    const store = useSchematicStore.getState();

    // Cloud-backed schematic: update cloud (local file handle still used if present)
    if (store.cloudSchematicId && store.isOnline) {
      checkSession().then((session) => {
        if (!session) return;
        const data = store.exportToJSON();
        updateSchematicInCloud(store.cloudSchematicId!, data)
          .then((result) => store.setCloudSavedAt(result.updated_at))
          .catch((e: unknown) => {
            store.addToast(e instanceof Error ? e.message : "Cloud save failed", "error");
          });
      });
    }

    // Has a local file handle: silently overwrite
    if (store.fileHandle) {
      try {
        await writeToFileHandle(store.fileHandle);
        store.addToast("Saved", "success", 1500);
        return;
      } catch {
        // Handle went stale (file moved/deleted) — fall through to picker
        store.setFileHandle(null);
      }
    }

    // If cloud-backed but no local handle, cloud save is enough
    if (store.cloudSchematicId) return;

    // No handle, no cloud — first save. Use File System Access API if available.
    if ("showSaveFilePicker" in window) {
      const handle = await pickFileHandle();
      if (!handle) return;
      store.setFileHandle(handle);
      // Update schematic name to match chosen filename
      const name = handle.name.replace(/\.json$/i, "");
      if (name) store.setSchematicName(name);
      try {
        await writeToFileHandle(handle);
        store.addToast("Saved", "success", 1500);
      } catch (e: unknown) {
        store.addToast(e instanceof Error ? e.message : "Save failed", "error");
      }
    } else {
      downloadFile();
    }
  }, [writeToFileHandle, downloadFile, pickFileHandle]);

  // Save As: always show picker, optionally switch from cloud to local
  const handleSaveAs = useCallback(async () => {
    if ("showSaveFilePicker" in window) {
      const handle = await pickFileHandle();
      if (!handle) return;
      const store = useSchematicStore.getState();
      // Detach from cloud — user explicitly chose local destination
      if (store.cloudSchematicId) {
        store.setCloudSchematicId(null);
        store.setCloudSavedAt(null);
      }
      store.setFileHandle(handle);
      const name = handle.name.replace(/\.json$/i, "");
      if (name) store.setSchematicName(name);
      try {
        await writeToFileHandle(handle);
        store.addToast("Saved", "success", 1500);
      } catch (e: unknown) {
        store.addToast(e instanceof Error ? e.message : "Save failed", "error");
      }
    } else {
      downloadFile();
    }
  }, [pickFileHandle, writeToFileHandle, downloadFile]);

  const handleOpen = useCallback(async () => {
    if ("showOpenFilePicker" in window) {
      let handle: FileSystemFileHandle;
      try {
        [handle] = await window.showOpenFilePicker({
          types: [{ description: "EasySchematic files", accept: { "application/json": [".json"] } }],
          multiple: false,
        });
      } catch {
        return; // user cancelled the picker
      }
      const file = await handle.getFile();
      if (file.size > 10 * 1024 * 1024) {
        alert("File is too large (max 10 MB). Please use a smaller schematic file.");
        return;
      }
      const text = await file.text();
      // Mirror handleImport: only a JSON-parse failure or a non-schematic shape is
      // "invalid"; a post-load pipeline error goes to console, not an alert. Previously
      // this path swallowed everything silently, so junk files showed no error. (#176)
      let data: SchematicFile;
      try {
        data = JSON.parse(text) as SchematicFile;
      } catch {
        alert("Invalid schematic file.");
        return;
      }
      if (!looksLikeSchematic(data)) {
        alert("Invalid schematic file.");
        return;
      }
      try {
        importFromJSON(data);
      } catch (err) {
        console.error("Schematic import error (file parsed OK):", err);
      }
      // Store the handle so future saves go back to this file
      useSchematicStore.getState().setFileHandle(handle);
      // Update name to match file
      const name = handle.name.replace(/\.json$/i, "");
      if (name) useSchematicStore.getState().setSchematicName(name);
    } else {
      fileInputRef.current?.click();
    }
  }, [importFromJSON]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert("File is too large (max 10 MB). Please use a smaller schematic file.");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        // Only a JSON-parse failure means the file is actually invalid. Importing
        // is done separately so a post-load pipeline error (which can fire after
        // the schematic is already on screen) isn't mislabeled "invalid". (#176)
        let data: SchematicFile;
        try {
          data = JSON.parse(reader.result as string) as SchematicFile;
        } catch {
          alert("Invalid schematic file.");
          return;
        }
        // Shape check: reject non-schematic JSON here so it isn't silently loaded as an
        // empty schematic that wipes the canvas. Distinct from a post-load pipeline error,
        // which still goes to console only and isn't mislabeled "invalid". (#176)
        if (!looksLikeSchematic(data)) {
          alert("Invalid schematic file.");
          return;
        }
        try {
          importFromJSON(data);
        } catch (err) {
          console.error("Schematic import error (file parsed OK):", err);
        }
      };
      reader.readAsText(file, "UTF-8");
      e.target.value = "";
    },
    [importFromJSON],
  );

  const handleSaveArchive = useCallback(() => {
    const templates = useSchematicStore.getState().exportCustomTemplates();
    if (templates.length === 0) {
      alert("No custom device templates to export.");
      return;
    }
    exportTemplatesToFile(templates);
  }, []);

  const handleOpenArchive = useCallback(() => {
    archiveInputRef.current?.click();
  }, []);

  const handleImportArchive = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const templates = await readTemplateFile(file);
        useSchematicStore.getState().importCustomTemplates(templates);
        alert(`Imported ${templates.length} device template${templates.length === 1 ? "" : "s"}.`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Invalid device archive file.");
      }
      e.target.value = "";
    },
    [],
  );

  const handleCloudSave = useCallback(async () => {
    const store = useSchematicStore.getState();

    if (!navigator.onLine) {
      store.addToast("You're offline. Use File → Save to save a copy to your computer.", "info");
      return;
    }

    const session = await checkSession();
    if (!session) {
      setShowCloudLogin(true);
      return;
    }
    setCloudSaving(true);
    try {
      const data = exportToJSON();
      if (store.cloudSchematicId) {
        const result = await updateSchematicInCloud(store.cloudSchematicId, data);
        store.setCloudSavedAt(result.updated_at);
      } else {
        const result = await saveSchematicToCloud(data);
        store.setCloudSchematicId(result.id);
        store.setCloudSavedAt(result.updated_at);
      }
      setIsLoggedIn(true);
    } catch (e) {
      useSchematicStore.getState().addToast(e instanceof Error ? e.message : "Failed to save to cloud", "error");
    } finally {
      setCloudSaving(false);
    }
  }, [exportToJSON]);

  // Listen for keyboard shortcut events from App.tsx
  useEffect(() => {
    const onSave = () => { handleSave(); };
    const onSaveAs = () => { handleSaveAs(); };
    const onOpen = () => { handleOpen(); };
    window.addEventListener("easyschematic:save", onSave);
    window.addEventListener("easyschematic:save-as", onSaveAs);
    window.addEventListener("easyschematic:open", onOpen);
    return () => {
      window.removeEventListener("easyschematic:save", onSave);
      window.removeEventListener("easyschematic:save-as", onSaveAs);
      window.removeEventListener("easyschematic:open", onOpen);
    };
  }, [handleSave, handleSaveAs, handleOpen]);

  // Open the Reports dialog on the Cable BOM tab when the guided setup asks for it.
  useEffect(() => {
    const onOpenCableBom = () => setReportsTab("cableBom");
    window.addEventListener("easyschematic:open-cable-bom", onOpenCableBom);
    return () => window.removeEventListener("easyschematic:open-cable-bom", onOpenCableBom);
  }, []);

  // ─── Export helpers ────────────────────────────────────

  const doExportPng = () => exportImage(reactFlowInstance, { format: "png", pixelRatio: 4 });
  const doExportSvg = () => exportImage(reactFlowInstance, { format: "svg" });
  const doExportDxf = () => exportDxf(reactFlowInstance);
  const doExportPdf = () => {
    const state = useSchematicStore.getState();
    const paper = getPaperSize(state.printPaperId, state.printCustomWidthIn, state.printCustomHeightIn);
    exportPdf(
      reactFlowInstance,
      paper,
      state.printOrientation,
      state.printScale,
      state.titleBlock,
      state.titleBlockLayout,
    );
  };

  const doExportRackPdf = async () => {
    const { exportRackPdf } = await import("../rackPdf");
    const state = useSchematicStore.getState();
    const rackPages = state.pages.filter((p) => p.type === "rack-elevation");
    if (rackPages.length === 0) {
      alert("No rack pages to export. Create a rack page first via the page tabs.");
      return;
    }
    await exportRackPdf({
      pages: state.pages,
      nodes: state.nodes,
      schematicName: state.schematicName,
      titleBlock: state.titleBlock,
      schematicDefaults: { useShortNames: state.useShortNames, wrapDeviceLabels: state.wrapDeviceLabels },
    });
  };

  const doExportPrintSheets = async () => {
    const { runPrintSheetExport } = await import("../printSheetExport");
    await runPrintSheetExport();
  };

  // ─── Name editing ──────────────────────────────────────

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed) setSchematicName(trimmed);
    else setNameValue(schematicName);
    setEditingName(false);
  };

  // ─── Menu definitions ─────────────────────────────────

  const addAnnotation = useCallback((shape: AnnotationData["shape"]) => {
    const state = useSchematicStore.getState();
    state.pushSnapshot();
    const viewport = reactFlowInstance.getViewport();
    // Place annotation in the center of the current viewport
    const x = (-viewport.x + window.innerWidth / 2) / viewport.zoom - 100;
    const y = (-viewport.y + window.innerHeight / 2) / viewport.zoom - 50;
    const isSquare = shape === "circle" || shape === "diamond";
    const newNode: SchematicNode = {
      id: `annotation-${Date.now()}`,
      type: "annotation",
      position: { x: isSquare ? x + 50 : x, y },
      data: { shape, color: "rgba(59, 130, 246, 0.15)", borderColor: "#3b82f6" } as AnnotationData,
      style: { width: isSquare ? 100 : 200, height: 100 },
    };
    useSchematicStore.setState({ nodes: [...state.nodes, newNode] });
    state.saveToLocalStorage();
  }, [reactFlowInstance]);

  const handleNew = useCallback(async () => {
    if (isLoggedIn && isOnline) {
      try {
        const tpl = await loadSchematicTemplate();
        if (tpl) {
          newSchematic(tpl as SchematicFile);
          return;
        }
      } catch { /* fall through to blank */ }
    }
    newSchematic();
  }, [isLoggedIn, isOnline, newSchematic]);

  // Icon toolbar (Toolbar.tsx) fires these window events; MenuBar owns the actions.
  useEffect(() => {
    const onNew = () => { handleNew(); };
    const onReports = () => setReportsTab("devices");
    // Phone: the top-bar ⋯ overflow opens the full menu accordion (all File/Edit/View/…
    // lists + sublists) so nothing is desktop-only.
    const onOpenMenu = () => setMobileMenuOpen(true);
    const onFit = () => reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    // Zoom to the current selection (falls back to fit-all when nothing is selected),
    // mirroring the Shift+2 shortcut so the action has a visible, clickable home.
    const onZoomSel = () => {
      const selected = reactFlowInstance.getNodes().filter((n) => n.selected && !n.hidden);
      if (selected.length > 0) reactFlowInstance.fitView({ nodes: selected, padding: 0.3, duration: 300 });
      else reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    };
    window.addEventListener("easyschematic:new", onNew);
    window.addEventListener("easyschematic:open-reports", onReports);
    window.addEventListener("easyschematic:open-menu", onOpenMenu);
    window.addEventListener("easyschematic:fit-view", onFit);
    window.addEventListener("easyschematic:zoom-to-selection", onZoomSel);
    return () => {
      window.removeEventListener("easyschematic:new", onNew);
      window.removeEventListener("easyschematic:open-reports", onReports);
      window.removeEventListener("easyschematic:open-menu", onOpenMenu);
      window.removeEventListener("easyschematic:fit-view", onFit);
      window.removeEventListener("easyschematic:zoom-to-selection", onZoomSel);
    };
  }, [handleNew, reactFlowInstance]);

  const closeMenu = () => setOpenMenu(null);

  // Live store snapshot for menu checkmarks. The component subscribes to the whole store
  // (destructure above), so this is re-read on every store change and stays current.
  const st = useSchematicStore.getState();
  const toggle = (get: () => boolean, set: (v: boolean) => void) => () => set(!get());

  const menus: Record<string, MenuEntry[]> = {
    File: [
      { type: "item", label: "New", onClick: handleNew },
      { type: "item", label: "Open...", shortcut: "Ctrl+O", onClick: handleOpen },
      { type: "item", label: "My Schematics...", disabled: !isLoggedIn, title: isLoggedIn ? undefined : "Must be logged in", onClick: () => setShowSchematicBrowser(true) },
      { type: "separator" },
      { type: "item", label: "Save", shortcut: "Ctrl+S", onClick: handleSave },
      { type: "item", label: "Save As...", shortcut: "Ctrl+Shift+S", onClick: handleSaveAs },
      { type: "item", label: cloudSaving ? "Saving to Cloud..." : isOnline ? "Save to Cloud" : "Save to Cloud (Offline)", disabled: cloudSaving || !isOnline, onClick: handleCloudSave },
      { type: "separator" },
      {
        type: "submenu",
        label: "Import",
        items: [
          { type: "item", label: "Device Archive...", onClick: handleOpenArchive },
          { type: "item", label: "Cable Schedule (CSV)...", onClick: () => setShowCsvImport(true) },
        ],
      },
      {
        type: "submenu",
        label: "Export",
        items: [
          { type: "item", label: "PNG Image", onClick: doExportPng },
          { type: "item", label: "SVG Vector", onClick: doExportSvg },
          { type: "item", label: "DXF (CAD)", onClick: doExportDxf },
          { type: "separator" },
          { type: "item", label: "PDF Document", onClick: doExportPdf },
          { type: "item", label: "Rack Elevation PDF", onClick: doExportRackPdf },
          { type: "item", label: "Print Sheets", onClick: doExportPrintSheets },
          { type: "separator" },
          { type: "item", label: "Title Block...", onClick: () => setShowTitleBlockDialog(true) },
        ],
      },
      { type: "item", label: "Save Device Archive", onClick: handleSaveArchive },
      { type: "separator" },
      { type: "item", label: "Preferences...", onClick: () => setShowPreferences(true) },
    ],
    Edit: [
      { type: "item", label: "Undo", shortcut: "Ctrl+Z", disabled: undoSize === 0, onClick: undo },
      { type: "item", label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: redoSize === 0, onClick: redo },
      { type: "separator" },
      { type: "item", label: "Copy", shortcut: "Ctrl+C", onClick: () => useSchematicStore.getState().copySelected() },
      { type: "item", label: "Paste", shortcut: "Ctrl+V", onClick: () => useSchematicStore.getState().pasteClipboard() },
      { type: "item", label: "Delete", shortcut: "Del", onClick: () => useSchematicStore.getState().removeSelected() },
      { type: "separator" },
      { type: "item", label: "Select All", shortcut: "Ctrl+A", onClick: () => useSchematicStore.getState().selectAll() },
      { type: "separator" },
      { type: "item", label: "Reset All Routes", title: "Clear every manual route so the whole schematic re-auto-routes (undoable)", onClick: () => useSchematicStore.getState().clearAllManualWaypoints() },
    ],
    Insert: [
      {
        type: "submenu",
        label: "Shape",
        items: [
          { type: "item", label: "Rectangle", onClick: () => addAnnotation("rectangle") },
          { type: "item", label: "Ellipse", onClick: () => addAnnotation("ellipse") },
          { type: "item", label: "Circle", onClick: () => addAnnotation("circle") },
          { type: "item", label: "Diamond", onClick: () => addAnnotation("diamond") },
          { type: "item", label: "Triangle", onClick: () => addAnnotation("triangle") },
        ],
      },
    ],
    View: [
      {
        type: "submenu",
        label: "Workspace",
        items: [
          { type: "item", label: "Schematic", checked: st.canvasViewMode === "schematic", onClick: () => useSchematicStore.getState().setCanvasViewMode("schematic") },
          { type: "item", label: "Plan", checked: st.canvasViewMode === "layout", onClick: () => useSchematicStore.getState().setCanvasViewMode("layout") },
          { type: "item", label: "Schedule", checked: st.canvasViewMode === "schedule", onClick: () => useSchematicStore.getState().setCanvasViewMode("schedule") },
        ],
      },
      { type: "item", label: "Print View", shortcut: "F9", checked: printView, onClick: () => useSchematicStore.getState().setPrintView(!printView) },
      { type: "separator" },
      {
        type: "submenu",
        label: "Canvas",
        items: [
          { type: "item", label: "Show Grid", checked: st.gridSettings.gridVisible, onClick: () => { const s = useSchematicStore.getState(); s.setGridSettings({ gridVisible: !s.gridSettings.gridVisible }); } },
          {
            type: "submenu",
            label: "Grid Style",
            items: [
              { type: "item", label: "Ruled Lines", checked: st.gridSettings.layoutGridStyle === "lines", onClick: () => useSchematicStore.getState().setGridSettings({ layoutGridStyle: "lines" }) },
              { type: "item", label: "Dots", checked: st.gridSettings.layoutGridStyle === "dots", onClick: () => useSchematicStore.getState().setGridSettings({ layoutGridStyle: "dots" }) },
            ],
          },
          {
            type: "submenu",
            label: "Grid Units",
            items: [
              { type: "item", label: "Meters", checked: st.gridSettings.layoutGridUnit === "m", onClick: () => useSchematicStore.getState().setGridSettings({ layoutGridUnit: "m" }) },
              { type: "item", label: "Feet", checked: st.gridSettings.layoutGridUnit === "ft", onClick: () => useSchematicStore.getState().setGridSettings({ layoutGridUnit: "ft" }) },
            ],
          },
          { type: "item", label: "Show Minimap", checked: st.showMiniMap, onClick: toggle(() => useSchematicStore.getState().showMiniMap, (v) => useSchematicStore.getState().setShowMiniMap(v)) },
        ],
      },
      {
        type: "submenu",
        label: "Devices",
        items: [
          { type: "item", label: "Compact Devices", checked: st.nodeCompact, onClick: toggle(() => useSchematicStore.getState().nodeCompact, (v) => useSchematicStore.getState().setNodeCompact(v)) },
          { type: "item", label: "Show Port Counts", checked: st.showPortCounts, onClick: toggle(() => useSchematicStore.getState().showPortCounts, (v) => useSchematicStore.getState().setShowPortCounts(v)) },
          { type: "item", label: "Hide Unconnected Ports", checked: st.hideUnconnectedPorts, onClick: toggle(() => useSchematicStore.getState().hideUnconnectedPorts, (v) => useSchematicStore.getState().setHideUnconnectedPorts(v)) },
          { type: "item", label: "Show Owned Gear Panel", checked: showOwnedGearPane, onClick: toggle(() => useSchematicStore.getState().showOwnedGearPane, (v) => useSchematicStore.getState().setShowOwnedGearPane(v)) },
        ],
      },
      {
        type: "submenu",
        label: "Signal & Cables",
        items: [
          { type: "item", label: "Live Signal Flow", checked: st.liveSignal, onClick: toggle(() => useSchematicStore.getState().liveSignal, (v) => useSchematicStore.getState().setLiveSignal(v)) },
          {
            type: "submenu",
            label: "Colour By",
            items: [
              { type: "item", label: "Signal Type", checked: st.colorBy === "signal", onClick: () => useSchematicStore.getState().setColorBy("signal") },
              { type: "item", label: "Layer", checked: st.colorBy === "layer", onClick: () => useSchematicStore.getState().setColorBy("layer") },
              { type: "item", label: "None", checked: st.colorBy === "none", onClick: () => useSchematicStore.getState().setColorBy("none") },
            ],
          },
          { type: "separator" },
          { type: "item", label: "Auto-Route Cables", checked: st.autoRoute, onClick: () => useSchematicStore.getState().toggleAutoRoute() },
          { type: "item", label: "Show Line Jumps", checked: st.showLineJumps, onClick: toggle(() => useSchematicStore.getState().showLineJumps, (v) => useSchematicStore.getState().setShowLineJumps(v)) },
          { type: "item", label: "Show Cable ID Labels", checked: st.showCableIdLabels, onClick: toggle(() => useSchematicStore.getState().showCableIdLabels, (v) => useSchematicStore.getState().setShowCableIdLabels(v)) },
          { type: "item", label: "Show Custom Labels", checked: st.showCustomLabels, onClick: toggle(() => useSchematicStore.getState().showCustomLabels, (v) => useSchematicStore.getState().setShowCustomLabels(v)) },
          { type: "item", label: "Hide Adapters", checked: st.hideAdapters, onClick: toggle(() => useSchematicStore.getState().hideAdapters, (v) => useSchematicStore.getState().setHideAdapters(v)) },
        ],
      },
      { type: "separator" },
      { type: "item", label: "Debug Edges", shortcut: "Ctrl+B", checked: st.debugEdges, onClick: () => useSchematicStore.getState().toggleDebugEdges() },
    ],
    Reports: [
      { type: "item", label: "Device List...", onClick: () => setReportsTab("devices") },
      { type: "item", label: "Cable Schedule...", onClick: () => setReportsTab("cableSchedule") },
      { type: "item", label: "Cable BOM...", onClick: () => setReportsTab("cableBom") },
      { type: "item", label: "Patch Panels...", onClick: () => setReportsTab("patchPanel") },
      { type: "item", label: "Pack List...", onClick: () => setReportsTab("packList") },
      { type: "separator" },
      {
        type: "submenu",
        label: "Analysis",
        items: [
          { type: "item", label: "Network Report...", onClick: () => setReportsTab("network") },
          { type: "item", label: "Power Report...", onClick: () => setReportsTab("power") },
        ],
      },
      {
        type: "submenu",
        label: "Inventory & Measurements",
        items: [
          { type: "item", label: "Cable Inventory...", onClick: () => useSchematicStore.getState().setShowCableInventory(true) },
          { type: "item", label: "Room Distances...", onClick: () => setShowRoomDistances(true) },
        ],
      },
    ],
    Help: [
      {
        type: "item",
        label: "Documentation \u2197",
        onClick: () => window.open("https://docs.easyschematic.live", "_blank", "noopener,noreferrer"),
      },
      {
        type: "item",
        label: "Device Database \u2197",
        onClick: () => window.open("https://devices.easyschematic.live", "_blank", "noopener,noreferrer"),
      },
      { type: "separator" },
      {
        type: "item",
        label: "Guided Venue Setup...",
        onClick: () => useSchematicStore.getState().setGuidedSetupOpen(true),
      },
      {
        type: "item",
        label: "What's New...",
        onClick: () => setShowWhatsNew(true),
      },
      {
        type: "item",
        label: "About EasySchematic",
        onClick: () => setShowAboutDialog(true),
      },
    ],
  };

  const menuNames = Object.keys(menus);

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setOpenSection(null);
  };

  // Recursively render a menu entry in the mobile accordion. Submenus become an indented
  // group (label subheading + nested items) so every sublist stays reachable on phone.
  const renderMobileEntry = (entry: MenuEntry, key: number, depth: number): React.ReactNode => {
    if (entry.type === "separator") return <div key={key} className="h-px bg-[var(--color-border)] my-1 mx-2" />;
    if (entry.type === "submenu") {
      return (
        <div key={key} className={depth > 0 ? "pl-3" : ""}>
          <div className="px-4 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]" style={{ paddingLeft: 16 + depth * 12 }}>
            {entry.label}
          </div>
          {entry.items.map((sub, i) => renderMobileEntry(sub, i, depth + 1))}
        </div>
      );
    }
    return (
      <button
        key={key}
        disabled={entry.disabled}
        onClick={() => { entry.onClick(); closeMobileMenu(); }}
        className="flex items-center w-full py-2.5 text-sm rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-left gap-3"
        style={{ paddingLeft: 16 + depth * 12, paddingRight: 16 }}
      >
        <span className="w-5 text-center shrink-0 text-xs">
          {entry.checked != null ? (entry.checked ? "✓" : "") : ""}
        </span>
        <span className="flex-1 text-[var(--color-text)]">{entry.label}</span>
      </button>
    );
  };

  const MobileAccordionSection = ({ name, items }: { name: string; items: MenuEntry[] }) => {
    const isOpen = openSection === name;
    return (
      <div className="border-b border-[var(--color-border)]">
        <button
          className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-[var(--color-text-heading)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={() => setOpenSection(isOpen ? null : name)}
        >
          {name}
          <svg
            className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="pb-2 px-2">
            {items.map((entry, i) => renderMobileEntry(entry, i, 0))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={menuBarRef}>
      {/* Compact ≡ menu — embedded in the new unified top bar (variant="menu") */}
      {variant === "menu" && (
        <div className="relative hidden md:block">
          <button
            onClick={() => setMenuRootOpen((o) => !o)}
            title="Menu"
            aria-label="Menu"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              menuRootOpen
                ? "bg-[var(--color-surface-hover)] text-[var(--color-text-heading)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-heading)]"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          {menuRootOpen && (
            <div
              className="absolute top-full left-0 mt-1 min-w-[150px] py-1 rounded-lg z-[60] bg-[var(--color-surface)] border border-[var(--ui-border-strong)]"
              style={{ boxShadow: "var(--ui-shadow-menu)" }}
            >
              {menuNames.map((name) => (
                <div
                  key={name}
                  className="relative"
                  onMouseEnter={() => setOpenMenu(name)}
                >
                  <div
                    className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-default ${
                      openMenu === name
                        ? "bg-[var(--color-surface-hover)] text-[var(--color-text-heading)]"
                        : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                    }`}
                  >
                    <span>{name}</span>
                    <span className="text-[var(--color-text-muted)]">›</span>
                  </div>
                  {openMenu === name && (
                    <MenuDropdown
                      items={menus[name]}
                      side="right"
                      onClose={() => {
                        setOpenMenu(null);
                        setMenuRootOpen(false);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Desktop menu bar (legacy standalone — variant="full") */}
      {variant === "full" && (
      <div className="hidden md:flex h-10 bg-[var(--color-surface)] border-b border-[var(--ui-border)] items-center px-1 shrink-0 select-none">
        {/* Left: logo + brand + menus */}
        <div className="flex items-center">
          <div className="flex items-center gap-2 px-3 shrink-0">
            <img src="/favicon.svg" alt="" className="w-5 h-5" />
            <span
              className="text-xs font-semibold text-[var(--color-text-heading)] uppercase"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}
            >
              EasySchematic
            </span>
          </div>
          <div className="w-px h-4 bg-[var(--ui-border-strong)]" />
          {menuNames.map((name) => (
            <div key={name} className="relative">
              <button
                className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                  openMenu === name
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text-heading)]"
                    : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-heading)]"
                }`}
                onClick={() => setOpenMenu(openMenu === name ? null : name)}
                onMouseEnter={() => {
                  if (openMenu && openMenu !== name) setOpenMenu(name);
                }}
              >
                {name}
              </button>
              {openMenu === name && (
                <MenuDropdown items={menus[name]} onClose={closeMenu} />
              )}
            </div>
          ))}
        </div>

        {/* Center: schematic name */}
        <div className="flex-1 flex justify-center">
          {editingName ? (
            <input
              className="bg-transparent text-[var(--color-text-heading)] text-sm font-semibold outline-none border-b border-[var(--color-accent)] max-w-[200px] text-center"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") setEditingName(false);
              }}
              autoFocus
            />
          ) : (
            <span className="flex items-center gap-1.5">
              <span
                className="text-sm font-semibold text-[var(--color-text-heading)] cursor-pointer hover:text-[var(--color-accent)] transition-colors"
                onDoubleClick={() => {
                  setNameValue(schematicName);
                  setEditingName(true);
                }}
                title="Double-click to rename"
              >
                {schematicName}
              </span>
              {cloudSchematicId && (
                <span
                  title={
                    !isOnline ? "Offline — cloud sync paused" :
                    cloudSavedAt ? `Cloud saved: ${new Date(cloudSavedAt + "Z").toLocaleString()}` : "Cloud-backed schematic"
                  }
                >
                  <svg className="w-3.5 h-3.5" style={{ color: isOnline ? "var(--color-info)" : "var(--color-warning)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </span>
              )}
              {fileHandle && !cloudSchematicId && (
                <span title={`Saving to: ${fileHandle.name}`}>
                  <svg className="w-3.5 h-3.5" style={{ color: "var(--color-success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18l7-5 7 5V3H5z" />
                  </svg>
                </span>
              )}
              {!isOnline && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full uppercase"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.08em",
                    background: "var(--color-accent-soft)",
                    color: "var(--color-warning)",
                  }}
                  title="No internet connection. Editing works normally — save to your computer via File → Save."
                >
                  Offline
                </span>
              )}
            </span>
          )}
        </div>

        {/* Right: undo/redo + alignment */}
        <div className="flex items-center gap-1">
          <button
            title="Undo (Ctrl+Z)"
            disabled={undoSize === 0}
            onClick={undo}
            className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-[var(--color-text)]"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h7a3 3 0 0 1 0 6H9" />
              <path d="M6 4 3 7l3 3" />
            </svg>
          </button>
          <button
            title="Redo (Ctrl+Shift+Z)"
            disabled={redoSize === 0}
            onClick={redo}
            className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-[var(--color-text)]"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 7H6a3 3 0 0 0 0 6h1" />
              <path d="M10 4l3 3-3 3" />
            </svg>
          </button>
          <div className="w-px h-4 bg-[var(--ui-border-strong)] mx-1" />
          <AlignmentMenu />
          <div className="w-px h-4 bg-[var(--ui-border-strong)] mx-1" />
          <button
            onClick={toggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer text-[var(--color-text)]"
          >
            {isDark ? (
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="3.5" />
                <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
                <path d="M6 .278a.77.77 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
              </svg>
            )}
          </button>
          <div className="w-px h-4 bg-[var(--ui-border-strong)] mx-1" />
          <UserMenuButton />
        </div>
      </div>
      )}

      {/* Mobile header bar */}
      <div className="flex md:hidden h-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] items-center px-3 shrink-0 select-none justify-between">
        <img src="/favicon.svg" alt="" className="w-5 h-5" />
        <span className="text-sm font-semibold text-[var(--color-text-heading)] truncate mx-3 flex-1 text-center">
          {schematicName}
        </span>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text)]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile menu overlay — portalled to <body> so it escapes the desktop-only
          (display:none on phone) wrapper this MenuBar is embedded in, letting the phone
          ⋯ overflow open the full File/Edit/View/… accordion. */}
      {mobileMenuOpen && createPortal(
        <div className="fixed inset-0 z-[100] bg-[var(--color-surface)] flex flex-col">
          {/* Overlay header: undo/redo + close */}
          <div className="flex items-center justify-between px-3 h-12 border-b border-[var(--color-border)] shrink-0">
            <div className="flex items-center gap-2">
              <button
                disabled={undoSize === 0}
                onClick={undo}
                className="p-2 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--color-text)]"
              >
                <svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h7a3 3 0 0 1 0 6H9" />
                  <path d="M6 4 3 7l3 3" />
                </svg>
              </button>
              <button
                disabled={redoSize === 0}
                onClick={redo}
                className="p-2 rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--color-text)]"
              >
                <svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 7H6a3 3 0 0 0 0 6h1" />
                  <path d="M10 4l3 3-3 3" />
                </svg>
              </button>
            </div>
            <span className="text-sm font-semibold text-[var(--color-text-heading)]">Menu</span>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                className="p-2 rounded hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text)]"
              >
                {isDark ? (
                  <svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="3.5" />
                    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" className="w-5 h-5" fill="currentColor">
                    <path d="M6 .278a.77.77 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
                  </svg>
                )}
              </button>
              <button
                onClick={closeMobileMenu}
                className="p-2 rounded hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text)]"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable menu sections */}
          <div className="flex-1 overflow-y-auto">
            {menuNames.map((name) => (
              <MobileAccordionSection key={name} name={name} items={menus[name]} />
            ))}

            {/* Panels section */}
            <div className="border-b border-[var(--color-border)]">
              <div
                className="px-4 py-2 text-[10px] uppercase text-[var(--color-text-muted)]"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}
              >
                Panels
              </div>
              {[
                { key: "viewOptions", label: "View Options" },
                { key: "showInfo", label: "Show Info" },
                { key: "signalColors", label: "Signal Colors" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    closeMobileMenu();
                    setActiveMobilePanel(key);
                  }}
                  className="flex items-center w-full px-8 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors text-left"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Footer: user section */}
          <div className="border-t border-[var(--color-border)] px-4 py-3 shrink-0">
            <UserMenuButton />
          </div>
        </div>,
        document.body,
      )}

      {/* Mobile panel overlay — portalled for the same reason as the menu overlay above. */}
      {activeMobilePanel && createPortal(
        <div className="fixed inset-0 z-[100] bg-[var(--color-surface)] flex flex-col">
          {activeMobilePanel === "viewOptions" && (
            <ViewOptionsPanel mobile onClose={() => setActiveMobilePanel(null)} />
          )}
          {activeMobilePanel === "showInfo" && (
            <ShowInfoPanel mobile onClose={() => setActiveMobilePanel(null)} />
          )}
          {activeMobilePanel === "signalColors" && (
            <SignalColorPanel mobile onClose={() => setActiveMobilePanel(null)} />
          )}
        </div>,
        document.body,
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />
      <input
        ref={archiveInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportArchive}
      />

      {reportsTab && (
        <ReportsDialog initialTab={reportsTab} onClose={() => setReportsTab(null)} />
      )}
      {showTitleBlockDialog && (
        <TitleBlockDialog onClose={() => setShowTitleBlockDialog(false)} />
      )}
      <WhatsNewDialog
        open={showWhatsNew}
        onClose={() => {
          setShowWhatsNew(false);
          localStorage.setItem("easyschematic-whatsnew-v43", "1");
        }}
      />
      {showAboutDialog && (
        <AboutDialog onClose={() => setShowAboutDialog(false)} />
      )}
      {showPreferences && (
        <PreferencesDialog onClose={() => setShowPreferences(false)} />
      )}
      {showRoomDistances && (
        <RoomDistancesDialog onClose={() => setShowRoomDistances(false)} />
      )}
      {showCsvImport && (
        <CsvImportWizard onClose={() => setShowCsvImport(false)} />
      )}
      {showSchematicBrowser && (
        <SchematicBrowser onClose={() => setShowSchematicBrowser(false)} />
      )}
      <LoginDialog open={showCloudLogin} onClose={() => setShowCloudLogin(false)} />
    </div>
  );
}
