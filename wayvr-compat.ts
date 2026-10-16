// WayVR's palette loader rejects unknown fields, and the field set changed:
// releases up to 26.8.0 have no `success`/`on_success`, later builds require them.
// Detect which one is installed by looking for the field name in the binary.

let cached: boolean | undefined;

export function wayvrSupportsSuccess(): boolean {
  if (cached === undefined) {
    const bin = Bun.which("wayvr");
    // No WayVR found: assume a current build.
    cached = bin ? Bun.spawnSync(["grep", "-qa", "on_success", bin]).exitCode === 0 : true;
  }
  return cached;
}

export function forInstalledWayvr<T extends Record<string, string>>(palette: T): Partial<T> {
  if (wayvrSupportsSuccess()) return palette;
  const { success: _s, on_success: _o, ...rest } = palette;
  return rest as Partial<T>;
}

// The OpenRC user `dbus` service runs its own bus at $XDG_RUNTIME_DIR/bus, but
// desktop apps (media players, the notification daemon) may live on the bus
// the graphical session started. WayVR runs inside that session, so borrow its
// address; that's also the bus WayVR's own ::ShellExec buttons use.
export function wayvrSessionEnv(pid: string): Record<string, string | undefined> {
  try {
    const environ = require("node:fs").readFileSync(`/proc/${pid}/environ`, "utf8") as string;
    const bus = environ.split("\0").find((kv) => kv.startsWith("DBUS_SESSION_BUS_ADDRESS="));
    if (bus) return { ...process.env, DBUS_SESSION_BUS_ADDRESS: bus.slice(bus.indexOf("=") + 1) };
  } catch {
    // process gone or unreadable
  }
  return process.env;
}
