import { useSchematicStore } from "../store";
import PrintSheetToolbar from "./PrintSheetToolbar";
import PrintSheetSidebar from "./PrintSheetSidebar";
import PrintSheetRenderer from "./PrintSheetRenderer";
import type { PrintSheetPage as PrintSheetPageType } from "../types";

export default function PrintSheetPage() {
  const activePage = useSchematicStore((s) => s.activePage);
  const pages = useSchematicStore((s) => s.pages);

  const page = pages.find((p) => p.id === activePage);
  if (!page || page.type !== "print-sheet") return null;

  const sheetPage = page as PrintSheetPageType;

  return (
    <div className="flex flex-1 overflow-hidden flex-col bg-[var(--color-bg)]">
      <PrintSheetToolbar page={sheetPage} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <PrintSheetSidebar page={sheetPage} />
        <PrintSheetRenderer page={sheetPage} />
      </div>
    </div>
  );
}
