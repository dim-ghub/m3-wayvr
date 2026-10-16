#!/usr/bin/env bun
// Converts Caelestia's wallpaper-derived scheme into a WayVR palette.
//
//   bun sync-caelestia.ts            # write ~/.config/wayvr/palettes/caelestia.json
//   bun sync-caelestia.ts --print    # print the palette instead
//   bun sync-caelestia.ts --watch    # sync now, then again on every scheme change
//
// install.sh keeps it running on wallpaper changes: an OpenRC user service
// runs --watch (openrc/), or a systemd path unit runs one-shot syncs (systemd/).

import {
  argbFromHex,
  Blend,
  hexFromArgb,
  TonalPalette,
} from "@material/material-color-utilities";
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { forInstalledWayvr, wayvrSessionEnv } from "./wayvr-compat";

const HOME = homedir();
const STATE = process.env.XDG_STATE_HOME ?? join(HOME, ".local/state");
const CONFIG = process.env.XDG_CONFIG_HOME ?? join(HOME, ".config");

const SCHEME_PATH = join(STATE, "caelestia/scheme.json");
const PALETTE_PATH = join(CONFIG, "wayvr/palettes/caelestia.json");

// Same source green as generate.ts; harmonized toward the wallpaper's primary.
const SUCCESS_SOURCE = "#2E9E4F";

type Scheme = { mode: "dark" | "light"; colours: Record<string, string> };

function toPalette({ mode, colours }: Scheme) {
  const c = (role: string) => {
    const v = colours[role];
    if (!v) throw new Error(`scheme.json is missing "${role}"`);
    return `#${v.toLowerCase()}`;
  };
  const dark = mode !== "light";
  const hex = (argb: number) => hexFromArgb(argb).toLowerCase();

  const success = TonalPalette.fromInt(Blend.harmonize(argbFromHex(SUCCESS_SOURCE), argbFromHex(c("primary"))));
  // wgui uses `tertiary` as the hover fill for every Button and keyboard key,
  // so it needs to be a container tone (like Caelestia's tonal buttons), not
  // the near-white accent tone Caelestia's tertiary role often is.
  const tertiary = TonalPalette.fromInt(argbFromHex(c("tertiaryPaletteKeyColor")));

  return {
    primary: c("primary"),
    on_primary: c("onPrimary"),
    secondary: c("secondary"),
    on_secondary: c("onSecondary"),
    tertiary: hex(tertiary.tone(dark ? 30 : 90)),
    on_tertiary: hex(tertiary.tone(dark ? 90 : 10)),
    success: hex(success.tone(dark ? 80 : 40)),
    on_success: hex(success.tone(dark ? 20 : 100)),
    danger: c("error"),
    on_danger: c("onError"),
    // Concept A surface stack: panel blob = surface, cards = surfaceContainer,
    // buttons/keys = surfaceContainerHigh.
    background: c("surfaceContainer"),
    on_background: c("onSurface"),
    background_variant: c("surfaceContainerHigh"),
    on_background_variant: c("onSurfaceVariant"),
    background_contrast: c("surface"),
    on_background_contrast: c("onSurface"),
    outline: c("outlineVariant"),
    shadow: c("shadow"),
    highlight: dark ? "#ffffff" : "#000000",
  };
}

function render(): { scheme: Scheme; json: string } {
  const scheme: Scheme = JSON.parse(readFileSync(SCHEME_PATH, "utf8"));
  return { scheme, json: JSON.stringify(forInstalledWayvr(toPalette(scheme)), null, 2) + "\n" };
}

function sync() {
  const { scheme, json } = render();
  const previous = existsSync(PALETTE_PATH) ? readFileSync(PALETTE_PATH, "utf8") : null;
  if (previous === json) return;

  mkdirSync(dirname(PALETTE_PATH), { recursive: true });
  const tmp = `${PALETTE_PATH}.tmp`;
  writeFileSync(tmp, json);
  renameSync(tmp, PALETTE_PATH);
  console.log(`Wrote ${PALETTE_PATH} (${scheme.mode}, #${scheme.colours.primary})`);

  // WayVR has no IPC to reload a palette, so tell the user. WayVR mirrors desktop
  // notifications into VR as toasts, so this reaches them in the headset too.
  const pid = Bun.spawnSync(["pgrep", "-xo", "wayvr"]).stdout.toString().trim();
  if (previous !== null && pid) {
    Bun.spawnSync([
      "notify-send", "-a", "WayVR", "-i", "wayvr",
      "WayVR colors updated",
      "Re-pick “caelestia.json” in Dashboard › Settings › Color palette, or restart WayVR.",
    ], { env: wayvrSessionEnv(pid) });
  }
}

if (process.argv.includes("--print")) {
  process.stdout.write(render().json);
} else if (process.argv.includes("--watch")) {
  const trySync = () => {
    try {
      sync();
    } catch (e) {
      // Caelestia may be mid-write; the next change event retries.
      console.error(`sync failed: ${e instanceof Error ? e.message : e}`);
    }
  };
  trySync();

  // Watch the directory, not the file: a replace-by-rename would orphan a file watch.
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(dirname(SCHEME_PATH), (_event, file) => {
    if (file !== "scheme.json") return;
    clearTimeout(timer);
    timer = setTimeout(trySync, 300);
  });
  console.log(`Watching ${SCHEME_PATH}`);
} else {
  sync();
}
