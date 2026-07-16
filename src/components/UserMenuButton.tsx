import { useState, useRef, useEffect } from "react";
import { checkSession, logout } from "../templateApi";
import { clearCache } from "../cloudCache";
import LoginDialog from "./LoginDialog";

interface User {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Up to two letters for the avatar: initials from a multi-word name, otherwise the
 * first two letters of the single word (or of the email's local part).
 */
function initials(displayName: string): string {
  const words = displayName.trim().split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function UserMenuButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkSession().then((u) => {
      setUser(u);
      setLoaded(true);
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [dropdownOpen]);

  const handleLogout = async () => {
    await logout();
    try { await clearCache(); } catch { /* IndexedDB may be unavailable */ }
    setUser(null);
    setDropdownOpen(false);
  };

  if (!loaded) return null;

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowLogin(true)}
          className="px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-heading)] rounded transition-colors cursor-pointer"
        >
          Log in
        </button>
        <LoginDialog open={showLogin} onClose={() => setShowLogin(false)} />
      </>
    );
  }

  const displayName = user.name || user.email;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-label={`Account — ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={dropdownOpen}
        title={displayName}
        className="ui-btn ui-btn-primary !p-0 w-8 h-8 !rounded-full shrink-0"
        style={{ fontSize: "11.5px", fontWeight: 700 }}
      >
        {initials(displayName)}
      </button>
      {dropdownOpen && (
        <div
          className="chrome-menu absolute right-0 mt-1 w-48 z-50"
          style={{ transformOrigin: "top right" }}
        >
          <div className="px-2.5 py-2 border-b border-[var(--ui-border)]">
            <p className="text-xs text-[var(--color-text-muted)] truncate">{user.email}</p>
          </div>
          <a
            href="https://devices.easyschematic.live"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setDropdownOpen(false)}
            className="block px-2.5 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] rounded-md transition-colors"
          >
            Device Library ↗
          </a>
          <button
            onClick={handleLogout}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)]"
            style={{ color: "var(--color-error)" }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
