const { contextBridge, ipcRenderer } = require('electron');

// Helper to handle one-way listeners with cleanup
const createListener = (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
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
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, percent) => callback(percent)),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, message) => callback(message)),

    // Requests (Two-way)
    getMonitors: () => ipcRenderer.invoke('get-monitors'),
    createSaveProfile: (data) => ipcRenderer.invoke('create-save-profile', data),
    getProfiles: (game) => ipcRenderer.invoke('get-profiles', game),
    getBackups: (data) => ipcRenderer.invoke('get-backups', data),
    getSaveSlots: (data) => ipcRenderer.invoke('get-save-slots', data),
    getPlaytimes: () => ipcRenderer.invoke('get-playtimes'),
    renameProfile: (data) => ipcRenderer.invoke('rename-profile', data),
    deleteProfile: (data) => ipcRenderer.invoke('delete-profile', data),
    loadProfile: (data) => ipcRenderer.invoke('load-profile', data),
    activateSaveSlot: (data) => ipcRenderer.invoke('activate-save-slot', data),

    // Listeners (With Cleanup Support)
    onFSChange: (callback) => createListener('fs-state-change', callback),
    onMonitorChange: (callback) => createListener('monitor-changed', callback),
    onSaveMonitor: (callback) => createListener('save-monitor-id', callback),
    onMissionEnd: (callback) => ipcRenderer.on('mission-ended', () => callback()),
    onSaveSize: (callback) => createListener('save-window-size', callback)
});
