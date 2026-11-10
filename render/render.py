#!/usr/bin/env python3
"""Renders the layouts to transparent PNGs in renders/.

Uses WayVR's uidev testbed with render/uidev-offscreen.patch applied (against
WayVR v26.8.0). The patch adds an offscreen mode that draws the layout into an
image and saves it as a PNG (uidev still opens a window for a moment to get a
Vulkan device), loads .json palettes, and reads ROUND (ui_round_multiplier).

    git clone --branch v26.8.0 https://github.com/wayvr-org/wayvr && cd wayvr
    git apply /path/to/m3-wayvr/render/uidev-offscreen.patch
    for d in edit icons keyboard watch; do cp -rn wayvr/src/assets/$d uidev/assets/; done
    cargo build -p uidev
    UIDEV=$PWD/target/debug/uidev python3 /path/to/m3-wayvr/render/render.py
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "renders"
UIDEV = os.environ.get("UIDEV") or sys.exit("set UIDEV to the patched uidev binary")
SCALE = os.environ.get("RENDER_SCALE", "2")
MARGIN = 24  # px of transparent border kept around the trimmed render

# (output name, layout, palette, look); "caelestia" = palette synced from the current wallpaper
SHOTS = [
    ("watch", "watch", "caelestia", "m3"),
    ("keyboard", "keyboard", "caelestia", "m3"),
    ("toast", "toast", "caelestia", "m3"),
    ("watch-violet", "watch", "m3-expressive-violet-dark.json", "m3"),
    ("watch-coral", "watch", "m3-expressive-coral-dark.json", "m3"),
    ("tty-watch", "watch", "caelestia", "tty"),
    ("tty-keyboard", "keyboard", "caelestia", "tty"),
    ("tty-toast", "toast", "caelestia", "tty"),
    ("tty-watch-violet", "watch", "tty-violet.json", "tty"),
]
# the corner multiplier each look's installer sets
ROUND = {"m3": "2.0", "tty": "0.0"}


def trim(path: Path):
    """Drop the layouts' built-in padding (tooltip/gaze room), keep a small margin."""
    img = Image.open(path)
    content = img.crop(img.getchannel("A").getbbox())
    out = Image.new("RGBA", (content.width + 2 * MARGIN, content.height + 2 * MARGIN), (0, 0, 0, 0))
    out.paste(content, (MARGIN, MARGIN))
    out.save(path)


def main():
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        themes, caelestia = {}, {}
        for look in ROUND:
            themes[look] = tmp / f"theme-{look}"
            flag = ["--tty"] if look == "tty" else []
            subprocess.run([sys.executable, ROOT / "render/prepare.py", themes[look], *flag], check=True, stdout=subprocess.DEVNULL)
            caelestia[look] = tmp / f"caelestia-{look}.json"
            caelestia[look].write_bytes(subprocess.check_output(["bun", ROOT / "sync-caelestia.ts", "--print", *flag]))

        for name, layout, palette, look in SHOTS:
            out = OUT / f"{name}.png"
            theme = themes[look]
            pal = caelestia[look] if palette == "caelestia" else ROOT / "palettes" / palette
            env = dict(os.environ, TESTBED=f"gui/{layout}.xml", PALETTE=str(pal), ROUND=ROUND[look],
                       RENDER_PNG=str(out), RENDER_SCALE=SCALE, RUST_LOG="error")
            subprocess.run([UIDEV], cwd=theme, env=env, check=True, timeout=60,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            trim(out)
            print(out.relative_to(ROOT), Image.open(out).size)


if __name__ == "__main__":
    main()
