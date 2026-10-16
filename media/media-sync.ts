#!/usr/bin/env bun
// Mirrors the active MPRIS player (via playerctl) into the WayVR watch's media
// card: title, artist, time, album art, play/pause icon and the seek segments.
//
// WayVR has no media support of its own, but `wayvrctl panel-modify` can set
// text, images, colors and visibility on any element with an id. This runs as
// a background service (openrc/wayvr-media) and pushes only what changed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { wayvrSessionEnv } from "../wayvr-compat";

const HOME = homedir();
const CONFIG = process.env.XDG_CONFIG_HOME ?? join(HOME, ".config");
const CACHE = join(process.env.XDG_CACHE_HOME ?? join(HOME, ".cache"), "wayvr-media");
const THEME = join(CONFIG, "wayvr/theme/m3");
const SEGMENTS = 20;
const TICK_MS = 1000;

type Track = {
  status: string;
  title: string;
  artist: string;
  lengthUs: number;
  positionUs: number;
  artUrl: string;
  volume: number | null; // null: player doesn't expose MPRIS volume
};

const SEP = "\u001f";
let sessionEnv: Record<string, string | undefined> = process.env;

function readPlayer(): Track | null {
  const r = Bun.spawnSync([
    "playerctl", "metadata", "--format",
    ["{{status}}", "{{title}}", "{{artist}}", "{{mpris:length}}", "{{position}}", "{{mpris:artUrl}}", "{{volume}}"].join(SEP),
  ], { timeout: 3000, env: sessionEnv });
  if (r.exitCode !== 0) return null;
  const [status, title, artist, len, pos, artUrl, vol] = r.stdout.toString().trimEnd().split(SEP);
  if (!status || status === "Stopped") return null;
  return {
    status,
    title: title || "Unknown title",
    artist: artist ?? "",
    lengthUs: Number(len) || 0,
    positionUs: Number(pos) || 0,
    artUrl: artUrl ?? "",
    volume: vol ? Number(vol) : null,
  };
}

const fmt = (us: number) => {
  const s = Math.max(0, Math.floor(us / 1e6));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// Seek bar colors follow the active WayVR palette (kept in sync with the wallpaper).
let paletteCache = { mtime: 0, file: "", fill: "#9bd0cc", track: "#192120" };
function seekColors() {
  try {
    const conf = readFileSync(join(CONFIG, "wayvr/conf.d/zz-saved-config.json5"), "utf8");
    const name = JSON.parse(conf).color_palette ?? "caelestia.json";
    const file = join(CONFIG, "wayvr/palettes", name);
    const mtime = statSync(file).mtimeMs;
    if (file !== paletteCache.file || mtime !== paletteCache.mtime) {
      const p = JSON.parse(readFileSync(file, "utf8"));
      paletteCache = { mtime, file, fill: p.primary, track: p.background_variant };
    }
  } catch {
    // built-in palette or unreadable config: keep the last known colors
  }
  return paletteCache;
}

// Album art: file:// URLs are used directly; http(s) art is cached by URL hash.
// Distinct file names matter: WayVR caches images per path.
async function artPath(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("file://")) {
    const p = decodeURIComponent(url.slice(7));
    return existsSync(p) ? p : null;
  }
  if (!/^https?:\/\//.test(url)) return null;
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, createHash("sha1").update(url).digest("hex") + ".img");
  if (!existsSync(file)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
      pruneCache();
    } catch {
      return null;
    }
  }
  return file;
}

function pruneCache(keep = 40) {
  const files = readdirSync(CACHE)
    .map((f) => ({ f, t: statSync(join(CACHE, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(keep)) rmSync(join(CACHE, f), { force: true });
}

// --- pushing to WayVR -------------------------------------------------------

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
let sent = new Map<string, string>(); // "element command" -> last value
let wayvrPid = "";
let lastState = "";

function queue(lines: string[], element: string, command: string, value: string) {
  const key = `${element} ${command}`;
  if (sent.get(key) === value) return;
  sent.set(key, value);
  lines.push(`panel-modify watch ${element} ${command} ${quote(value)}`);
}

function flush(lines: string[]) {
  if (!lines.length) return;
  const r = Bun.spawnSync(["wayvrctl", "batch"], {
    stdin: Buffer.from(lines.join("\n") + "\n"),
    timeout: 5000, // never let a stuck IPC call stall the loop
  });
  if (process.env.MEDIA_DEBUG) console.log(lines.join("\n"), "\n->", r.exitCode, r.stderr.toString().trim());
  if (r.exitCode !== 0) {
    console.error(`wayvrctl failed (${r.exitCode}): ${r.stderr.toString().trim().split("\n").pop()}`);
    sent = new Map();
  } // resend everything next tick
}

async function tick() {
  // WayVR (re)started: its watch is fresh, so resend everything.
  const pid = Bun.spawnSync(["pgrep", "-xo", "wayvr"], { timeout: 2000 }).stdout.toString().trim();
  if (pid !== wayvrPid) {
    console.log(pid ? `WayVR running (pid ${pid})` : "WayVR not running");
    wayvrPid = pid;
    sent = new Map();
    sessionEnv = pid ? wayvrSessionEnv(pid) : process.env;
  }
  if (!pid) return;

  const t = readPlayer();
  const state = t ? `${t.status}: ${t.title}` : "no player";
  if (state !== lastState) console.log((lastState = state));
  const lines: string[] = [];

  if (!t) {
    queue(lines, "media_row", "set-visible", "0");
    return flush(lines);
  }

  queue(lines, "media_row", "set-visible", "1");
  queue(lines, "media_title", "set-text", t.title);
  queue(lines, "media_artist", "set-text", t.artist);
  queue(lines, "media_time", "set-text", t.lengthUs ? `${fmt(t.positionUs)} / ${fmt(t.lengthUs)}` : "");
  queue(lines, "media_play_icon", "set-image", join(THEME, t.status === "Playing" ? "pause.svg" : "play.svg"));

  const art = await artPath(t.artUrl);
  if (art) queue(lines, "media_art", "set-image", art);
  queue(lines, "media_art", "set-visible", art ? "1" : "0");
  queue(lines, "media_art_fallback", "set-visible", art ? "0" : "1");

  const { fill, track } = seekColors();
  const filled = t.lengthUs ? Math.round((t.positionUs / t.lengthUs) * SEGMENTS) : 0;
  for (let i = 0; i < SEGMENTS; i++) queue(lines, `seek_${i}`, "set-color", i < filled ? fill : track);

  // Volume: segment i stands for (i+1)/SEGMENTS, matching volume.sh's targets.
  const vol = t.volume ?? 0;
  const volFilled = Math.round(vol * SEGMENTS);
  for (let i = 0; i < SEGMENTS; i++) queue(lines, `vol_${i}`, "set-color", i < volFilled ? fill : track);
  queue(lines, "media_vol_icon", "set-image", join(THEME, vol > 0 ? "volume.svg" : "volume-off.svg"));

  flush(lines);
}

let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch (e) {
    console.error(e);
  } finally {
    running = false;
  }
}, TICK_MS);
console.log("wayvr media sync running");
