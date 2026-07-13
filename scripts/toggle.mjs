#!/usr/bin/env bun
/**
 * Toggle all lights on/off — the fast path for a hotkey.
 *
 * Plain .mjs on purpose: no tsx transpile, no nested `npm run`. The runtime starts,
 * writes one line to the daemon's socket, and exits. If the daemon isn't up we fall
 * back to the TypeScript CLI, which drives the radio directly (slow, but it works).
 *
 * Runs under bun or node — no native deps, nothing bun-specific. Bind a hotkey
 * straight to this file; going through `npm run` costs several hundred ms, which
 * dwarfs any runtime difference.
 *
 * Desired state lives in a /tmp file, so it clears on reboot and the first toggle
 * after boot turns the lights ON.
 */

import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOCKET_PATH = path.join(process.env.TMPDIR ?? "/tmp", "amaran-light.sock");
const STATE_FILE = "/tmp/amaran-lights-on";

const wantOn = !fs.existsSync(STATE_FILE);
const cmd = wantOn ? "on" : "off";

function sendToDaemon(req) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH);
    let buf = "";
    let settled = false;
    const done = v => { if (!settled) { settled = true; clearTimeout(timer); socket.destroy(); resolve(v); } };
    const fail = e => { if (!settled) { settled = true; clearTimeout(timer); socket.destroy(); reject(e); } };
    const timer = setTimeout(() => fail(new Error("daemon timeout")), 15000);

    socket.on("connect", () => socket.write(JSON.stringify(req) + "\n"));
    socket.on("data", chunk => {
      buf += chunk.toString();
      const line = buf.split("\n")[0];
      if (!buf.includes("\n")) return;
      try { done(JSON.parse(line)); } catch { fail(new Error("bad daemon response")); }
    });
    socket.on("error", fail);
    socket.on("close", () => fail(new Error("daemon closed connection")));
  });
}

// Only record the new state once the command actually succeeded — otherwise the
// file drifts out of sync with the lights and every later toggle is inverted.
function recordState() {
  if (wantOn) fs.writeFileSync(STATE_FILE, "");
  else fs.rmSync(STATE_FILE, { force: true });
}

if (fs.existsSync(SOCKET_PATH)) {
  try {
    const res = await sendToDaemon({ cmd, args: [] });
    if (!res.ok) {
      console.error(`Error: ${res.error}`);
      process.exit(1);
    }
    recordState();
    console.log(`Lights ${cmd.toUpperCase()}`);
    process.exit(0);
  } catch (e) {
    console.error(`Daemon error: ${e.message} — falling back to direct BLE`);
  }
}

// No daemon (or it failed): fall back to the CLI, which drives the radio itself.
const r = spawnSync("npx", ["tsx", path.join(REPO, "src", "cli.ts"), cmd], {
  cwd: REPO,
  stdio: "inherit",
});
if (r.status !== 0) process.exit(r.status ?? 1);
recordState();
console.log(`Lights ${cmd.toUpperCase()}`);
