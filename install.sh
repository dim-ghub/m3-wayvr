#!/usr/bin/env bash
# Installs the Material 3 Expressive "Caelestia drawer" theme into ~/.config/wayvr.
#
#   ./install.sh                       # layouts + palette synced to your Caelestia wallpaper
#   ./install.sh --preset teal dark    # layouts + a fixed preset palette, no sync
#   ./install.sh --uninstall
#
# The watcher is an OpenRC user service on OpenRC systems (Artix, Gentoo),
# otherwise a systemd user path unit.
#
# Restart WayVR afterwards (`wayvr --replace`); layouts and shape settings are read at startup.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/wayvr"
THEME_DIR="$CONF_ROOT/theme"
PALETTE_DIR="$CONF_ROOT/palettes"
CONF_D="$CONF_ROOT/conf.d"
DROPIN="$CONF_D/m3-expressive.yaml"
SAVED="$CONF_D/zz-saved-config.json5"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNITS=(wayvr-caelestia-sync.path wayvr-caelestia-sync.service)
RC_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/rc/init.d"
RC_SVC=wayvr-caelestia-sync

if command -v rc-service >/dev/null && [[ -d /run/openrc ]]; then
  INIT=openrc
elif command -v systemctl >/dev/null && systemctl --user show-environment >/dev/null 2>&1; then
  INIT=systemd
else
  INIT=none
fi
LAYOUTS=(gui/watch.xml gui/keyboard.xml gui/toast.xml m3/fillet-left.svg m3/fillet-right.svg
         m3/play.svg m3/pause.svg m3/skip-previous.svg m3/skip-next.svg m3/music-note.svg m3/blank.png m3/volume.svg m3/volume-off.svg
         m3/fillet-bottom-left.svg m3/fillet-bottom-right.svg)
RC_MEDIA=wayvr-media

# The layouts' corner radii are written for this multiplier (r_panel 14 -> 28px).
ROUND_MULTIPLIER=2.0
GRADIENT_INTENSITY=0.0   # M3 surfaces are flat tonal fills

if [[ "${1:-}" == "--uninstall" ]]; then
  if [[ $INIT == openrc ]]; then
    rc-service --user "$RC_SVC" stop 2>/dev/null || true
    rc-update --user del "$RC_SVC" default 2>/dev/null || true
    rm -fv "$RC_DIR/$RC_SVC"
    rc-service --user "$RC_MEDIA" stop 2>/dev/null || true
    rc-update --user del "$RC_MEDIA" default 2>/dev/null || true
    rm -fv "$RC_DIR/$RC_MEDIA"
  elif [[ $INIT == systemd ]]; then
    systemctl --user disable --now wayvr-caelestia-sync.path 2>/dev/null || true
    for u in "${UNITS[@]}"; do rm -fv "$UNIT_DIR/$u"; done
    systemctl --user daemon-reload
  fi
  for f in "${LAYOUTS[@]}"; do rm -fv "$THEME_DIR/$f"; done
  rm -fv "$PALETTE_DIR"/m3-expressive-*.json "$PALETTE_DIR/caelestia.json" "$DROPIN"
  echo "Removed. If an M3 palette is still selected in the dashboard, pick another one there."
  exit 0
fi

if [[ "${1:-}" == "--preset" ]]; then
  PALETTE="m3-expressive-${2:-violet}-${3:-dark}.json"
  if [[ ! -f "$HERE/palettes/$PALETTE" ]]; then
    echo "No such palette: $PALETTE" >&2
    ls "$HERE/palettes" | sed 's/^m3-expressive-//; s/\.json$//; s/-/ /; s/^/  /' >&2
    exit 1
  fi
  SYNC=0
else
  PALETTE="caelestia.json"
  SYNC=1
  SCHEME="${XDG_STATE_HOME:-$HOME/.local/state}/caelestia/scheme.json"
  [[ -f "$SCHEME" ]] || { echo "Caelestia scheme not found at $SCHEME (use --preset instead)" >&2; exit 1; }
  command -v bun >/dev/null || { echo "bun is required for the wallpaper sync" >&2; exit 1; }
fi

# Layouts
for f in "${LAYOUTS[@]}"; do
  mkdir -p "$(dirname "$THEME_DIR/$f")"
  # Back up files that aren't ours (ours carry the "Material 3 Expressive" header or are fillets)
  if [[ -f "$THEME_DIR/$f" ]] && ! cmp -s "$HERE/theme/$f" "$THEME_DIR/$f" \
     && [[ $f == gui/* ]] && ! grep -q "Material 3 Expressive" "$THEME_DIR/$f"; then
    cp "$THEME_DIR/$f" "$THEME_DIR/$f.bak"
    echo "Backed up your existing $f to $f.bak"
  fi
  cp "$HERE/theme/$f" "$THEME_DIR/$f"
done
# The seek segments call media/seek.sh from this checkout
sed -i "s#@REPO@#$HERE#g" "$THEME_DIR/gui/watch.xml"
echo "Installed layouts into $THEME_DIR"

# WayVR doesn't tell layouts about the 12h setting, so bake it into the watch.
# conf.d files load alphabetically and later ones win, like WayVR does.
CLOCK_12H=$(python3 - "$CONF_D" <<'PY'
import json, pathlib, re, sys
value = False
for f in sorted(pathlib.Path(sys.argv[1]).glob("*")):
    text = f.read_text(errors="ignore")
    if f.suffix in (".json", ".json5"):
        try:
            value = json.loads(text).get("clock_12h", value)
        except ValueError:
            pass
    else:
        m = re.search(r"^clock_12h:\s*(true|false)\s*$", text, re.M)
        if m:
            value = m.group(1) == "true"
print("1" if value else "0")
PY
)
# toast.xml carries label ids for both WayVR generations; empty labels still
# take a line of height, so keep only the pair the installed binary fills in.
WAYVR_BIN=$(command -v wayvr || true)
if [[ -n $WAYVR_BIN ]] && ! grep -qa on_success "$WAYVR_BIN"; then
  sed -i '/id="label_title"\|id="label_body"/d' "$THEME_DIR/gui/toast.xml"   # 26.8.0 and older
else
  sed -i '/id="toast_title"\|id="toast_body"/d' "$THEME_DIR/gui/toast.xml"
fi

if [[ $CLOCK_12H == 1 ]]; then
  sed -i 's#<var key="hour_fmt" value="[^"]*" />#<var key="hour_fmt" value="%I" />#; s#<var key="ampm_display" value="[^"]*" />#<var key="ampm_display" value="flex" />#' "$THEME_DIR/gui/watch.xml"
  echo "Watch clock: 12-hour"
else
  echo "Watch clock: 24-hour"
fi

# Palettes
mkdir -p "$PALETTE_DIR" "$CONF_D"
cp "$HERE"/palettes/m3-expressive-*.json "$PALETTE_DIR/"
if (( SYNC )); then
  (cd "$HERE" && [[ -d node_modules ]] || bun install --silent)
  bun "$HERE/sync-caelestia.ts"

  case $INIT in
    openrc)
      mkdir -p "$RC_DIR"
      sed "s#@REPO@#$HERE#g" "$HERE/openrc/$RC_SVC" > "$RC_DIR/$RC_SVC"
      chmod +x "$RC_DIR/$RC_SVC"
      rc-update --user add "$RC_SVC" default
      rc-service --user "$RC_SVC" restart
      echo "Wallpaper sync enabled (rc-service --user $RC_SVC status)"
      ;;
    systemd)
      mkdir -p "$UNIT_DIR"
      cp "$HERE/systemd/wayvr-caelestia-sync.path" "$UNIT_DIR/"
      sed "s#@REPO@#$HERE#g" "$HERE/systemd/wayvr-caelestia-sync.service" > "$UNIT_DIR/wayvr-caelestia-sync.service"
      systemctl --user daemon-reload
      systemctl --user enable --now wayvr-caelestia-sync.path
      echo "Wallpaper sync enabled (systemctl --user status wayvr-caelestia-sync.path)"
      ;;
    *)
      echo "No OpenRC or systemd user session found. Keep the palette in sync by autostarting:"
      echo "  bun $HERE/sync-caelestia.ts --watch"
      ;;
  esac
fi

# Media card on the watch
if command -v playerctl >/dev/null; then
  (cd "$HERE" && [[ -d node_modules ]] || bun install --silent)
  if [[ $INIT == openrc ]]; then
    mkdir -p "$RC_DIR"
    sed "s#@REPO@#$HERE#g" "$HERE/openrc/$RC_MEDIA" > "$RC_DIR/$RC_MEDIA"
    chmod +x "$RC_DIR/$RC_MEDIA"
    rc-update --user add "$RC_MEDIA" default
    rc-service --user "$RC_MEDIA" restart
    echo "Media sync enabled (rc-service --user $RC_MEDIA status)"
  else
    echo "Autostart the watch's media sync with:  bun $HERE/media/media-sync.ts"
  fi
else
  echo "playerctl not found: the watch's media card stays hidden"
fi

cat > "$DROPIN" <<EOF
# Material 3 Expressive theme for WayVR (installed by m3-wayvr/install.sh)
color_palette: "$PALETTE"
ui_round_multiplier: $ROUND_MULTIPLIER
ui_gradient_intensity: $GRADIENT_INTENSITY
EOF
echo "Wrote $DROPIN"

# The dashboard saves its settings to zz-saved-config.json5, which loads after
# every other conf.d file and would override the drop-in. Update it in place.
if [[ -f "$SAVED" ]]; then
  cp "$SAVED" "$CONF_ROOT/zz-saved-config.json5.bak"   # outside conf.d, or WayVR tries to load it
  python3 - "$SAVED" "$PALETTE" "$ROUND_MULTIPLIER" "$GRADIENT_INTENSITY" <<'PY'
import json, sys
path, palette, rnd, grad = sys.argv[1:]
with open(path) as f:
    cfg = json.load(f)
cfg.update(color_palette=palette, ui_round_multiplier=float(rnd), ui_gradient_intensity=float(grad))
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PY
  echo "Updated $SAVED (backup: $CONF_ROOT/zz-saved-config.json5.bak)"
fi

echo
echo "Done. Restart WayVR to apply:  wayvr --replace"
