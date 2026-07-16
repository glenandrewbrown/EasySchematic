import { useEffect } from "react";

/* ── Landing palette ───────────────────────────────────────────────────────
   The landing page renders OUTSIDE the app's `.dark` class context (main.tsx
   mounts it standalone), so CSS theme tokens would resolve to their light
   values. To guarantee the dark "Slate × Carbon" look regardless of the
   visitor's OS theme, the marketing surface uses literal slate hexes. These
   mirror the `.dark` token values in theme.css. Only bgDeep has no token by
   design — it sits below --color-bg as the marketing-only canvas colour.      */
const C = {
  bgDeep: "#141b25", // page canvas (deep marketing bg — below --color-bg)
  surface: "#1a212d", // --color-bg
  card: "#3a4659", // --color-surface
  panel: "#3a4659", // hero-mock / brand panel (nearest role: surface)
  border: "#52617a", // --ui-border
  borderSoft: "#52617a", // hairline dividers (nearest role: --ui-border)
  borderStrong: "#76859a", // --ui-border-strong
  text: "#e8edf4", // --color-text
  textHeading: "#f9fbfd", // --color-text-heading
  textMuted: "#b6c0cd", // --color-text-muted
  textBright: "#f9fbfd", // hero H1 (nearest role: heading)
  accent: "#6fb8ff", // marketing accent (azure — Slate)
  accentInk: "#04101f", // text on accent buttons (the design's "on-accent" ink)
  accentSoft: "rgba(111,184,255,0.1)",
} as const;

/* Workspace-accent hexes for the feature-strip line icons (data, not theme).
   Mirrors the .dark[data-workspace=…] accents in theme.css. */
const FEATURE_ACCENTS = {
  schematic: "#6fb8ff",
  plan: "#35c8b2",
  schedule: "#e6b354",
  rack: "#b49cf6",
} as const;

/* Preserved enter-app path: opt out of the landing page, then load the editor.
   This is the same contract main.tsx reads in shouldShowLanding(). */
function openEditor() {
  localStorage.setItem("easyschematic-skip-landing", "1");
  window.location.href = "/";
}

/** Logo lockup: rounded tile with an accent stripe + a small node-graph glyph. */
function LogoMark() {
  return (
    <span
      style={{
        width: 27,
        height: 27,
        borderRadius: 7,
        background: C.card,
        border: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 6,
          bottom: 6,
          width: 2.5,
          borderRadius: 2,
          background: C.accent,
        }}
      />
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="6" cy="6" r="2" fill={C.textHeading} />
        <circle cx="18" cy="6" r="2" fill={C.textHeading} />
        <circle cx="12" cy="18" r="2" fill={C.accent} />
        <path
          d="M6 8v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8M12 13v3"
          stroke="#5f93c0"
          strokeWidth="1.4"
        />
      </svg>
    </span>
  );
}

interface FeatureCell {
  title: string;
  description: string;
  color: string;
  icon: React.ReactNode;
}

const FEATURES: FeatureCell[] = [
  {
    title: "Signal-flow canvas",
    description: "Color-coded wires, smart connect, auto-route.",
    color: FEATURE_ACCENTS.schematic,
    icon: (
      <>
        <rect x="3" y="4" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="15" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6.5 9v3a2 2 0 0 0 2 2h9" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
  },
  {
    title: "To-scale plans",
    description: "Room layouts, coverage, dimensions.",
    color: FEATURE_ACCENTS.plan,
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 9h6V3" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
  },
  {
    title: "Cable schedules",
    description: "Auto BOM with run-length validation.",
    color: FEATURE_ACCENTS.schedule,
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 9h18M9 9v11" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
  },
  {
    title: "Rack builder",
    description: "U-accurate elevations and pack lists.",
    color: FEATURE_ACCENTS.rack,
    icon: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 7h8M8 11h8" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
  },
];

/* Static stylised canvas mock for the hero — a small node-graph card with a
   couple of signal-coloured wires/nodes. Purely decorative. */
function HeroCanvasMock() {
  const nodeChrome: React.CSSProperties = {
    position: "absolute",
    background: C.card,
    borderRadius: 6,
  };
  return (
    <div
      style={{
        position: "relative",
        height: 300,
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        background: C.panel,
        backgroundImage:
          "radial-gradient(circle at 1px 1px,rgba(80,170,225,.09) 1px,transparent 0)",
        backgroundSize: "16px 16px",
        overflow: "hidden",
        boxShadow: "0 16px 40px -20px #000",
      }}
      aria-hidden
    >
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} fill="none">
        <path d="M120 90 H180 V80 H250" stroke="#e06aa6" strokeWidth="2" strokeDasharray="0.5 7" />
        <path d="M360 88 H410 V150 H470" stroke="#a98bf0" strokeWidth="2" strokeDasharray="0.5 7" />
        <path d="M360 110 H395 V230 H300" stroke="#cba36a" strokeWidth="2" strokeDasharray="0.5 7" />
      </svg>
      {/* source node */}
      <div style={{ ...nodeChrome, left: 50, top: 70, width: 70, border: `1px solid ${C.borderStrong}` }}>
        <div
          style={{
            height: 20,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 7px",
          }}
        >
          <span style={{ fontSize: 8, color: C.textHeading, fontWeight: 600 }}>Laptop</span>
        </div>
        <div style={{ height: 14, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 6px" }}>
          <span style={{ width: 6, height: 6, borderRadius: 2, background: "#e06aa6" }} />
        </div>
      </div>
      {/* highlighted node */}
      <div
        style={{
          ...nodeChrome,
          left: 250,
          top: 60,
          width: 110,
          border: `1px solid ${C.accent}`,
          boxShadow: "0 0 0 3px rgba(111,184,255,.14)",
        }}
      >
        <div
          style={{
            height: 20,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "0 7px",
          }}
        >
          <span style={{ fontSize: 8, color: C.textHeading, fontWeight: 600 }}>Audient ORIA</span>
          <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#3ec9a0" }} />
        </div>
        <div style={{ display: "flex" }}>
          <div
            style={{
              flex: 1,
              height: 30,
              borderRight: `1px solid ${C.borderSoft}`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4,
              padding: "0 6px",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 2, background: "#e06aa6" }} />
            <span style={{ width: 6, height: 6, borderRadius: 2, background: "#cba36a" }} />
          </div>
          <div
            style={{
              flex: 1,
              height: 30,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 4,
              padding: "0 6px",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 2, background: "#a98bf0" }} />
          </div>
        </div>
      </div>
      {/* sink node */}
      <div style={{ ...nodeChrome, left: 470, top: 128, width: 62, border: `1px solid ${C.borderStrong}` }}>
        <div
          style={{
            height: 20,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 7px",
          }}
        >
          <span style={{ fontSize: 8, color: C.textHeading, fontWeight: 600 }}>8351B</span>
        </div>
        <div style={{ height: 14, display: "flex", alignItems: "center", padding: "0 6px" }}>
          <span style={{ width: 6, height: 6, borderRadius: 2, background: "#a98bf0" }} />
        </div>
      </div>
    </div>
  );
}

const NAV_LINK: React.CSSProperties = { fontSize: 12.5, color: C.text, textDecoration: "none" };

export default function LandingPage() {
  // Override overflow:hidden from index.css so the landing page can scroll.
  useEffect(() => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    const root = document.getElementById("root");
    if (root) root.style.overflow = "auto";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      if (root) root.style.overflow = "";
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bgDeep,
        backgroundImage:
          "radial-gradient(circle at 1px 1px,rgba(80,170,225,.05) 1px,transparent 0)",
        backgroundSize: "26px 26px",
        padding: "34px 38px 80px",
        color: C.text,
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          className="landing-rise"
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            overflow: "hidden",
            background: C.surface,
            boxShadow: "0 18px 50px -26px rgba(0,20,45,.9)",
          }}
        >
          {/* ── nav ── */}
          <nav
            style={{
              height: 58,
              display: "flex",
              alignItems: "center",
              gap: 13,
              padding: "0 26px",
              borderBottom: `1px solid ${C.borderSoft}`,
              background: "rgba(12,33,56,.5)",
            }}
          >
            <LogoMark />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.textHeading }}>EasySchematic</span>
            <div style={{ marginLeft: 24, display: "flex", gap: 20 }}>
              <a href="#features" style={NAV_LINK}>
                Features
              </a>
              <a href="https://devices.easyschematic.live" style={NAV_LINK}>
                Devices
              </a>
              <a href="#pricing" style={NAV_LINK}>
                Pricing
              </a>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 11 }}>
              <button
                type="button"
                onClick={openEditor}
                style={{
                  fontSize: 12.5,
                  color: C.text,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={openEditor}
                style={{
                  height: 32,
                  padding: "0 15px",
                  background: C.accent,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: C.accentInk,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Start free
              </button>
            </div>
          </nav>

          {/* ── hero ── */}
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 30,
              padding: "56px 40px",
              alignItems: "center",
              background:
                "radial-gradient(120% 90% at 80% 10%, rgba(111,184,255,.09), transparent 55%)",
            }}
          >
            <div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 11px",
                  borderRadius: 20,
                  background: C.accentSoft,
                  border: `1px solid ${C.borderStrong}`,
                  fontSize: 11,
                  color: C.text,
                  marginBottom: 20,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
                AV signal-flow, reimagined
              </span>
              <h1
                style={{
                  margin: 0,
                  fontSize: 42,
                  lineHeight: 1.08,
                  fontWeight: 600,
                  letterSpacing: "-.03em",
                  color: C.textBright,
                }}
              >
                Design AV systems
                <br />
                at the speed of thought.
              </h1>
              <p
                style={{
                  margin: "18px 0 0",
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: "#7ba8d0",
                  maxWidth: 430,
                }}
              >
                Draw signal flow, place gear to scale, and generate cable schedules — all in one fast
                canvas. The deep technical layer is there when you need it, hidden when you don't.
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
                <button
                  type="button"
                  onClick={openEditor}
                  style={{
                    height: 42,
                    padding: "0 22px",
                    background: C.accent,
                    border: "none",
                    borderRadius: 9,
                    cursor: "pointer",
                    color: C.accentInk,
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    fontWeight: 600,
                  }}
                >
                  Open the editor
                </button>
                <a
                  href="https://docs.easyschematic.live"
                  style={{
                    height: 42,
                    padding: "0 20px",
                    background: "none",
                    border: `1px solid ${C.borderStrong}`,
                    borderRadius: 9,
                    cursor: "pointer",
                    color: "#cfe4f7",
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  Watch demo
                </a>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 26 }}>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    color: C.textMuted,
                  }}
                >
                  TRUSTED BY AV TEAMS AT
                </span>
                <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: ".04em" }}>
                  Audient · Genelec · d&amp;b
                </span>
              </div>
            </div>
            <HeroCanvasMock />
          </div>

          {/* ── feature strip ── */}
          <div
            id="features"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              borderTop: `1px solid ${C.borderSoft}`,
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                style={{
                  padding: "22px 24px",
                  borderRight: i < FEATURES.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ color: f.color, marginBottom: 11 }}
                  aria-hidden
                >
                  {f.icon}
                </svg>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textHeading, marginBottom: 4 }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>{f.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
