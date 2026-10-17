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

# Hyprland runs autostart commands before it exports WAYLAND_DISPLAY, so a
# watcher started at login inherits it empty. WayVR would then find no
# compositor, fall back to X11 capture, and ask the desktop portal for every
# display. Look the socket up when launching instead of trusting our env.
wayland_socket() {
    if [ -n "$HYPRLAND_INSTANCE_SIGNATURE" ] && command -v hyprctl >/dev/null; then
        sock=$(hyprctl -j instances 2>/dev/null | tr -d '\n' \
            | grep -o "\"instance\": \"$HYPRLAND_INSTANCE_SIGNATURE\"[^}]*" \
            | sed -n 's/.*"wl_socket": "\([^"]*\)".*/\1/p')
        [ -n "$sock" ] && { echo "$sock"; return; }
    fi
    [ -n "$WAYLAND_DISPLAY" ] && { echo "$WAYLAND_DISPLAY"; return; }
    # Generic fallback: the lowest-numbered compositor socket. Single digits
    # only; WayVR's own nested compositor uses wayland-20.
    for s in "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"/wayland-[0-9]; do
        [ -S "$s" ] && { basename "$s"; return; }
    done
}

# Only one watcher per session
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/wayvr-steamvr.lock"
flock -n 9 || exit 0

while :; do
    if pgrep -x vrcompositor >/dev/null; then
        # Give SteamVR a moment to finish starting before attaching to it
        sleep 5
        if pgrep -x vrcompositor >/dev/null && ! pgrep -x wayvr >/dev/null; then
            sock=$(wayland_socket)
            echo "$(date '+%F %T') SteamVR detected, starting WayVR on ${sock:-no Wayland socket}" >>"$LOG"
            WAYLAND_DISPLAY="$sock" wayvr --openvr >>"$LOG" 2>&1 &
        fi
        # Don't relaunch if you close WayVR mid-session; re-arm once SteamVR exits
        while pgrep -x vrcompositor >/dev/null; do sleep 5; done
    fi
    sleep 3
done
