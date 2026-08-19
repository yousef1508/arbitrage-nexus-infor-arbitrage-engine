export function slugify(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function makeReportSlug(title: string, assetId: string): string {
  const cleanTitle = slugify(title || "intelligence-report");
  const cleanId = String(assetId || crypto.randomUUID()).replace(/^asset-/, "").slice(0, 8);
  return `${cleanTitle}-${cleanId}`;
}

export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function xmlEscape(input: unknown): string {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function absoluteUrl(origin: string, path: string): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanOrigin}${cleanPath}`;
}

export function safeIso(timestamp?: number): string {
  const value = typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(value).toISOString();
}

export function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function shortText(input: unknown, max = 240): string {
  const text = String(input ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}