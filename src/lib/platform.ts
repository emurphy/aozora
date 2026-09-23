/**
 * Host-OS checks for the renderer. The preload exposes `process.platform`; it is
 * absent in tests (jsdom, no preload), which then read as not-macOS.
 */
export const isMac = (): boolean => typeof window !== "undefined" && window.electronAPI?.window?.platform === "darwin";

/** Display names for the Alt/Ctrl modifiers: macOS calls Alt "Option". */
export const altKeyLabel = (): string => (isMac() ? "Option" : "Alt");
export const ctrlKeyLabel = (): string => (isMac() ? "Control" : "Ctrl");
