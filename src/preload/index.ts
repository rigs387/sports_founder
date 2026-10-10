import { contextBridge, ipcRenderer } from "electron";
import type { SaveFiles } from "../shared/save-files";

const files: SaveFiles = {
  save: (text, copy) => ipcRenderer.invoke("campaign:save", text, copy),
  open: (copy) => ipcRenderer.invoke("campaign:open", copy),
  list: () => ipcRenderer.invoke("campaign:list"),
  openNamed: (name) => ipcRenderer.invoke("campaign:open-named", name),
  autosave: (text) => ipcRenderer.invoke("campaign:autosave", text),
  closeState: (state) => ipcRenderer.send("campaign:close-state", state),
  acceptLoad: () => ipcRenderer.send("campaign:accept-load"),
};
contextBridge.exposeInMainWorld("saveFiles", files);
