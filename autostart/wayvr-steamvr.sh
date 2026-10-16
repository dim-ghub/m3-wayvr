#!/bin/sh
# Starts WayVR whenever SteamVR comes up (e.g. when you plug in the headset).
#
# Runs from your Hyprland session rather than from SteamVR, so WayVR inherits
# your Wayland/D-Bus environment. WayVR's own `--install` autolaunch starts it
# from SteamVR instead, which its --help warns can cause issues.
#
# Launch once per login, e.g. in ~/.config/hypr/hyprland/execs.lua:
#   hl.exec_cmd("~/Projects/m3-wayvr/autostart/wayvr-steamvr.sh")

LOG="${XDG_RUNTIME_DIR:-/tmp}/wayvr-steamvr.log"

# Only one watcher per session
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/wayvr-steamvr.lock"
flock -n 9 || exit 0

while :; do
    if pgrep -x vrcompositor >/dev/null; then
        # Give SteamVR a moment to finish starting before attaching to it
        sleep 5
        if pgrep -x vrcompositor >/dev/null && ! pgrep -x wayvr >/dev/null; then
            echo "$(date '+%F %T') SteamVR detected, starting WayVR" >>"$LOG"
            wayvr --openvr >>"$LOG" 2>&1 &
        fi
        # Don't relaunch if you close WayVR mid-session; re-arm once SteamVR exits
        while pgrep -x vrcompositor >/dev/null; do sleep 5; done
    fi
    sleep 3
done
