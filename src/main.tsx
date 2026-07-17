import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
// Self-hosted IBM Plex (the "engineering instrument" type system) — bundled so the
// exact fonts load offline in the PWA + desktop app, with no CDN dependency.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { initServiceWorkerUpdates } from "./sw-register";

initServiceWorkerUpdates();

const App = lazy(() => import("./App.tsx"));

function Root() {
  return (
    <ReactFlowProvider>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </ReactFlowProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);
