import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from "electron";
import type { MenuCommand } from "@/lib/types";

/**
 * macOS application menu. Windows/Linux run menu-less behind the custom title
 * bar, but on macOS the menu bar is where the standard shortcuts live: without
 * Edit roles ⌘C/⌘V/⌘A do nothing in text fields, and without the app menu ⌘Q,
 * ⌘H and ⌘, have no home.
 *
 * App-specific items don't act here; they forward a `menu:command` to the
 * focused window and the renderer (src/app.tsx) runs the same code path as the
 * equivalent in-app button.
 */

const send = (command: MenuCommand) => () => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send("menu:command", command);
};

export const buildMacMenu = (): Menu => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Settings…", accelerator: "Cmd+,", click: send("settings") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [{ label: "Open…", accelerator: "Cmd+O", click: send("open-books") }, { type: "separator" }, { role: "close" }],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        // Reload/devtools only in development: a reload drops the reader's
        // in-memory state and devtools is no use to a reader.
        ...(app.isPackaged
          ? []
          : ([{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }] as MenuItemConstructorOptions[])),
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [{ label: "Aozora on GitHub", click: () => void shell.openExternal("https://github.com/meokisama/aozora") }],
    },
  ];
  return Menu.buildFromTemplate(template);
};
