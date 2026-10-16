#!/bin/sh
# Set the active player's own volume (0.0-1.0): volume.sh 0.6
# Called by the watch's volume segments through WayVR's ::ShellExec.
playerctl volume "$1"
