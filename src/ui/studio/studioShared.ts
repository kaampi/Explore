import type { LibrarySource } from "@library/LibrarySchema";

export function sourceCaption(source: LibrarySource | undefined, saved: boolean): string {
  if (!saved) return "example · not saved yet";
  if (source === "sillytavern") return "SillyTavern";
  if (source === "example") return "example";
  return "library";
}

export function shelfCaption(source: LibrarySource | undefined, saved: boolean, tags: string[] = []): string {
  const extra = tags.join(" · ");
  return extra ? `${sourceCaption(source, saved)} · ${extra}` : sourceCaption(source, saved);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function confirmRemove(name: string): boolean {
  return confirm(`Remove ${name} from your library?`);
}
