const { app, BrowserWindow, session, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Fixed port so the origin (http://127.0.0.1:38217) — and therefore
// localStorage/IndexedDB data — stays stable across launches and updates.
const PORT = 38217;
const HOST = "127.0.0.1";
const DIST = path.join(__dirname, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  let filePath = path.normalize(path.join(DIST, pathname));
  // Keep requests inside dist/ (blocks ../ traversal)
  if (!filePath.startsWith(DIST + path.sep) && filePath !== DIST) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    stat = null;
  }
  if (!stat || stat.isDirectory()) {
    // SPA fallback — mirrors the Cloudflare single-page-application setting
    filePath = path.join(DIST, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath)
    .on("error", () => {
      res.writeHead(500);
      res.end("Read error");
    })
    .pipe(res);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(serveStatic);
    server.once("error", reject);
    server.listen(PORT, HOST, () => resolve(server));
  });
}

/**
 * Builds the `?liveControl=…` query the app consumes (once) into localStorage to
 * auto-connect to Claude live control. The token is read from the environment or
 * a local, gitignored `live-control-token.txt` next to this file — never baked
 * into the shared web bundle, so the public/beta build stays token-free. Absent
 * token → empty string → the app loads exactly as before.
 */
function liveControlQuery() {
  let token = (process.env.EASYS_CONTROL_TOKEN || "").trim();
  if (!token) {
    try {
      token = fs.readFileSync(path.join(__dirname, "live-control-token.txt"), "utf8").trim();
    } catch {
      token = "";
    }
  }
  return token ? `?liveControl=1&liveControlToken=${encodeURIComponent(token)}` : "";
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    title: "EasySchematic",
    backgroundColor: "#0f172a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links (docs, devices site, Discord, OAuth) in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://${HOST}:${PORT}`)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://${HOST}:${PORT}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(`http://${HOST}:${PORT}/${liveControlQuery()}`);
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    // The web app registers a PWA service worker that precaches all assets.
    // In the desktop wrapper that cache outlives bundle swaps and keeps
    // serving stale builds, so purge SW + HTTP caches on every launch.
    // localStorage / IndexedDB (user schematics) are NOT touched.
    try {
      await session.defaultSession.clearStorageData({
        storages: ["serviceworkers", "cachestorage"],
      });
    } catch (err) {
      console.error("Cache purge failed (continuing):", err);
    }
    try {
      await startServer();
    } catch (err) {
      // EADDRINUSE from a stale instance: the page still loads from the
      // already-running server, so continue and just open the window.
      if (err.code !== "EADDRINUSE") {
        console.error("Local server failed to start:", err);
        app.quit();
        return;
      }
    }
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
