import { useState } from "react";
import { requestLogin } from "../templateApi";

const API_URL =
  import.meta.env?.VITE_TEMPLATE_API_URL ?? "https://api.easyschematic.live";

interface Props {
  open: boolean;
  onClose: () => void;
}

const BRAND_FEATURES = [
  "2,400+ device library",
  "One-click cable schedules",
  "Schematic, plan & rack views",
];

export default function LoginDialog({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setSending(true);
    setError("");
    try {
      await requestLogin(trimmed, window.location.href);
      setSentEmail(trimmed);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send login link");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setEmail("");
    setSent(false);
    setSentEmail("");
    setError("");
    onClose();
  };

  const startGoogle = () => {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${API_URL}/auth/google/start?returnTo=${returnTo}`;
  };

  return (
    <div className="ui-dialog-backdrop z-[9999]" onClick={handleClose}>
      <div
        className="ui-dialog w-[760px] max-w-[94vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid sm:grid-cols-2">
          {/* ── left brand pane (hidden on narrow viewports) ── */}
          <div
            className="hidden sm:flex flex-col p-10 border-r"
            style={{
              borderColor: "var(--ui-border)",
              background: "var(--color-surface)",
              backgroundImage:
                "radial-gradient(circle at 1px 1px,rgba(80,170,225,.08) 1px,transparent 0)",
              backgroundSize: "18px 18px",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="relative flex items-center justify-center"
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 7,
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--ui-border)",
                }}
              >
                <span
                  className="absolute left-0"
                  style={{ top: 6, bottom: 6, width: 2.5, borderRadius: 2, background: "var(--color-accent)" }}
                />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="6" cy="6" r="2" fill="var(--color-text-heading)" />
                  <circle cx="18" cy="6" r="2" fill="var(--color-text-heading)" />
                  <circle cx="12" cy="18" r="2" fill="var(--color-accent)" />
                </svg>
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--color-text-heading)" }}>
                EasySchematic
              </span>
            </div>
            <div className="my-auto">
              <div
                className="font-semibold leading-tight max-w-[300px]"
                style={{ fontSize: 23, color: "var(--color-text-heading)", letterSpacing: "-.02em" }}
              >
                Your AV systems, beautifully documented.
              </div>
              <div className="flex flex-col gap-3 mt-6">
                {BRAND_FEATURES.map((feat) => (
                  <span
                    key={feat}
                    className="flex items-center gap-2.5 text-xs"
                    style={{ color: "var(--color-text)" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M5 12l5 5 9-11"
                        stroke="#3ec9a0"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── right form pane ── */}
          <div className="p-8 sm:p-10 flex flex-col justify-center" style={{ background: "var(--color-surface-raised)" }}>
            <div className="w-full max-w-[300px] mx-auto">
              {sent ? (
                <div className="text-center">
                  <div className="text-xl font-semibold" style={{ color: "var(--color-text-heading)" }}>
                    Check your email
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
                    We sent a login link to <strong>{sentEmail}</strong>. Click it to log in, then come
                    back here.
                  </p>
                  <p className="text-xs mt-3" style={{ color: "var(--color-text-muted)", opacity: 0.85 }}>
                    Don't see it? Check your spam folder. Some corporate email systems may block it —{" "}
                    <button
                      type="button"
                      onClick={startGoogle}
                      className="underline cursor-pointer"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      try Google sign-in instead
                    </button>
                    .
                  </p>
                  <button onClick={handleClose} className="ui-btn ui-btn-secondary w-full mt-6">
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-xl font-semibold" style={{ color: "var(--color-text-heading)" }}>
                    Sign in
                  </div>
                  <div className="text-xs mt-1.5 mb-6" style={{ color: "var(--color-text-muted)" }}>
                    Welcome back. Continue to your projects.
                  </div>

                  <button
                    type="button"
                    onClick={startGoogle}
                    className="ui-btn ui-btn-secondary w-full h-[42px] flex items-center justify-center gap-2 mb-[18px]"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </button>

                  <div className="flex items-center gap-3 mb-[18px]">
                    <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
                    <span className="text-[10.5px]" style={{ color: "var(--color-text-muted)" }}>
                      or
                    </span>
                    <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
                  </div>

                  <label className="flex flex-col gap-1.5 mb-3">
                    <span className="text-[10.5px]" style={{ color: "var(--color-text-muted)" }}>
                      Email
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                      placeholder="you@example.com"
                      className="ui-input w-full h-10"
                      autoFocus
                    />
                  </label>
                  {error && <p className="text-xs mb-3 text-red-500">{error}</p>}

                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="ui-btn ui-btn-primary w-full h-[42px] disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Email me a magic link"}
                  </button>

                  <div className="text-center text-[11.5px] mt-[18px]" style={{ color: "var(--color-text-muted)" }}>
                    New here? The magic link signs you in or creates your account.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
