const { contextBridge, ipcRenderer } = require('electron');

// Helper to handle one-way listeners with cleanup
const createListener = (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    // Returns a function to remove this specific listener
    return () => ipcRenderer.removeListener(channel, subscription);
};

contextBridge.exposeInMainWorld('electronAPI', {
    // Commands (One-way)
    toggleFS: () => ipcRenderer.send('toggle-fullscreen'),
    setInitialFS: (val) => ipcRenderer.send('apply-initial-fullscreen', val),
    setMonitor: (data) => ipcRenderer.send('set-monitor', data),
    launch: (command) => ipcRenderer.send('launch-app', command),
    launchMission: (data) => ipcRenderer.send('launch-mission', data),
    abortMission: (data) => ipcRenderer.send('abort-mission', data),
    onAppVersion: (callback) => ipcRenderer.on('app-version', (event, version) => callback(version)),
    onUpdateFound: (callback) => ipcRenderer.on('update-found', (event) => callback()),

    // Requests (Two-way)
    getMonitors: () => ipcRenderer.invoke('get-monitors'),

    // Listeners (With Cleanup Support)
    onFSChange: (callback) => createListener('fs-state-change', callback),
    onMonitorChange: (callback) => createListener('monitor-changed', callback),
    onSaveMonitor: (callback) => createListener('save-monitor-id', callback),
    onMissionEnd: (callback) => ipcRenderer.on('mission-ended', () => callback()),
    onSaveSize: (callback) => createListener('save-window-size', callback)
});
