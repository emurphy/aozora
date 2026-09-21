import { ipcRenderer, type IpcRendererEvent } from "electron";
import type { MenuCommand } from "@/lib/types";

/**
 * Window control API exposed to the renderer for the custom title bar.
 */
export const windowApi = {
  /** Host OS (`process.platform`), for the few places the UI differs on macOS. */
  platform: process.platform,

  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),

  toggleFullscreen: () => ipcRenderer.send("window:toggle-fullscreen"),
  isFullscreen: () => ipcRenderer.invoke("window:is-fullscreen"),

  /** Open an http(s) URL in the user's default browser. */
  openExternal: (url: string) => ipcRenderer.invoke("window:open-external", url),

  /** Subscribe to maximize-state changes; returns an unsubscribe function. */
  onMaximizedChanged: (callback: (maximized: boolean) => void) => {
    const listener = (_event: IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximized-changed", listener);
    return () => ipcRenderer.removeListener("window:maximized-changed", listener);
  },

  /** Subscribe to fullscreen-state changes; returns an unsubscribe function. */
  onFullscreenChanged: (callback: (fullscreen: boolean) => void) => {
    const listener = (_event: IpcRendererEvent, fullscreen: boolean) => callback(fullscreen);
    ipcRenderer.on("window:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("window:fullscreen-changed", listener);
  },

  /** Subscribe to application-menu commands (macOS menu bar); returns an unsubscribe function. */
  onMenuCommand: (callback: (command: MenuCommand) => void) => {
    const listener = (_event: IpcRendererEvent, command: MenuCommand) => callback(command);
    ipcRenderer.on("menu:command", listener);
    return () => ipcRenderer.removeListener("menu:command", listener);
  },
};
