import { contextBridge, ipcRenderer } from "electron";
import type { SaveFiles } from "../shared/save-files";

const files: SaveFiles = {
  save: (text, copy) => ipcRenderer.invoke("campaign:save", text, copy),
  open: (copy) => ipcRenderer.invoke("campaign:open", copy),
  closeState: (state) => ipcRenderer.send("campaign:close-state", state),
  acceptLoad: () => ipcRenderer.send("campaign:accept-load"),
};
contextBridge.exposeInMainWorld("saveFiles", files);
