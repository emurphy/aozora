import { BlobWriter, TextWriter, type Entry } from "@zip.js/zip.js";
import path from "path-browserify";
import { getManifestItems, type OpfContents } from "./opf";
import { locateOpf } from "./locate-opf";

export interface ExtractedEpub {
  contents: OpfContents;
  /** Every file the package references, keyed by its manifest href. */
  result: Record<string, string | Blob>;
}

/**
 * Fully unzips an EPUB: reads container.xml → the OPF, then every manifest item.
 * Image items are returned as Blobs, text items (XHTML/CSS/NCX) as strings.
 */
export async function extractEpub(fileMap: Map<string, Entry>): Promise<ExtractedEpub> {
  const { contents, opfPath, opfXml } = await locateOpf(fileMap);

  const contentsDirectory = path.dirname(opfPath);
  const result: Record<string, string | Blob> = { [opfPath]: opfXml };

  await Promise.all(
    getManifestItems(contents).map(async (item) => {
      const href = item["@_href"];
      const entry = fileMap.get(path.join(contentsDirectory, href)) || fileMap.get(href);
      if (!entry || entry.directory || !entry.getData) return;

      const mediaType = item["@_media-type"] || "";
      result[href] = mediaType.startsWith("image/") ? await entry.getData<Blob>(new BlobWriter(mediaType)) : await entry.getData(new TextWriter());
    }),
  );

  return { contents, result };
}
