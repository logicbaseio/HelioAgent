const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");

const HELIO_PORT = process.env.HELIO_PORT || "5050";
const HELIO_URL = `http://127.0.0.1:${HELIO_PORT}/dashboard`;
const INSTALLER_URL = process.env.HELIO_INSTALLER_URL || "https://get.helio.bot/install.sh";

let mainWindow;
let logLines = [];
let agentStarted = false;

function addLog(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logLines.push(line);
  logLines = logLines.slice(-80);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("helio-log", line);
  }
}

function statusHtml() {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Helio Agent</title>
        <style>
          body { margin:0; background:#050705; color:#d8d8d8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
          .wrap { min-height:100vh; display:flex; flex-direction:column; justify-content:center; padding:42px; box-sizing:border-box; }
          h1 { color:#caff3d; letter-spacing:8px; font-size:28px; margin:0 0 14px; }
          p { color:#8f968a; line-height:1.6; max-width:760px; }
          pre { background:#020302; border:1px solid #29331a; padding:18px; min-height:220px; overflow:auto; color:#66f28a; white-space:pre-wrap; }
          .bar { width:320px; height:8px; background:#13170f; overflow:hidden; border:1px solid #29331a; margin:20px 0; }
          .bar:before { content:""; display:block; width:38%; height:100%; background:#caff3d; animation:pulse 1s infinite linear alternate; }
          @keyframes pulse { from { transform:translateX(-40%); } to { transform:translateX(210%); } }
          button { background:#caff3d; color:#020302; border:0; padding:10px 16px; font-weight:800; letter-spacing:2px; cursor:pointer; margin-right:8px; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>HELIO AGENT</h1>
          <p>Starting the local autonomous SEO + AEO/GEO agent. Helio will install or update the local runtime, start the dashboard and worker, then load the dashboard inside this app.</p>
          <div class="bar"></div>
          <div>
            <button onclick="location.reload()">RETRY VIEW</button>
            <button onclick="location.href='${HELIO_URL}'">OPEN DASHBOARD</button>
          </div>
          <pre id="log">${logLines.join("\n")}</pre>
        </div>
        <script>
          const { ipcRenderer } = require("electron");
          ipcRenderer.on("helio-log", (_event, line) => {
            const el = document.getElementById("log");
            el.textContent += (el.textContent ? "\\n" : "") + line;
            el.scrollTop = el.scrollHeight;
          });
        </script>
      </body>
    </html>`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Helio Agent",
    backgroundColor: "#050705",
    webPreferences: {
      partition: "persist:helio-agent",
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(statusHtml())}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function runShell(command) {
  return new Promise((resolve, reject) => {
    addLog(command);
    const child = spawn("/bin/bash", ["-lc", command], {
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}` },
    });
    child.stdout.on("data", (data) => addLog(String(data).trim()));
    child.stderr.on("data", (data) => addLog(String(data).trim()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}: ${command}`));
    });
  });
}

function waitForDashboard(timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(HELIO_URL, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error("Timed out waiting for Helio dashboard."));
      else setTimeout(tick, 1600);
    };
    tick();
  });
}

async function startHelioAgent() {
  if (agentStarted) return;
  agentStarted = true;
  try {
    addLog("Preparing Helio local agent runtime.");
    await runShell(`curl -fsSL ${INSTALLER_URL} | bash`);
    await runShell("helio start --no-open");
    addLog("Waiting for local dashboard.");
    await waitForDashboard();
    addLog(`Opening ${HELIO_URL}`);
    await mainWindow.loadURL(HELIO_URL);
  } catch (error) {
    addLog(`ERROR: ${error.message}`);
    dialog.showErrorBox("Helio Agent failed to start", `${error.message}\n\nOpen Terminal and run: helio doctor`);
  }
}

app.whenReady().then(() => {
  createWindow();
  startHelioAgent();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
