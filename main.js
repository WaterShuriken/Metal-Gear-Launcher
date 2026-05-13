const { shell, app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs-extra');
const { autoUpdater } = require("electron-updater");

autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

let mainWindow;
let isSwitchingMonitor = false;
let gameProcess = null;
let steamInterval = null;

const EMULATOR_SAVE_PATHS = {
    pcsx2: ['memcards', 'sstates'],
    duckstation: ['memcards', 'savestates'],
    ppsspp: ['memstick/PSP/SAVEDATA', 'memstick/PSP/PPSSPP_STATE'],
    retroarch: ['saves', 'states'],
    rpcs3: ['dev_hdd0/home/00000001/savedata', 'dev_hdd0/home/00000001/savestates'],
    xenia: ['content']
};

function sanitizeGameFolderName(name) {
    return (name || 'default')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'default';
}

function getGameStoragePath(rootDir, gameKey, legacyKeys = []) {
    const normalizedGameKey = sanitizeGameFolderName(gameKey);
    const normalizedLegacyKeys = legacyKeys
        .map(sanitizeGameFolderName)
        .filter(Boolean)
        .filter((key, index, list) => key !== normalizedGameKey && list.indexOf(key) === index);

    return {
        primary: path.join(rootDir, 'save_profiles', normalizedGameKey),
        legacy: normalizedLegacyKeys.map((legacyKey) => path.join(rootDir, 'save_profiles', legacyKey))
    };
}

async function resolveGameStoragePath(rootDir, gameKey, legacyKeys = []) {
    const { primary, legacy } = getGameStoragePath(rootDir, gameKey, legacyKeys);

    if (await fs.exists(primary)) {
        return primary;
    }

    for (const legacyPath of legacy) {
        if (await fs.exists(legacyPath)) {
            await fs.ensureDir(path.dirname(primary));
            await fs.move(legacyPath, primary, { overwrite: false });
            console.log(`[SAVE SYSTEM] Migrated save folder: ${path.basename(legacyPath)} -> ${path.basename(primary)}`);
            return primary;
        }
    }

    return primary;
}

function getProfilePath(rootDir, gameKey, profile = 'default', legacyKeys = []) {
    return resolveGameStoragePath(rootDir, gameKey, legacyKeys)
        .then((gamePath) => path.join(gamePath, profile));
}

function getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function copyDirectoryIfExists(source, destination) {
    if (await fs.exists(source)) {
        await fs.ensureDir(path.dirname(destination));
        await fs.copy(source, destination, { overwrite: true });
        return true;
    }

    return false;
}

async function copyProfileToEmulator(rootDir, emuType, profilePath) {
    const subPaths = EMULATOR_SAVE_PATHS[emuType];
    if (!subPaths) return false;

    let copiedAnything = false;

    for (const sub of subPaths) {
        const folderName = sub.split('/').pop();
        const source = path.join(profilePath, folderName);
        const destination = path.join(rootDir, 'emulators', emuType, sub);

        if (await fs.exists(destination)) {
            await fs.remove(destination);
        }

        copiedAnything = (await copyDirectoryIfExists(source, destination)) || copiedAnything;
    }

    return copiedAnything;
}

async function snapshotLiveEmulatorState(rootDir, emuType, profilePath) {
    const subPaths = EMULATOR_SAVE_PATHS[emuType];
    if (!subPaths) return;

    const backupRoot = path.join(profilePath, 'backups');
    const sessionBackupDir = path.join(backupRoot, getTimestamp());

    await fs.ensureDir(backupRoot);

    for (const sub of subPaths) {
        const source = path.join(rootDir, 'emulators', emuType, sub);
        const folderName = sub.split('/').pop();
        const liveProfileDest = path.join(profilePath, folderName);
        const backupDest = path.join(sessionBackupDir, folderName);

        if (await fs.exists(source)) {
            await fs.copy(source, liveProfileDest, { overwrite: true });
            await fs.copy(source, backupDest, { overwrite: true });
        }
    }

    await pruneBackupHistory(backupRoot);
}

async function archiveCurrentProfileState(profilePath, emuType) {
    const subPaths = EMULATOR_SAVE_PATHS[emuType];
    if (!subPaths) return null;

    const backupRoot = path.join(profilePath, 'backups');
    const archiveDir = path.join(backupRoot, getTimestamp());
    let copiedAnything = false;

    await fs.ensureDir(backupRoot);

    for (const sub of subPaths) {
        const folderName = sub.split('/').pop();
        const currentSource = path.join(profilePath, folderName);
        const archiveDest = path.join(archiveDir, folderName);

        copiedAnything = (await copyDirectoryIfExists(currentSource, archiveDest)) || copiedAnything;
    }

    if (!copiedAnything) {
        await fs.remove(archiveDir);
        return null;
    }

    await pruneBackupHistory(backupRoot);
    return archiveDir;
}

async function pruneBackupHistory(backupRoot) {
    if (!await fs.exists(backupRoot)) return;

    const backups = (await fs.readdir(backupRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ name: entry.name, path: path.join(backupRoot, entry.name) }))
        .sort((a, b) => b.name.localeCompare(a.name));

    if (backups.length > 10) {
        for (const oldBackup of backups.slice(10)) {
            await fs.remove(oldBackup.path);
            console.log(`[SAVE SYSTEM] Deleted old backup: ${oldBackup.name}`);
        }
    }
}

async function readSaveSlots(rootDir, gameKey, profile, emuType, legacyKeys = []) {
    const profilePath = await getProfilePath(rootDir, gameKey, profile, legacyKeys);
    const backupRoot = path.join(profilePath, 'backups');
    const subPaths = EMULATOR_SAVE_PATHS[emuType] || [];
    const slotNames = subPaths.map((sub) => sub.split('/').pop());

    const hasCurrentSave = await Promise.all(slotNames.map(async (slotName) => {
        const slotPath = path.join(profilePath, slotName);
        return fs.exists(slotPath);
    })).then((results) => results.some(Boolean));

    const slots = [];

    if (hasCurrentSave) {
        slots.push({
            id: 'current',
            type: 'current',
            label: 'CURRENT SAVE',
            isCurrent: true
        });
    }

    if (await fs.exists(backupRoot)) {
        const backups = (await fs.readdir(backupRoot, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
            .reverse();

        backups.forEach((backupName) => {
            slots.push({
                id: backupName,
                type: 'backup',
                label: backupName,
                isCurrent: false
            });
        });
    }

    return slots;
}

/**
 * 1. IPC HANDLERS & LISTENERS
 * These are moved outside createWindow to prevent memory leaks on reload
 */

function initUpdater(windowRef) {
    autoUpdater.on('update-available', () => {
        if (windowRef && windowRef.webContents) {
            windowRef.webContents.send('update-status', 'NEW INTEL DETECTED');
        }
    });
    autoUpdater.appBackUpDir = path.dirname(process.execPath);
    autoUpdater.disableWebInstaller = true;
    autoUpdater.forceDevUpdateConfig = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdatesAndNotify(); 
    console.log('[SYSTEM] PUBLIC SATELLITE LINK ACTIVE. SCANNING...');
}

function getRootDir() {
    return path.join(path.dirname(app.getPath('exe')), '..');
}

// Get all monitors with hardware IDs
ipcMain.handle('get-monitors', () => {
    return screen.getAllDisplays().map((display, index) => ({
        id: display.id.toString(),
        label: `Monitor ${index + 1} (${display.bounds.width}x${display.bounds.height})`,
        bounds: display.bounds
    }));
});

// Teleport and Resize Window
ipcMain.on('set-monitor', (event, data) => {
    if (!mainWindow) return;
    
    isSwitchingMonitor = true;
    const wasFS = mainWindow.isFullScreen();
    
    mainWindow.setFullScreen(false);
    mainWindow.unmaximize();

    const width = data.width || 1200;
    const height = data.height || 800;

    const x = Math.round(data.x + (data.bounds ? data.bounds.width - width : 0) / 2);
    const y = Math.round(data.y + (data.bounds ? data.bounds.height - height : 0) / 2);

    mainWindow.setBounds({ x, y, width, height }, false);

    setTimeout(() => {
        if (wasFS) mainWindow.setFullScreen(true);
        mainWindow.webContents.send('refresh-monitor-ui');
        isSwitchingMonitor = false;
    }, 250);
});

// Generic Fullscreen Toggle
ipcMain.on('toggle-fullscreen', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

// Initial Startup placement
ipcMain.on('apply-initial-fullscreen', (event, shouldBeFull) => {
    if (shouldBeFull !== null) mainWindow.setFullScreen(shouldBeFull);
    mainWindow.show();
});

// --- IPC FOR SAVE PROFILES ---
ipcMain.handle('create-save-profile', async (event, { game, profile, legacyKeys = [] }) => {
    try {
        const rootDir = getRootDir();
        const gamePath = await resolveGameStoragePath(rootDir, game, legacyKeys);
        const fullPath = path.join(gamePath, profile);

        // Check if it already exists
        if (await fs.exists(fullPath)) {
            return { success: false, error: 'A PROFILE WITH THAT NAME ALREADY EXISTS.' };
        }

        await fs.ensureDir(fullPath); 
        console.log(`[SATELLITE] Profile established: ${fullPath}`);
        return { success: true, path: fullPath };
    } catch (err) {
        console.error("Folder creation error:", err);
        return { success: false, error: err.message };
    }
});

// Get list of profiles (folders) for a specific game
ipcMain.handle('get-profiles', async (event, gameKey) => {
    const rootDir = getRootDir();
    const request = typeof gameKey === 'string' ? { gameKey, legacyKeys: [] } : gameKey;
    const gamePath = await resolveGameStoragePath(rootDir, request.gameKey, request.legacyKeys || []);
    
    if (!await fs.exists(gamePath)) return [];
    
    const entries = await fs.readdir(gamePath, { withFileTypes: true });
    return entries
        .filter(e => e.isDirectory() && e.name !== 'backups')
        .map(e => e.name);
});

// Get list of timestamped backups for a specific profile
ipcMain.handle('get-backups', async (event, { gameKey, profile, legacyKeys = [] }) => {
    const rootDir = getRootDir();
    const profilePath = await getProfilePath(rootDir, gameKey, profile, legacyKeys);
    const backupPath = path.join(profilePath, 'backups');
    
    if (!await fs.exists(backupPath)) return [];
    
    const entries = await fs.readdir(backupPath, { withFileTypes: true });
    return entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
        .reverse(); // Newest first
});

// Rename a profile — uses raw name (validation done client-side)
ipcMain.handle('rename-profile', async (event, { gameKey, oldName, newName, legacyKeys = [] }) => {
    try {
        const rootDir = getRootDir();
        const gameDir = await resolveGameStoragePath(rootDir, gameKey, legacyKeys);
        const oldPath = path.join(gameDir, oldName);
        const newPath = path.join(gameDir, newName);

        if (!await fs.exists(oldPath)) {
            return { success: false, error: 'SOURCE PROFILE NOT FOUND.' };
        }

        if (await fs.exists(newPath)) {
            return { success: false, error: 'A PROFILE WITH THAT NAME ALREADY EXISTS.' };
        }

        await fs.move(oldPath, newPath);
        console.log(`[SATELLITE] Profile renamed: ${oldName} → ${newName}`);
        return { success: true };
    } catch (err) {
        console.error("Rename error:", err);
        return { success: false, error: err.message };
    }
});

// Delete a profile and all its backups
ipcMain.handle('delete-profile', async (event, { gameKey, profile, legacyKeys = [] }) => {
    try {
        const rootDir = getRootDir();
        const profilePath = await getProfilePath(rootDir, gameKey, profile, legacyKeys);

        if (!await fs.exists(profilePath)) {
            return { success: false, error: 'PROFILE NOT FOUND.' };
        }

        await fs.remove(profilePath);
        console.log(`[SATELLITE] Profile deleted: ${gameKey}/${profile}`);
        return { success: true };
    } catch (err) {
        console.error("Delete error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-save-slots', async (event, { gameKey, profile, emuType, legacyKeys = [] }) => {
    const rootDir = getRootDir();
    return readSaveSlots(rootDir, gameKey, profile, emuType, legacyKeys);
});

ipcMain.handle('load-profile', async (event, { gameKey, profile, emuType, legacyKeys = [] }) => {
    const rootDir = getRootDir();
    const profilePath = await getProfilePath(rootDir, gameKey, profile, legacyKeys);
    return copyProfileToEmulator(rootDir, emuType, profilePath);
});

ipcMain.handle('activate-save-slot', async (event, { gameKey, profile, emuType, slotId, legacyKeys = [] }) => {
    try {
        const rootDir = getRootDir();
        const profilePath = await getProfilePath(rootDir, gameKey, profile, legacyKeys);
        const subPaths = EMULATOR_SAVE_PATHS[emuType];

        if (!subPaths || slotId === 'current') {
            return { success: true, alreadyCurrent: true };
        }

        const backupSource = path.join(profilePath, 'backups', slotId);
        if (!await fs.exists(backupSource)) {
            return { success: false, error: 'SAVE BACKUP NOT FOUND.' };
        }

        await archiveCurrentProfileState(profilePath, emuType);

        for (const sub of subPaths) {
            const folderName = sub.split('/').pop();
            const source = path.join(backupSource, folderName);
            const destination = path.join(profilePath, folderName);

            if (await fs.exists(source)) {
                await fs.remove(destination);
                await fs.copy(source, destination, { overwrite: true });
            }
        }

        await pruneBackupHistory(path.join(profilePath, 'backups'));
        await copyProfileToEmulator(rootDir, emuType, profilePath);

        return { success: true };
    } catch (err) {
        console.error('[SAVE SYSTEM] Failed to activate save slot:', err);
        return { success: false, error: err.message };
    }
});

function watchSteamProcess(exeName, target) {
    if (steamInterval) clearInterval(steamInterval);
    
    setTimeout(() => {
        steamInterval = setInterval(() => {
            exec(`tasklist /fi "ImageName eq ${exeName}"`, (err, stdout) => {
                if (!stdout.toLowerCase().includes(exeName.toLowerCase())) {
                    clearInterval(steamInterval);
                    steamInterval = null;
                    if (mainWindow) mainWindow.webContents.send('mission-ended');
                }
            });
        }, 3000);
    }, 10000);
}

ipcMain.on('launch-mission', async (event, { type, target, emu, steamExe, gameKey, profile = 'default', legacyKeys = [] }) => {
    if (gameProcess || steamInterval) return;

    if (type === 'steam') {
        shell.openExternal(`steam://rungameid/${target}`);
        if (steamExe) watchSteamProcess(steamExe, target);
        return; 
    }

    const rootDir = getRootDir();
    const emuType = emu.split('/')[0];
    const emuParts = emu.split(' ');
    const emuExeSubPath = emuParts[0]; 
    let emuArgs = emuParts.slice(1).join(' ');

    const emuFolder = path.join(rootDir, 'emulators', path.dirname(emuExeSubPath));
    const fullEmuPath = path.join(rootDir, 'emulators', emuExeSubPath);
    const fullRomPath = path.join(rootDir, 'roms', target);

    const storageName = gameKey || target.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const profileName = profile;
    const profilePath = await getProfilePath(rootDir, storageName, profileName, legacyKeys);

    await fs.ensureDir(profilePath);
    await copyProfileToEmulator(rootDir, emuType, profilePath);

    if (emuArgs.includes('cores/')) {
        const coreFile = emuArgs.split('cores/')[1].split(' ')[0];
        const fullCorePath = path.join(rootDir, 'emulators', 'retroarch', 'cores', coreFile);
        emuArgs = emuArgs.replace(`cores/${coreFile}`, `"${fullCorePath}"`);
    }

    const command = `"${fullEmuPath}" ${emuArgs} "${fullRomPath}"`;

    gameProcess = exec(command, { cwd: emuFolder }, async (err) => {
        gameProcess = null;
        
        if (type === 'emu') {
            console.log(`[SYSTEM] Mission Ended. Archiving saves for: ${storageName}/${profileName}`);

            try {
                await snapshotLiveEmulatorState(rootDir, emuType, profilePath);
            } catch (syncErr) {
                console.error("SAVE SYNC ERROR:", syncErr);
            }
        }

        if (mainWindow) mainWindow.webContents.send('mission-ended');
        if (err) console.error("EMULATOR FAILURE:", err);
    });
});

// Listener to kill the game if requested
ipcMain.on('abort-mission', (event, data) => {
    console.log("[DEBUG] Received Abort Request. Data:", data);

    const steamExe = (data && data.steamExe) ? data.steamExe : null;

    if (steamExe) {
        console.log(`[SYSTEM] Attempting to terminate Steam process: ${steamExe}`);
        
        exec(`taskkill /F /IM "${steamExe}" /T`, (err, stdout, stderr) => {
            if (err) {
                console.error(`[SYSTEM] KILL FAILED: ${stderr || err.message}`);
            } else {
                console.log(`[SYSTEM] KILL SUCCESS: ${stdout}`);
                if (steamInterval) {
                    clearInterval(steamInterval);
                    steamInterval = null;
                }
                if (mainWindow) mainWindow.webContents.send('mission-ended');
            }
        });
    } else if (gameProcess) {
        exec(`taskkill /PID ${gameProcess.pid} /F /T`, (err) => {
            gameProcess = null;
            if (mainWindow) mainWindow.webContents.send('mission-ended');
        });
    }
});

/**
 * 2. WINDOW CREATION
 */

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'img/icon.ico'), 
        show: false, 
        backgroundColor: '#050a05',
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('move', () => {
        const winBounds = mainWindow.getBounds();
        const currentDisplay = screen.getDisplayMatching(winBounds);
        const idStr = currentDisplay.id.toString();
        
        mainWindow.webContents.send('monitor-changed', idStr);
        mainWindow.webContents.send('save-monitor-id', idStr);
    });

    mainWindow.on('resize', () => {
        if (!mainWindow.isFullScreen() && !mainWindow.isMaximized()) {
            const [width, height] = mainWindow.getSize();
            mainWindow.webContents.send('save-window-size', { width, height });
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F11') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
    });

    mainWindow.on('enter-full-screen', () => {
        mainWindow.webContents.send('fs-state-change', true);
    });
    
    mainWindow.on('leave-full-screen', () => {
        mainWindow.webContents.send('fs-state-change', false);
        if (!isSwitchingMonitor) {
            const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
            const { width: sW, height: sH, x: sX, y: sY } = currentDisplay.bounds;

            const winW = 1200;
            const winH = 800;

            mainWindow.setBounds({
                x: Math.round(sX + (sW - winW) / 2),
                y: Math.round(sY + (sH - winH) / 2),
                width: winW,
                height: winH
            }, false);
        }
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.webContents.send('app-version', app.getVersion());
    });

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('app-version', app.getVersion());
    });
}

/**
 * APP LIFECYCLE
 */

app.whenReady().then(() => {
    createWindow();
    Menu.setApplicationMenu(null);
    initUpdater();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

autoUpdater.on('update-available', () => {
    console.log('[SYSTEM] NEW INTEL DETECTED.');
    autoUpdater.downloadUpdate();
});

autoUpdater.on('error', (err) => {
    console.error('Fuck something went wrong ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    mainWindow.webContents.send('update-progress', percent);
    console.log(`[SYSTEM] DOWNLOAD: ${percent}%`);
});

autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-status', 'UPDATE SECURED. RESTART TO APPLY.');
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.quitAndInstall(true, true); 
});
