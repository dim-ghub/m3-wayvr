#!/usr/bin/env bun
// Generates Material 3 Expressive color palettes for WayVR.
//
// Uses Google's material-color-utilities with the 2025 color spec
// (the one that backs M3 Expressive) and the Expressive scheme variant,
// then maps M3 color roles onto WayVR's 19 wgui palette slots.
//
// Usage:
//   bun generate.ts                         # rebuild the bundled presets
//   bun generate.ts --seed "#3F51B5" --name indigo [--contrast 0.5]
//
// Requires bun (the library ships extensionless ESM imports that node rejects).

import {
  argbFromHex,
  Blend,
  hexFromArgb,
  Hct,
  SchemeExpressive,
  TonalPalette,
  type DynamicScheme,
} from "@material/material-color-utilities";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { forInstalledWayvr } from "./wayvr-compat";

const PRESETS: Record<string, string> = {
  violet: "#6750A4", // M3 baseline seed
  blue: "#0061A4",
  teal: "#006A6A",
  coral: "#E8613C",
};

// M3 has no "success" role, so derive one from a green that is harmonized
// (hue-shifted) toward the seed, the same way M3 treats custom colors.
const SUCCESS_SOURCE = "#2E9E4F";

const hex = (argb: number) => hexFromArgb(argb).toLowerCase();

function wayvrPalette(seed: string, isDark: boolean, contrast: number) {
  const seedArgb = argbFromHex(seed);
  const s: DynamicScheme = new SchemeExpressive(Hct.fromInt(seedArgb), isDark, contrast, "2025");

  const success = TonalPalette.fromInt(Blend.harmonize(argbFromHex(SUCCESS_SOURCE), seedArgb));

  // Accents keep Expressive's hue rotation and chroma (they come from the
  // scheme's tonal palettes) but use the classic M3 key tones. The 2025 spec
  // pushes some dark-theme accents close to white (e.g. cyan primaries at
  // tone ~98), which WayVR can't use since it paints accents as fills and borders.
  const accent = (p: TonalPalette) => hex(p.tone(isDark ? 80 : 40));
  const onAccent = (p: TonalPalette) => hex(p.tone(isDark ? 20 : 100));

  // Surface hierarchy. WayVR panels float in 3D space, so they sit on
  // surface_container; buttons/cards (background_variant) step one level
  // toward the viewer, and background_contrast (keyboard, dashboard frame)
  // steps away from it.
  return {
    primary: accent(s.primaryPalette),
    on_primary: onAccent(s.primaryPalette),
    secondary: accent(s.secondaryPalette),
    on_secondary: onAccent(s.secondaryPalette),
    tertiary: accent(s.tertiaryPalette),
    on_tertiary: onAccent(s.tertiaryPalette),
    success: accent(success),
    on_success: onAccent(success),
    danger: accent(s.errorPalette),
    on_danger: onAccent(s.errorPalette),
    background: hex(s.surfaceContainer),
    on_background: hex(s.onSurface),
    background_variant: hex(isDark ? s.surfaceContainerHighest : s.surfaceContainerLowest),
    on_background_variant: hex(s.onSurfaceVariant),
    // surface_dim rather than surface_container_lowest in dark: the 2025 spec
    // makes the latter pure black, which flattens the keyboard into the void.
    background_contrast: hex(isDark ? s.surfaceDim : s.surfaceContainerHighest),
    on_background_contrast: hex(s.onSurface),
    outline: hex(s.outlineVariant),
    shadow: hex(s.shadow),
    // Used at low opacity for hover state layers, like M3's on_surface overlay.
    highlight: isDark ? "#ffffff" : "#000000",
  };
}

function write(outDir: string, name: string, seed: string, contrast: number) {
  for (const isDark of [true, false]) {
    const file = `m3-expressive-${name}-${isDark ? "dark" : "light"}.json`;
    const palette = forInstalledWayvr(wayvrPalette(seed, isDark, contrast));
    writeFileSync(join(outDir, file), JSON.stringify(palette, null, 2) + "\n");
    console.log(`${file}  (seed ${seed})`);
  }
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const outDir = join(import.meta.dir, "palettes");
mkdirSync(outDir, { recursive: true });

const seed = arg("--seed");
const contrast = Number(arg("--contrast") ?? 0);
if (Number.isNaN(contrast) || contrast < -1 || contrast > 1) {
  throw new Error("--contrast must be between -1 and 1");
}

if (seed) {
  if (!/^#[0-9a-fA-F]{6}$/.test(seed)) throw new Error(`--seed must look like #RRGGBB, got ${seed}`);
  write(outDir, arg("--name") ?? seed.slice(1).toLowerCase(), seed, contrast);
} else {
  for (const [name, presetSeed] of Object.entries(PRESETS)) write(outDir, name, presetSeed, contrast);
}
