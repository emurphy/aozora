import { toast } from "sonner";

/** Result toasts for an import run, shared by the library's Import button, drag-and-drop and File → Open. */
export function reportImport({ added, duplicate, failed }: { added: number; duplicate: number; failed: string[] }): void {
  if (added) toast.success(`Imported ${added} book${added > 1 ? "s" : ""}`);
  if (duplicate) toast.info(`Skipped ${duplicate} book${duplicate > 1 ? "s" : ""} already in your library`);
  if (failed.length) toast.error(`Could not import: ${failed.join(", ")}`);
}
