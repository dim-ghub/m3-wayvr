#!/bin/sh
# Seek the active player to a fraction of the track: seek.sh 0.35
# Called by the watch's seek segments through WayVR's ::ShellExec.
len_us=$(playerctl metadata mpris:length 2>/dev/null) || exit 0
[ -n "$len_us" ] || exit 0
pos=$(awk -v l="$len_us" -v f="$1" 'BEGIN { printf "%.2f", l * f / 1000000 }')
playerctl position "$pos"
