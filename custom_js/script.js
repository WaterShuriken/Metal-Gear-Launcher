// Enums
class emuPaths {
    static PCSX2 = 'pcsx2/pcsx2.exe';
    static NES = 'retroarch/retroarch.exe -f -L cores/nestopia_libretro.dll';
    static DUCKSTATION = 'duckstation/duckstation-qt.exe -batch';
    static GBC = 'retroarch/retroarch.exe -f -L cores/gambatte_libretro.dll';
    static XENIA = 'xenia/xenia.exe --fullscreen';
    static PPSSPP = 'ppsspp/ppsspp.exe --fullscreen --escape-exit';
    static RPCS3 = 'rpcs3/rpcs3.exe --fullscreen --no-gui';
}

class romPaths {
    static MG = 'Metal Gear Solid 3 - Subsistence Disc 2.iso';
    static SR = 'Snakes Revenge (USA).nes';
    static MG2 = 'Metal Gear Solid 3 - Subsistence Disc 2.iso';
    static MGS = 'Metal Gear Solid.m3u';
    static GB = 'Metal Gear Solid - Ghost Babel.gbc';
    static MGS2 = 'MGS HD/MGS2.xex';
    static MGS3 = 'MGS HD/MGS3.xex';
    static ACID = 'Metal Gear Ac!d.iso';
    static ACID2 = 'Metal Gear Ac!d^2.iso';
    static PO = 'Metal Gear Solid - Portable Ops.iso';
    static MGS4 = 'Metal Gear Solid 4 - Guns of the Patriots (USA) (En,Fr,De,Es,It) (v02.00).dec.iso';
    static PW = 'MGS PW/default.xex';
}

// --- 0. IMMEDIATE THEME APPLY (PREVENTS FLICKER) ---
(function() {
    const savedTheme = localStorage.getItem('mgs-theme') || 'retro';
    document.body.setAttribute('data-theme', savedTheme);
})();

// --- 1. STATE HELPERS ---
const getPref = (key, defaultVal) => {
    const val = localStorage.getItem(key);
    if (val === null) return defaultVal;
    return val === 'true' || (val === 'false' ? false : val);
};

// --- 2. THEME & EFFECTS ---
function applyTheme() {
    const theme = getPref('mgs-theme', 'retro');
    document.body.setAttribute('data-theme', theme);
    const sidebar = document.getElementById('settings-sidebar');
    if (sidebar) sidebar.setAttribute('data-theme', theme);
}

function setTheme(themeName) {
    localStorage.setItem('mgs-theme', themeName);
    applyTheme();
}

function applyRetroEffects(isEnabled) {
    const state = isEnabled !== undefined ? isEnabled : getPref('retro-effects', true);
    document.documentElement.classList.toggle('no-effects', !state);
}

function toggleRetroEffects() {
    const newState = !getPref('retro-effects', true);
    localStorage.setItem('retro-effects', newState);
    applyRetroEffects(newState);
    updateEffectsBtnUI();
}

function updateEffectsBtnUI() {
    const btn = document.getElementById('effectsStatus');
    if (btn) btn.innerText = getPref('retro-effects', true) ? "ON" : "OFF";
}

// --- 3. FULLSCREEN & SIZE LOGIC ---
function toggleFullscreen() {
    window.electronAPI.toggleFS();
}

function syncFullscreenUI(isFullscreen) {
    const btnText = document.getElementById('fsStatus');
    if (btnText) btnText.innerText = isFullscreen ? "ON" : "OFF";

    localStorage.setItem('fullscreen-pref', isFullscreen);
    if (!isFullscreen) {
        localStorage.setItem('window-width', 1200);
        localStorage.setItem('window-height', 900);
    }
}

// --- 4. MONITOR & WINDOW PLACEMENT ---
async function loadMonitors() {
    const select = document.getElementById('monitorSelect');
    if (!select) return;

    const monitors = await window.electronAPI.getMonitors();
    const savedId = localStorage.getItem('selected-monitor-id');
    
    const winX = window.screenX;
    const winY = window.screenY;

    select.innerHTML = ''; 
    monitors.forEach(m => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify(m); 
        
        const isCurrent = (m.id.toString() === savedId) || 
                         (winX >= m.bounds.x && winX < m.bounds.x + m.bounds.width &&
                          winY >= m.bounds.y && winY < m.bounds.y + m.bounds.height);
        
        opt.innerText = isCurrent ? `● ${m.label} (ACTIVE)` : m.label;
        if (isCurrent) {
            opt.selected = true;
            localStorage.setItem('selected-monitor-id', m.id.toString());
        }
        select.appendChild(opt);
    });
}

function changeMonitor() {
    const select = document.getElementById('monitorSelect');
    if (!select.value) return;
    const data = JSON.parse(select.value);
    localStorage.setItem('selected-monitor-id', data.id.toString());
    
    window.electronAPI.setMonitor({
        ...data.bounds,
        width: parseInt(localStorage.getItem('window-width')) || 1200,
        height: parseInt(localStorage.getItem('window-height')) || 900
    });
}

// --- 5. INITIALIZATION ---
async function initApp() {
    applyTheme();
    applyRetroEffects();

    const startFS = getPref('fullscreen-pref', false);
    syncFullscreenUI(startFS);

    if (!sessionStorage.getItem('app-already-started')) {
        const width = parseInt(localStorage.getItem('window-width')) || 1200;
        const height = parseInt(localStorage.getItem('window-height')) || 900;
        const savedId = localStorage.getItem('selected-monitor-id');

        const monitors = await window.electronAPI.getMonitors();
        let target = monitors.find(m => m.id.toString() === savedId);
        
        if (!target) target = monitors[0];

        if (target) {
            window.electronAPI.setMonitor({
                ...target.bounds,
                width: width, 
                height: height 
            });
        }
        
        window.electronAPI.setInitialFS(startFS);
        sessionStorage.setItem('app-already-started', 'true');
    } else {
        window.electronAPI.setInitialFS(null); 
    }
}

async function toggleSettings() {
    let sidebar = document.getElementById('settings-sidebar');
    let overlay = document.getElementById('settings-overlay');
    
    if (!sidebar) {
        const isSubPage = window.location.pathname.includes('/timeline/');
        const settingsPath = isSubPage ? '../../pages/settings.html' : 'pages/settings.html';

        try {
            const response = await fetch(settingsPath);
            if (!response.ok) throw new Error('Settings file not found');
            const html = await response.text();
            
            // Create Sidebar
            sidebar = document.createElement('div');
            sidebar.id = 'settings-sidebar';
            sidebar.innerHTML = html;
            document.body.appendChild(sidebar);

            // Create Click-Outside Overlay
            overlay = document.createElement('div');
            overlay.id = 'settings-overlay';
            overlay.onclick = toggleSettings; // Clicking overlay closes settings
            document.body.appendChild(overlay);
            loadMonitors();

            // Force a tiny timeout so the CSS 'right' transition triggers correctly
            setTimeout(() => {
                sidebar.classList.add('open');
                overlay.classList.add('active');
            }, 10);

        } catch (err) {
            console.error("Failed to load settings:", err);
            return;
        }
    } else {
        sidebar.classList.toggle('open');
        overlay = document.getElementById('settings-overlay');
        overlay.classList.toggle('active');
    }

    if (sidebar.classList.contains('open')) {
        const fsState = getPref('fullscreen-pref', false);
        if (typeof syncFullscreenUI === 'function') syncFullscreenUI(fsState);
        if (typeof updateEffectsBtnUI === 'function') updateEffectsBtnUI();
        if (typeof loadMonitors === 'function') loadMonitors();
        if (typeof applyTheme === 'function') applyTheme();
    }
}

let activeIntelCard = null;

function openIntelMenu(e, cardElement) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    activeIntelCard = cardElement;

    // 1. Get the raw onclick string (e.g., "missionControl(event, 'emu', romPaths.MGS3, ...)")
    const clickAttr = cardElement.getAttribute('onclick');
    
    // 2. Identify the ROM Key by checking which Enum value is inside the string
    let detectedKey = "UNKNOWN_MISSION";
    for (const key in romPaths) {
        if (clickAttr.includes(`romPaths.${key}`)) {
            detectedKey = key; // Found it (e.g., "MGS3")
            break;
        }
    }

    // 3. Identify the Emulator
    let detectedEmu = "";
    for (const key in emuPaths) {
        if (clickAttr.includes(`emuPaths.${key}`)) {
            detectedEmu = emuPaths[key];
            break;
        }
    }

    // 4. Clean Display Name (Use the visible span)
    const titleElement = cardElement.querySelector('.game-title');
    const displayName = titleElement ? titleElement.innerText : detectedKey;

    let menu = document.getElementById('intel-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'intel-menu';
        document.body.appendChild(menu);
    }

    const isEmu = clickAttr.includes("'emu'");
    const saveButton = isEmu 
        ? `<div class="intel-menu-item" onclick="openSaveManager(event, '${detectedKey}', '${detectedEmu}', '${displayName}')">[ MANAGE SAVES ]</div>` 
        : '';

    menu.innerHTML = `
        <div class="intel-menu-item" onclick="launchFromIntelMenu()">[ LAUNCH MISSION ]</div>
        <div class="intel-menu-divider"></div>
        ${saveButton}
        <div class="intel-menu-item" onclick="closeIntelMenu()">VIEW INTEL FILES</div>
        <div class="intel-menu-divider"></div>
        <div class="intel-menu-item" style="color: #ff4444;" onclick="closeIntelMenu()">CANCEL</div>
    `;

    menu.style.display = 'block';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    setTimeout(() => document.addEventListener('click', closeIntelMenu, { once: true }), 50);
}

function launchFromIntelMenu() {
    if (activeIntelCard) {
        // Trigger missionControl manually via the stored card's native click logic
        activeIntelCard.click(); 
        closeIntelMenu();
    }
}

function closeIntelMenu() {
    const menu = document.getElementById('intel-menu');
    if (menu) menu.style.display = 'none';
    // activeIntelCard is NOT cleared here to allow missionControl to finish
}

async function openSaveManager(e, romKey, emuPath, displayName) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    closeIntelMenu(); 

    currentTargetGame = romKey; 
    currentTargetEmu = emuPath.split('/')[0]; // e.g., "pcsx2"

    let overlay = document.getElementById('save-manager-overlay');
    
    if (!overlay) {
        try {
            const managerPath = '../../pages/save-manager.html';
            const response = await fetch(managerPath);
            const html = await response.text();
            
            overlay = document.createElement('div');
            overlay.id = 'save-manager-overlay';
            // Start it completely hidden
            overlay.style.display = 'none';
            overlay.innerHTML = `<div id="save-manager-modal">${html}</div>`;
            document.body.appendChild(overlay);

            // Close when clicking the dark area, but NOT the modal box
            overlay.onclick = (event) => {
                if (event.target.id === 'save-manager-overlay') {
                    closeSaveManager();
                }
            };
        } catch (err) {
            console.error("Fetch failed:", err);
            return;
        }
    }

    overlay.style.display = 'flex';

    setTimeout(() => {
        overlay.classList.add('active');
        
        // Update labels
        const label = document.getElementById('active-game-label');
        if (label) label.innerText = `MISSION: ${displayName.toUpperCase()}`;
        if (typeof applyTheme === 'function') applyTheme();
    }, 10);
}

function closeSaveManager() {
    const overlay = document.getElementById('save-manager-overlay');
    if (overlay) {
        // 🟢 Remove the class to start the CSS fade-out
        overlay.classList.remove('active');

        // 🟢 Wait for CSS transition (0.3s) then hide the display entirely
        setTimeout(() => {
            // Check if it's still closed (prevents flickering if opened mid-close)
            if (!overlay.classList.contains('active')) {
                overlay.style.display = 'none';
            }
        }, 300);
    }
}

async function createNewProfile() {
    const profileName = prompt("ENTER PROFILE CODENAME (e.g., 'BIG BOSS RUN'):");
    if (!profileName) return;

    const safeName = profileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    // Send to Main to create the folder
    await window.electronAPI.createSaveProfile({ 
        emu: currentTargetEmu, 
        game: currentTargetGame, 
        profile: safeName 
    });
    refreshProfileList();
}

let pendingCard = null;
let pendingSteamExe = "";

function missionControl(event, type, target, emu, steamExe = "") {
    const card = event.currentTarget;

    if (card.classList.contains('running')) {
        const modal = document.getElementById('abort-modal');
        if (modal) modal.style.display = 'flex';
        pendingCard = card;
        pendingSteamExe = steamExe;
    } else {
        window.electronAPI.launchMission({ type, target, emu, steamExe });
        
        document.querySelectorAll('.game-card').forEach(c => c.classList.remove('running'));
        card.classList.add('running');
    }
}

function confirmAbort() {
    if (window.electronAPI && window.electronAPI.abortMission) {
        window.electronAPI.abortMission({ steamExe: pendingSteamExe });
    }
    
    if (pendingCard) pendingCard.classList.remove('running');
    closeAbortModal();
}

function closeAbortModal() {
    document.getElementById('abort-modal').style.display = 'none';
    pendingCard = null;
    pendingSteamExe = steamExe;
}

let activeTime = 'all';
let activeStories = ['canon', 'parallel', 'ignored', 'alternate'];

function toggleTime(choice, btn) {
    // UI: Radio Button behavior
    document.querySelectorAll('#time-filters .btn-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    activeTime = choice;
    runMasterFilter();
}

function toggleStory(choice, btn) {
    // UI: Checkbox behavior (Toggle on/off)
    btn.classList.toggle('active');
    
    if (activeStories.includes(choice)) {
        activeStories = activeStories.filter(s => s !== choice);
    } else {
        activeStories.push(choice);
    }
    runMasterFilter();
}

function runMasterFilter() {
    const cards = document.querySelectorAll('.game-card');
    
    cards.forEach(card => {
        const cardCat = card.getAttribute('data-category');
        const isRetro = card.getAttribute('data-retro') === 'true';
        
        // Check Time Condition
        let timeMatch = false;
        if (activeTime === 'all') timeMatch = true;
        if (activeTime === 'retro' && isRetro) timeMatch = true;
        if (activeTime === 'modern' && !isRetro) timeMatch = true;

        // Check Story Condition
        const storyMatch = activeStories.includes(cardCat);

        // Final Verdict: Must pass BOTH tests
        card.classList.toggle('hidden', !(timeMatch && storyMatch));
    });
}

// Update your existing mission-ended listener
window.electronAPI.onMissionEnd((data) => {
    if (data && data.duration) {
        savePlaytime(data.target, data.duration);
    }
    document.querySelectorAll('.game-card').forEach(c => c.classList.remove('running'));
});

// --- 6. EVENT LISTENERS ---
window.electronAPI.onFSChange(syncFullscreenUI);

window.electronAPI.onSaveMonitor((id) => {
    localStorage.setItem('selected-monitor-id', id.toString());
    loadMonitors();
});

window.electronAPI.onSaveSize((size) => {
    localStorage.setItem('window-width', size.width);
    localStorage.setItem('window-height', size.height);
});

window.electronAPI.onMonitorChange(loadMonitors);

window.addEventListener('storage', (e) => {
    if (e.key === 'mgs-theme') applyTheme();
});

window.addEventListener('focus', applyTheme);
document.addEventListener('DOMContentLoaded', initApp);

window.electronAPI.onMissionEnd(() => {
    document.querySelectorAll('.game-card').forEach(c => {
        c.classList.remove('running');
    });
});

window.electronAPI.onAppVersion((version) => {
    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
        versionDisplay.innerText = `v${version}`;
    }
});

window.electronAPI.onUpdateFound(() => {
    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
        versionDisplay.classList.add('update-pulse');
        versionDisplay.innerText = "UPDATING...";
    }
});

window.electronAPI.onUpdateProgress((percent) => {
    const overlay = document.getElementById('update-overlay');
    const bar = document.getElementById('update-bar');
    const percentText = document.getElementById('update-percent');

    overlay.classList.remove('hidden');
    bar.style.width = `${percent}%`;
    percentText.innerText = `${percent}%`;
});

window.electronAPI.onUpdateStatus((message) => {
    if (message === "Update done bestie! itll restart soon") {
        const header = document.querySelector('.update-header');
        header.innerText = "Update Complete";
        header.style.color = "#fff";
        // main.js handles the auto-quitAndInstall()
    }
});