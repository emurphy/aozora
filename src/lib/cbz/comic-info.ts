import { xmlParser } from "@/lib/epub/opf";

export interface ComicInfo {
  title: string;
  author: string;
  language: string;
  /** Direction from `<Manga>`; null when absent or "Unknown" (caller decides). */
  rtl: boolean | null;
}

// fast-xml-parser coerces numeric text ("3") to a number, so every field is cast.
const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value).trim());

/**
 * Reads the fields Aozora shows from ComicInfo.xml, the metadata sidecar most
 * CBZ files ship. Title falls back to "Series Number", the form scanlation
 * archives use when they leave Title empty.
 */
export function parseComicInfo(xml: string): ComicInfo | null {
  let info;
  try {
    info = xmlParser.parse(xml)?.ComicInfo;
  } catch {
    return null;
  }
  if (!info || typeof info !== "object") return null;

  const manga = text(info.Manga);
  return {
    title: text(info.Title) || [text(info.Series), text(info.Number)].filter(Boolean).join(" "),
    author: text(info.Writer) || text(info.Penciller) || "",
    language: text(info.LanguageISO),
    rtl: manga === "YesAndRightToLeft" ? true : manga === "No" ? false : null,
  };
}
