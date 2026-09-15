import aozoraBunko from "@/assets/aozora-bunko.jpg";
import bookTemplate from "@/assets/book-template.png";
import { bookFormat, type Book } from "@/lib/types";

/**
 * Stand-in art for a book with no cover of its own. Aozora Bunko text files
 * never carry one, so they get the archive's jacket rather than the generic
 * template.
 */
export function coverPlaceholder(book: Pick<Book, "filePath">): string {
  return bookFormat(book.filePath) === "txt" ? aozoraBunko : bookTemplate;
}
