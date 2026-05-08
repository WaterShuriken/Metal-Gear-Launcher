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
let steamStartTime = null;
let currentSteamTarget = null;

/**
 * 1. IPC HANDLERS & LISTENERS
 * These are moved outside createWindow to prevent memory leaks on reload
 */

function registerMissionPath() {
    // 1. Target keys for both versions
    // Key A: The auto-generated one from v1.0.0
    const v100Key = "Metal Gear: Allison's Collection_is1";
    // Key B: The specific ID we used in the v1.0.1 script
    const v101Key = "MGS-ALLISON-COLLECTION-001_is1";

    const keysToDelete = [v100Key, v101Key];

    keysToDelete.forEach(key => {
        // Delete from standard 64-bit registry
        exec(`reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${key}" /f`, (err) => {
            if (err) {
                // Try 32-bit fallback (WOW6432Node) if the first one fails
                exec(`reg delete "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${key}" /f`);
            }
        });
    });

    console.log('[SYSTEM] Legacy Registry cleanup initiated for v1.0.0 and v1.0.1.');
}


function initUpdater(windowRef) {
    // Pass the window reference in so we know it exists
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
    
    isSwitchingMonitor = true; // Lock the listener
    const wasFS = mainWindow.isFullScreen();
    
    mainWindow.setFullScreen(false);
    mainWindow.unmaximize();

    const width = data.width || 1200;
    const height = data.height || 800;

    // 2. Calculate center of the TARGET monitor (data.x/y)
    const x = Math.round(data.x + (data.bounds ? data.bounds.width - width : 0) / 2);
    const y = Math.round(data.y + (data.bounds ? data.bounds.height - height : 0) / 2);

    mainWindow.setBounds({ x, y, width, height }, false);

    setTimeout(() => {
        if (wasFS) mainWindow.setFullScreen(true);
        mainWindow.webContents.send('refresh-monitor-ui');
        isSwitchingMonitor = false; // Release the lock
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

// Helper to handle the backup logic
async function manageBackups(emuType, targetName) {
    const rootDir = process.cwd();
    // Use targetName (the ROM name) to keep backups separate for each game
    const gameId = targetName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(rootDir, 'backups', gameId, timestamp);

    // Map emulators to [Memory Cards, Save States]
    const emuMap = {
        'pcsx2': ['memcards', 'sstates'],
        'duckstation': ['memcards', 'savestates'],
        'ppsspp': ['memstick/PSP/SAVEDATA', 'memstick/PSP/PPSSPP_STATE'],
        'retroarch': ['saves', 'states'],
        'rpcs3': ['dev_hdd0/home/00000001/savedata', 'dev_hdd0/home/00000001/savestates'],
        'xenia': ['content', ''] // Xenia doesn't standardly use sstates the same way
    };

    const paths = emuMap[emuType];
    if (!paths) return;

    try {
        // 1. PERFORM BACKUP
        for (const subPath of paths) {
            if (!subPath) continue;
            const source = path.join(rootDir, 'emulators', emuType, subPath);
            const destination = path.join(backupDir, subPath.split('/').pop());

            if (fs.existsSync(source)) {
                await fs.copy(source, destination);
            }
        }
        console.log(`[SYSTEM] Backup Secured: ${gameId}`);

        // 2. ENFORCE 10-BACKUP LIMIT
        const gameBackupRoot = path.join(rootDir, 'backups', gameId);
        const folders = fs.readdirSync(gameBackupRoot)
            .map(name => ({ name, path: path.join(gameBackupRoot, name), stat: fs.statSync(path.join(gameBackupRoot, name)) }))
            .filter(f => f.stat.isDirectory())
            .sort((a, b) => b.stat.mtime - a.stat.mtime); // Sort newest to oldest

        if (folders.length > 10) {
            const toDelete = folders.slice(10); // Keep only the top 10
            toDelete.forEach(f => {
                fs.removeSync(f.path);
                console.log(`[SYSTEM] Rotating Archive: Removed oldest backup ${f.name}`);
            });
        }
    } catch (err) {
        console.error(`[SYSTEM] Backup Protocol Failed:`, err);
    }
}

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

ipcMain.on('launch-mission', (event, { type, target, emu, steamExe }) => {
    if (gameProcess || steamInterval) return;

    if (type === 'steam') {
        shell.openExternal(`steam://rungameid/${target}`);
        if (steamExe) watchSteamProcess(steamExe, target);
        return; 
    }

    const rootDir = "../" + process.cwd(); 
    const emuType = emu.split('/')[0];
    const emuParts = emu.split(' ');
    const emuExeSubPath = emuParts[0]; 
    let emuArgs = emuParts.slice(1).join(' ');

    const emuFolder = path.join(rootDir, 'emulators', path.dirname(emuExeSubPath));
    const fullEmuPath = path.join(rootDir, 'emulators', emuExeSubPath);
    const fullRomPath = path.join(rootDir, 'roms', target);

    if (emuArgs.includes('cores/')) {
        const coreFile = emuArgs.split('cores/')[1].split(' ')[0];
        const fullCorePath = path.join(rootDir, 'emulators', 'retroarch', 'cores', coreFile);
        emuArgs = emuArgs.replace(`cores/${coreFile}`, `"${fullCorePath}"`);
    }

    const command = `"${fullEmuPath}" ${emuArgs} "${fullRomPath}"`;

    gameProcess = exec(command, { cwd: emuFolder }, (err) => {
        gameProcess = null;
        if (type === 'emu') {
            const emuType = emu.split('/')[0]; 
            manageBackups(emuType, target);   
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
        
        // Use /F (Force) and /T (Tree) to kill the game and all its children
        exec(`taskkill /F /IM "${steamExe}" /T`, (err, stdout, stderr) => {
            if (err) {
                console.error(`[SYSTEM] KILL FAILED: ${stderr || err.message}`);
            } else {
                console.log(`[SYSTEM] KILL SUCCESS: ${stdout}`);
                // Manually clean up the watcher
                if (steamInterval) {
                    clearInterval(steamInterval);
                    steamInterval = null;
                }
                if (mainWindow) mainWindow.webContents.send('mission-ended');
            }
        });
    } else if (gameProcess) {
        // Standard Emulator Kill by PID
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

    // TRACKING: Monitor Change & ID Save
    mainWindow.on('move', () => {
        const winBounds = mainWindow.getBounds();
        // Use getDisplayMatching for better accuracy with intersecting screens
        const currentDisplay = screen.getDisplayMatching(winBounds);
        const idStr = currentDisplay.id.toString();
        
        // Notify frontend to update (ACTIVE) tag and save the new Home ID
        mainWindow.webContents.send('monitor-changed', idStr);
        mainWindow.webContents.send('save-monitor-id', idStr);
    });

    // TRACKING: Window Size (Only when windowed)
    mainWindow.on('resize', () => {
        if (!mainWindow.isFullScreen() && !mainWindow.isMaximized()) {
            const [width, height] = mainWindow.getSize();
            mainWindow.webContents.send('save-window-size', { width, height });
        }
    });

    // INPUT: F11 Keyboard Toggle
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F11') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
    });

    // STATE: Fullscreen Listeners
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
    registerMissionPath();
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
