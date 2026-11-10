// The TTY look's palette: KiiteShell's TTY ink (fixed, near-black neutrals
// tinted toward teal, like a terminal scheme) with the wallpaper's accents on
// top. Shared by sync-caelestia.ts --tty and generate.ts.

// crates/kiiteshell-common/src/look.rs `ink`, plus its fixed error red
export const INK = {
  ground: "#0b0e0d",
  raised: "#0f1312", // wells
  row: "#16211f", // a hovered row
  border: "#2f3a37",
  text: "#cfd8d5",
  bright: "#e7eeec",
  variant: "#9aa6a2",
  error: "#e5838a",
};

export type Accents = { primary: string; secondary: string; success: string };

export function ttyPalette({ primary, secondary, success }: Accents) {
  return {
    primary,
    on_primary: INK.ground,
    secondary,
    on_secondary: INK.ground,
    // wgui paints every Button and key hover with tertiary and its text with
    // on_tertiary: TTY's hovered row, its text brightened
    tertiary: INK.row,
    on_tertiary: INK.bright,
    success,
    on_success: INK.ground,
    danger: INK.error,
    on_danger: INK.ground,
    // one ground everywhere: borders divide, not tones
    background: INK.ground,
    on_background: INK.text,
    background_variant: INK.raised,
    on_background_variant: INK.variant,
    background_contrast: INK.ground,
    on_background_contrast: INK.text,
    outline: INK.border,
    shadow: "#000000",
    // the border a pressed key flashes
    highlight: primary,
  };
}
