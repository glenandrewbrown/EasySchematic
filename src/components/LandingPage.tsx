import { useEffect } from "react";
import { sponsors } from "../sponsors";

const features = [
  {
    title: "Drag-and-drop device library",
    description:
      "2,000+ professional AV templates: cameras, switchers, routers, consoles, media servers, and displays. Drop a device and connect it in seconds.",
  },
  {
    title: "Pack lists & cable schedules",
    description:
      "Generate paperwork straight from the schematic: pack lists, cable schedules with signal types and cable IDs. No separate spreadsheets.",
  },
  {
    title: "Rack builder",
    description:
      "Drag devices into rack elevations with front, rear, and side views. Racks stay linked to the schematic, so edits sync both ways.",
  },
  {
    title: "Export to DXF, PDF & PNG",
    description:
      "DXF for AutoCAD and Vectorworks, PDF for print, PNG for decks. Configurable page sizes and title blocks built for integration shops.",
  },
  {
    title: "Room grouping",
    description:
      "Organize devices into rooms, racks, and nested groups: control rooms, stages, OB trucks, and equipment closets.",
  },
  {
    title: "Community device database",
    description:
      "Browse and contribute real-world device templates with accurate port layouts and connector specs. Open REST API included.",
  },
];

const useCases = [
  {
    heading: "Broadcast & live production",
    text: "Map SDI, NDI, and MADI signal paths through cameras, switchers, multiviewers, and routers. Document entire OB trucks and control rooms.",
  },
  {
    heading: "AV integration & install",
    text: "Design hook-up sheets, system block diagrams, and AV schematics for conference rooms, auditoriums, and venues. Export DXF for CAD workflows.",
  },
  {
    heading: "Event & rental",
    text: "Plan signal flow for live events, rental packages, and temporary installs. Share schematics with your crew via link.",
  },
];

const marqueeSignals = [
  { name: "SDI", color: "var(--color-sdi)" },
  { name: "HDMI", color: "var(--color-hdmi)" },
  { name: "NDI", color: "var(--color-ndi)" },
  { name: "Dante", color: "var(--color-dante)" },
  { name: "AES67", color: "var(--color-aes)" },
  { name: "MADI", color: "var(--color-madi)" },
  { name: "DMX", color: "var(--color-dmx)" },
  { name: "HDBaseT", color: "var(--color-hdbaset)" },
  { name: "Analog Audio", color: "var(--color-analog-audio)" },
  { name: "ST 2110", color: "var(--color-sdi)" },
  { name: "USB", color: "var(--color-usb)" },
  { name: "Ethernet", color: "var(--color-ethernet)" },
  { name: "Fiber", color: "var(--color-fiber)" },
  { name: "DisplayPort", color: "var(--color-displayport)" },
  { name: "Genlock", color: "var(--color-genlock)" },
  { name: "Timecode", color: "var(--color-timecode)" },
  { name: "MIDI", color: "var(--color-midi)" },
  { name: "sACN", color: "var(--color-sacn)" },
  { name: "Thunderbolt", color: "var(--color-thunderbolt)" },
  { name: "Word Clock", color: "var(--color-wordclock)" },
];

function openEditor() {
  localStorage.setItem("easyschematic-skip-landing", "1");
  window.location.href = "/";
}

function SignalPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-800 bg-slate-900/80 text-sm font-medium text-slate-200 whitespace-nowrap">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

/* Miniature of the editor's actual device-node rendering: two device cards
   joined by orthogonal, signal-colored cables. Built from the same visual
   vocabulary the canvas uses, so the preview stays truthful. */
function MiniSchematic() {
  const port = (color: string) => (
    <span className="w-2 h-2 rounded-full border border-slate-500 shrink-0" style={{ backgroundColor: color }} />
  );
  return (
    <div className="relative select-none" aria-hidden>
      <svg viewBox="0 0 440 220" className="w-full h-auto">
        {/* cables: orthogonal, like the A* router draws them */}
        <path d="M150 62 H210 V58 H290" fill="none" stroke="var(--color-sdi)" strokeWidth="2.5" />
        <path d="M150 92 H196 V104 H290" fill="none" stroke="var(--color-dante)" strokeWidth="2.5" />
        <path d="M150 122 H182 V150 H290" fill="none" stroke="var(--color-ndi)" strokeWidth="2.5" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-between">
        {/* source device */}
        <div className="w-[34%] rounded-lg border border-slate-600 bg-slate-900 shadow-xl shadow-slate-950/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-700 bg-slate-800">
            <p className="text-[11px] font-bold text-slate-100 leading-tight">Camera 1</p>
            <p className="text-[9px] text-slate-400">Cinema Camera</p>
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center justify-end gap-1.5 text-[9px] text-slate-300">SDI Out {port("var(--color-sdi)")}</div>
            <div className="flex items-center justify-end gap-1.5 text-[9px] text-slate-300">Audio {port("var(--color-dante)")}</div>
            <div className="flex items-center justify-end gap-1.5 text-[9px] text-slate-300">NDI {port("var(--color-ndi)")}</div>
          </div>
        </div>
        {/* destination device */}
        <div className="w-[34%] rounded-lg border border-slate-600 bg-slate-900 shadow-xl shadow-slate-950/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-700 bg-slate-800">
            <p className="text-[11px] font-bold text-slate-100 leading-tight">Switcher</p>
            <p className="text-[9px] text-slate-400">Production Switcher</p>
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center gap-1.5 text-[9px] text-slate-300">{port("var(--color-sdi)")} In 1</div>
            <div className="flex items-center gap-1.5 text-[9px] text-slate-300">{port("var(--color-dante)")} In 2</div>
            <div className="flex items-center gap-1.5 text-[9px] text-slate-300">{port("var(--color-ndi)")} In 3</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  // Override overflow:hidden from index.css so landing page can scroll
  useEffect(() => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    document.getElementById("root")!.style.overflow = "auto";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.getElementById("root")!.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      style={{ overflow: "auto", fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
    >
      {/* Nav */}
      <nav className="border-b border-slate-800/80 sticky top-0 z-40 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="w-8 h-8 rounded-lg" />
            <span className="text-base font-bold tracking-tight text-white">EasySchematic</span>
          </span>
          <div className="hidden sm:flex items-center gap-6 text-sm text-slate-400">
            <a href="https://docs.easyschematic.live" className="hover:text-white transition-colors">Docs</a>
            <a href="https://devices.easyschematic.live" className="hover:text-white transition-colors">Devices</a>
            <a href="https://github.com/duremovich/EasySchematic" className="hover:text-white transition-colors">GitHub</a>
            <button
              onClick={openEditor}
              className="bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer"
            >
              Open Editor
            </button>
          </div>
        </div>
      </nav>

      {/* Hero: asymmetric split, screenshot carries the right side */}
      <header className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-20 lg:pt-20 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 landing-rise">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.05] text-white mb-5">
              AV Signal Flow Diagram Tool
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-md">
              Design signal flow schematics for broadcast, live production, and AV integration. Free and browser-based.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={openEditor}
                className="bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-semibold px-7 py-3 rounded-lg text-base transition-all cursor-pointer"
              >
                Open Editor
              </button>
              <a
                href="https://devices.easyschematic.live"
                className="text-slate-300 hover:text-white font-medium px-2 py-3 transition-colors"
              >
                Browse the device library
              </a>
            </div>
          </div>
          <div className="lg:col-span-7 landing-rise-delay">
            <div className="relative">
              <div
                className="absolute -inset-6 rounded-3xl opacity-30 blur-3xl"
                style={{
                  background:
                    "radial-gradient(40% 50% at 30% 40%, rgba(37,99,235,0.5), transparent), radial-gradient(40% 50% at 70% 60%, rgba(22,163,74,0.35), transparent)",
                }}
                aria-hidden
              />
              <img
                src="/landing-screenshot.png"
                alt="EasySchematic editor showing a signal flow diagram with Thunderbolt, HDMI, SDI, and USB connections between Mac Studios, adapters, video wall controllers, and converters"
                className="relative w-full rounded-xl ring-1 ring-slate-700/80 shadow-2xl shadow-slate-950/80"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Stat band */}
      <section className="border-y border-slate-800/80 bg-slate-900/40">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-y-8">
          {[
            { value: "2,000+", label: "device templates" },
            { value: "68", label: "color-coded signal types" },
            { value: "DXF, PDF, PNG", label: "export formats" },
            { value: "$0", label: "no account required" },
          ].map((stat, i) => (
            <div key={stat.label} className={`px-2 lg:px-8 ${i > 0 ? "lg:border-l lg:border-slate-800" : ""}`}>
              <p className="text-2xl md:text-3xl font-bold text-white tracking-tight">{stat.value}</p>
              <p className="text-sm text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Signal type marquee */}
      <section className="py-14 overflow-hidden" aria-label="Supported signal types">
        <h2 className="text-center text-xl font-bold text-white mb-8 px-6">
          Every signal type in your AV system, color-coded
        </h2>
        <div className="relative">
          <div className="landing-marquee gap-3 px-3">
            <div className="flex gap-3">
              {marqueeSignals.map((s) => (
                <SignalPill key={s.name} name={s.name} color={s.color} />
              ))}
            </div>
            <div className="flex gap-3" aria-hidden>
              {marqueeSignals.map((s) => (
                <SignalPill key={`${s.name}-dup`} name={s.name} color={s.color} />
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-slate-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-slate-950 to-transparent" />
        </div>
        <p className="text-center text-sm text-slate-500 mt-8 px-6">
          48 more, from AES50 to Word Clock. Recolor any of them per project.
        </p>
      </section>

      {/* Smart routing: split feature with live-style preview */}
      <section className="border-t border-slate-800/80">
        <div className="max-w-6xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-14 items-center">
          <div className="order-2 lg:order-1 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:p-10">
            <MiniSchematic />
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-3xl font-bold tracking-tight text-white mb-4">
              Connections that route themselves
            </h2>
            <p className="text-slate-400 leading-relaxed mb-6 max-w-lg">
              Click a port, click a destination. Pathfinding routes every cable around devices with clean
              orthogonal lines, parallel spacing, and crossing arcs. When you want control, drop waypoints
              and route it by hand.
            </p>
            <ul className="space-y-3 text-slate-300">
              <li className="flex gap-3">
                <span className="text-blue-400 font-bold shrink-0">01</span>
                Snap-to-port connecting with live compatibility checks
              </li>
              <li className="flex gap-3">
                <span className="text-blue-400 font-bold shrink-0">02</span>
                Automatic adapter insertion between mismatched connectors
              </li>
              <li className="flex gap-3">
                <span className="text-blue-400 font-bold shrink-0">03</span>
                Cable IDs, lengths, and labels tracked for the cable schedule
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Feature grid: hairline rows, no cards */}
      <section className="border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-12 max-w-xl">
            Everything you need to document a system
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
            {features.map((f) => (
              <div key={f.title} className="border-t border-slate-800 pt-5">
                <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases: definition rows */}
      <section className="border-t border-slate-800/80">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight text-white mb-12">
            Built for AV professionals
          </h2>
          <div className="divide-y divide-slate-800">
            {useCases.map((uc) => (
              <div key={uc.heading} className="grid md:grid-cols-12 gap-3 md:gap-8 py-7">
                <h3 className="md:col-span-4 text-lg font-semibold text-white">{uc.heading}</h3>
                <p className="md:col-span-8 text-slate-400 leading-relaxed max-w-2xl">{uc.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sponsors */}
      <section className="border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto px-6 py-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-6">
            Supported by
          </p>
          <div className="flex justify-center gap-8">
            {sponsors.filter((s) => s.kind === "organization").map((s) => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" title={s.name}>
                <img src={s.logo} alt={s.name} className="h-14 rounded-lg opacity-90 hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
          {sponsors.some((s) => s.kind === "individual") && (
            <p className="text-sm text-slate-500 mt-6">
              {sponsors.filter((s) => s.kind === "individual").map((s) => s.name).join(", ")}
            </p>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800/80">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
            Start drawing your signal flow
          </h2>
          <p className="text-slate-400 mb-9 max-w-md mx-auto">
            No signup required. Your work is saved locally in your browser.
          </p>
          <button
            onClick={openEditor}
            className="bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-semibold px-8 py-3.5 rounded-lg text-lg transition-all cursor-pointer"
          >
            Open Editor
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 text-slate-400 text-sm">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap gap-x-8 gap-y-3 justify-center">
          <a href="https://docs.easyschematic.live" className="hover:text-white transition-colors">Documentation</a>
          <a href="https://devices.easyschematic.live" className="hover:text-white transition-colors">Device Database</a>
          <a href="https://github.com/duremovich/EasySchematic" className="hover:text-white transition-colors">GitHub</a>
          <a href="https://discord.gg/dxXn3Jk2a6" className="hover:text-white transition-colors">Discord</a>
          <a href="mailto:support@easyschematic.live" className="hover:text-white transition-colors">Support</a>
        </div>
      </footer>
    </div>
  );
}
