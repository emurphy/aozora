import { app, BrowserWindow, ipcMain, type WebContents } from "electron";
import fs from "node:fs";
import { allowUserFile } from "./library.js";
import { isBookFileName, type PickedFile } from "@/lib/types";

/**
 * Books macOS hands to the app: double-click / Open With in Finder, or a file
 * dropped on the Dock icon. `open-file` can fire before the app is ready (a cold
 * launch by double-click) and before the renderer has subscribed, so paths queue
 * here until the renderer announces it is listening (`library:open-files-ready`).
 * The renderer then runs them through the ordinary import (see src/app.tsx).
 */

const pending: string[] = [];
let listener: WebContents | null = null;

function flush(): void {
  if (!listener || listener.isDestroyed() || !pending.length) return;
  const files: PickedFile[] = [];
  for (const p of pending.splice(0)) {
    if (!isBookFileName(p) || !fs.existsSync(p)) continue;
    files.push(allowUserFile(p));
  }
  if (files.length) listener.send("library:open-files", files);
}

/** Must run at startup, before `ready`, so a cold-launch `open-file` isn't missed. */
export const registerOpenFiles = (createWindow: () => void): void => {
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    pending.push(filePath);
    // All windows closed but the app still running (normal on macOS): bring one
    // back; its renderer picks the queue up once it subscribes.
    if (app.isReady() && BrowserWindow.getAllWindows().length === 0) createWindow();
    flush();
  });

  ipcMain.on("library:open-files-ready", (event) => {
    listener = event.sender;
    event.sender.once("destroyed", () => {
      if (listener === event.sender) listener = null;
    });
    flush();
  });
};
