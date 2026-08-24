const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("oneuldoMate", {
  talk: () => ipcRenderer.send("mate:talk"),
  open: () => ipcRenderer.send("mate:open"),
  menu: () => ipcRenderer.send("mate:menu"),
  resize: (expanded) => ipcRenderer.send("mate:resize", Boolean(expanded)),
  startDrag: () => ipcRenderer.send("mate:drag-start"),
  drag: () => ipcRenderer.send("mate:drag"),
  endDrag: () => ipcRenderer.send("mate:drag-end"),
  onMessage: (callback) => ipcRenderer.on("mate:message", (_event, message) => callback(message)),
  onStatus: (callback) => ipcRenderer.on("mate:status", (_event, status) => callback(status)),
});
