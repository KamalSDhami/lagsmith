const GIB = 1024 ** 3;

/** Bytes as GB with one decimal place, for example "12.2 GB". */
export function formatGB(bytes: number): string {
  return `${(bytes / GIB).toFixed(1)} GB`;
}

/** Installed RAM is sold in whole sizes, so show "8 GB" rather than "8.0 GB". */
export function formatRam(bytes: number): string {
  return `${Math.round(bytes / GIB)} GB`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Local calendar date as YYYY-MM-DD, without timezone shifts. */
export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "Good morning" / "Good afternoon" / "Good evening" from the local clock. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

/** "Windows 11 Pro 26H2" -> "Windows 11". Falls back to the full name. */
export function shortOs(os: string): string {
  const m = os.match(/^(Microsoft\s+)?(Windows\s+\d+)/i);
  return m ? m[2] : os;
}

/** "Intel(R) UHD Graphics 620" -> "Intel UHD 620" for the compact card value. */
export function shortGpuName(name: string): string {
  return name
    .replace(/\((R|TM|C)\)/gi, "")
    .replace(/\bGraphics\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

