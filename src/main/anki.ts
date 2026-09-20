import { ipcMain } from "electron";
import type { AnkiEndpoint, AnkiNote, AnkiTestResult, AnkiAddResult, AnkiModelSpec, AnkiModelResult } from "@/lib/types";

/**
 * AnkiConnect IPC. The renderer owns the mining config and builds a note's
 * fields from its templates; the main process is a stateless HTTP client that
 * talks to the AnkiConnect add-on (default http://127.0.0.1:8765).
 *
 * Doing the HTTP from the main process (Node fetch, no browser Origin) sidesteps
 * AnkiConnect's CORS/origin whitelist that a browser extension has to configure.
 *
 * Protocol (see references/yomitan/ext/js/comm/anki-connect.js): POST a single
 * JSON `{action, version, params}`; the reply is `{result, error}` and any
 * non-null `error` is a failure. We target API version 6 (current AnkiConnect).
 */

const API_VERSION = 6;

interface AnkiResponse<T> {
  result: T;
  error: string | null;
}

/** POSTs one AnkiConnect action and unwraps `{result, error}`; throws on any error. */
async function invoke<T>(endpoint: AnkiEndpoint, action: string, params: Record<string, unknown> = {}): Promise<T> {
  const body: Record<string, unknown> = { action, version: API_VERSION, params };
  if (endpoint.apiKey) body.key = endpoint.apiKey;

  const send = (): Promise<Response> =>
    fetch(endpoint.server, {
      method: "POST",
      // `connection: close` asks undici not to pool the socket; AnkiConnect's
      // HTTP server closes idle connections, so a reused keep-alive socket would
      // otherwise throw "other side closed" on the next request.
      headers: { "Content-Type": "application/json", connection: "close" },
      body: JSON.stringify(body),
    });

  let res: Response;
  try {
    res = await send();
  } catch {
    // A pooled socket may have died between calls; one retry opens a fresh one.
    try {
      res = await send();
    } catch {
      // AnkiConnect unreachable: Anki not running, add-on missing, or wrong URL.
      throw new Error("Could not reach Anki. Make sure Anki is running with the AnkiConnect add-on installed.");
    }
  }
  if (!res.ok) throw new Error(`AnkiConnect returned HTTP ${res.status}`);

  const data = (await res.json()) as AnkiResponse<T>;
  if (data.error) throw new Error(data.error);
  return data.result;
}

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const registerAnkiIpc = (): void => {
  // Connection test: the `version` handshake doubles as a reachability probe.
  ipcMain.handle("anki:test", async (_event, endpoint: AnkiEndpoint): Promise<AnkiTestResult> => {
    try {
      const version = await invoke<number>(endpoint, "version");
      return { ok: true, version };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  // Dropdown data for the settings UI.
  ipcMain.handle("anki:decks", (_event, endpoint: AnkiEndpoint) => invoke<string[]>(endpoint, "deckNames"));
  ipcMain.handle("anki:models", (_event, endpoint: AnkiEndpoint) => invoke<string[]>(endpoint, "modelNames"));
  ipcMain.handle("anki:fields", (_event, endpoint: AnkiEndpoint, model: string) =>
    invoke<string[]>(endpoint, "modelFieldNames", { modelName: model }),
  );

  // Install one of Aozora's note types, or bring an existing one up to date.
  // Fields are only ever added, never removed or reordered, so refreshing the
  // design can't destroy notes the user already has.
  ipcMain.handle("anki:ensure-model", async (_event, endpoint: AnkiEndpoint, spec: AnkiModelSpec): Promise<AnkiModelResult> => {
    try {
      const names = await invoke<string[]>(endpoint, "modelNames");
      if (!names.includes(spec.name)) {
        await invoke(endpoint, "createModel", {
          modelName: spec.name,
          inOrderFields: spec.fields,
          css: spec.css,
          cardTemplates: [{ Name: spec.cardName, Front: spec.front, Back: spec.back }],
        });
        return { ok: true, created: true };
      }

      const existing = await invoke<string[]>(endpoint, "modelFieldNames", { modelName: spec.name });
      for (const [index, fieldName] of spec.fields.entries()) {
        if (!existing.includes(fieldName)) await invoke(endpoint, "modelFieldAdd", { modelName: spec.name, fieldName, index });
      }
      // A model carried over from an earlier version (or made by hand) may name
      // its card something else; rewrite that one rather than adding a second.
      const templates = await invoke<Record<string, unknown>>(endpoint, "modelTemplates", { modelName: spec.name });
      const cardName = spec.cardName in templates ? spec.cardName : (Object.keys(templates)[0] ?? spec.cardName);
      await invoke(endpoint, "updateModelTemplates", {
        model: { name: spec.name, templates: { [cardName]: { Front: spec.front, Back: spec.back } } },
      });
      await invoke(endpoint, "updateModelStyling", { model: { name: spec.name, css: spec.css } });
      return { ok: true, created: false };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle("anki:add-note", async (_event, endpoint: AnkiEndpoint, note: AnkiNote): Promise<AnkiAddResult> => {
    try {
      const noteId = await invoke<number>(endpoint, "addNote", { note });
      return { ok: true, noteId };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });
};
