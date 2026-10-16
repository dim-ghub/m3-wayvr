#!/usr/bin/env python3
"""Builds render-only copies of the layouts for screenshots.

WayVR's uidev testbed renders layout XML on the desktop, but it has no live
data: batteries, clock, media, keys and toast text are all filled in by WayVR
at runtime. This writes copies of theme/ with static sample data for
render.py to render.

    python3 render/prepare.py OUT_DIR
"""

import re
import shutil
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent


def sample_art(path: Path):
    """Abstract placeholder cover (no real album art in the repo)."""
    size = 256
    img = Image.new("RGB", (size, size), "#173a3f")
    d = ImageDraw.Draw(img)
    d.ellipse((-60, 90, 190, 340), fill="#2f7f7a")
    d.ellipse((110, -70, 330, 150), fill="#d5efff")
    d.ellipse((70, 70, 200, 200), fill="#9bd0cc")
    img.filter(ImageFilter.GaussianBlur(18)).save(path)


def watch(xml: str, out: Path) -> str:
    xml = xml.replace("@REPO@", str(ROOT))
    # 12-hour clock, as installed for a clock_12h user
    xml = re.sub(r'<var key="hour_fmt" value="[^"]*" />', '<var key="hour_fmt" value="%I" />', xml)
    xml = re.sub(r'<var key="ampm_display" value="[^"]*" />', '<var key="ampm_display" value="flex" />', xml)
    xml = xml.replace('text="23" _source="clock"', 'text="09" _source="clock"')
    # batteries: pass a static percentage through the device templates
    xml = re.sub(r'<label _source="battery" _device="\$\{idx\}"', '<label text="${pct}"', xml)
    xml = re.sub(r'<Device idx="\$\{idx\}" icon="', '<Device idx="${idx}" pct="${pct}" icon="', xml)
    for tag, pct in (("Hmd", "82%"), ("LeftHand", "64%"), ("RightHand", "71%"), ("Tracker", "93%")):
        xml = xml.replace(f'<{tag} idx="', f'<{tag} pct="{pct}" idx="')
    # media card
    xml = xml.replace('text="Nothing playing"', 'text="Night Drive"')
    xml = xml.replace('<label id="media_artist" text=""', '<label id="media_artist" text="Aurora Lane"')
    xml = xml.replace('<label id="media_time" text=""', '<label id="media_time" text="1:24 / 3:52"')
    xml = xml.replace('src="m3/blank.png"', f'src="{out / "sample-art.png"}"')
    xml = xml.replace('id="media_art_fallback"', 'id="media_art_fallback" display="none"')
    xml = xml.replace('id="media_play_icon" width="20" height="20" src="m3/play.svg"',
                      'id="media_play_icon" width="20" height="20" src="m3/pause.svg"')
    # progress: seek 35%, volume 70%
    xml = xml.replace('id="seek_${i}" width="7" height="5" round="100%" color="background_variant"',
                      'id="seek_${i}" width="7" height="5" round="100%" color="${c}"')
    xml = xml.replace('id="vol_${i}" width="7" height="5" round="100%" color="background_variant"',
                      'id="vol_${i}" width="7" height="5" round="100%" color="${c}"')
    xml = re.sub(r'<Seek i="(\d+)"', lambda m: f'<Seek c="{"primary" if int(m[1]) < 7 else "background_variant"}" i="{m[1]}"', xml)
    xml = re.sub(r'<Vol i="(\d+)"', lambda m: f'<Vol c="{"primary" if int(m[1]) < 14 else "background_variant"}" i="{m[1]}"', xml)
    return xml


ROWS = [
    [("KeyOther", "Esc", 1)] + [("KeySymbol", c, 1) for c in "1234567890"] + [("KeySpecial", "backspace", 2)],
    [("KeySpecial", "tab", 1.5)] + [("KeyLetter", c, 1) for c in "qwertyuiop"] + [("KeySymbol", "\\", 1.5)],
    [("KeyOther", "Caps", 1.75)] + [("KeyLetter", c, 1) for c in "asdfghjkl"] + [("KeySpecial", "return", 2.25)],
    [("KeySpecial", "shift", 2.25)] + [("KeyLetter", c, 1) for c in "zxcvbnm"] + [("KeySymbol", ",", 1), ("KeySymbol", ".", 1), ("KeySpecial", "up", 1), ("KeySpecial", "shift", 1.75)],
    [("KeyOther", "Ctrl", 1.5), ("KeySpecial", "super", 1.25), ("KeyOther", "Alt", 1.25), ("KeyOther", "", 6.25),
     ("KeyOther", "Alt", 1.25), ("KeySpecial", "left", 1), ("KeySpecial", "down", 1), ("KeySpecial", "right", 1)],
]
SHIFTED = dict(zip("1234567890\\,.", "!@#$%^&*()|<>"))


def keyboard(xml: str) -> str:
    rows = []
    for r, row in enumerate(ROWS):
        keys = []
        for c, (tpl, text, units) in enumerate(row):
            attr = lambda v: escape(v, {'"': "&quot;"})
            shift = f' text_shift="{attr(SHIFTED.get(text, ""))}"' if tpl == "KeySymbol" else ""
            keys.append(f'<{tpl} id="k{r}_{c}" text="{attr(text)}"{shift} width="{units * 60:g}" height="60" />')
        rows.append('        <div flex_direction="row">' + "".join(keys) + "</div>")
    xml = xml.replace('<rectangle id="keyboard_root" color="background_contrast" round="~r_panel" flex_direction="column" padding="12">\n      </rectangle>',
                      '<rectangle id="keyboard_root" color="background_contrast" round="~r_panel" flex_direction="column" padding="12">\n'
                      + "\n".join(rows) + "\n      </rectangle>")
    xml = xml.replace('<div id="panels_root" gap="6" align_items="center">\n            </div>',
                      '<div id="panels_root" gap="6" align_items="center"><Screen idx="0" display="D1" name="DP-1" /><Screen idx="1" display="D2" name="DP-2" /><Screen idx="2" display="D3" name="DP-3" /></div>')
    xml = xml.replace('<div id="sets_root" flex_direction="row" gap="6" align_items="center">\n              </div>',
                      '<div id="sets_root" flex_direction="row" gap="6" align_items="center"><Set idx="0" display="1" /><Set idx="1" display="2" /></div>')
    xml = xml.replace('text="23:59" _source="clock"', 'text="9:41 PM" _source="clock"')
    return xml


def toast(xml: str) -> str:
    xml = re.sub(r'\s*<label[^>]*id="label_(title|body)"[^>]*/>', "", xml)
    xml = xml.replace('id="toast_title"', 'id="toast_title" text="WayVR colors updated"')
    xml = xml.replace('id="toast_body"', 'id="toast_body" text="Re-pick caelestia.json in Dashboard › Settings › Color palette, or restart WayVR."')
    return xml


def main():
    out = Path(sys.argv[1]).resolve()
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(ROOT / "theme", out)
    sample_art(out / "sample-art.png")
    gui = out / "gui"
    (gui / "watch.xml").write_text(watch((gui / "watch.xml").read_text(), out))
    (gui / "keyboard.xml").write_text(keyboard((gui / "keyboard.xml").read_text()))
    (gui / "toast.xml").write_text(toast((gui / "toast.xml").read_text()))
    print(out)


if __name__ == "__main__":
    main()
