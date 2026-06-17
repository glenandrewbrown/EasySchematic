import { useSchematicStore } from "../store";
import type { Toast } from "../store";

const iconByType: Record<Toast["type"], string> = {
  error: "⚠",    // ⚠
  success: "✓",  // ✓
  info: "ℹ",     // ℹ
};

const toastClasses: Record<Toast["type"], { bg: string; border: string; icon: string }> = {
  error:   { bg: "bg-red-500/10",   border: "border-red-500/30",   icon: "text-red-600 dark:text-red-400" },
  success: { bg: "bg-green-500/10", border: "border-green-500/30", icon: "text-green-600 dark:text-green-400" },
  info:    { bg: "bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]",  border: "border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)]",  icon: "text-[var(--color-accent)]" },
};

export default function ToastContainer() {
  const toasts = useSchematicStore((s) => s.toasts);
  const removeToast = useSchematicStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const cls = toastClasses[t.type];
        return (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            className={`flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] border shadow-[var(--ui-shadow-menu)] backdrop-blur-sm text-[var(--color-text)] text-[13px] leading-snug cursor-pointer ${cls.bg} ${cls.border}`}
            style={{ animation: "toast-in 0.2s ease-out" }}
          >
            <span className={`${cls.icon} text-base leading-none shrink-0 mt-px`}>
              {iconByType[t.type]}
            </span>
            <span>{t.message}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
