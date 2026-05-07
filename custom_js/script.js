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
    
    if (!sidebar) {
        const isSubPage = window.location.pathname.includes('/timeline/');
        const settingsPath = isSubPage ? '../../pages/settings.html' : 'pages/settings.html';

        try {
            const response = await fetch(settingsPath);
            if (!response.ok) throw new Error('Settings file not found');
            const html = await response.text();
            
            sidebar = document.createElement('div');
            sidebar.id = 'settings-sidebar';
            sidebar.innerHTML = html;
            document.body.appendChild(sidebar);
        } catch (err) {
            console.error("Failed to load settings:", err);
            return;
        }
    }

    sidebar.classList.toggle('open');

    if (sidebar.classList.contains('open')) {
        const fsState = getPref('fullscreen-pref', false);
        syncFullscreenUI(fsState);
        updateEffectsBtnUI();
        loadMonitors();
        applyTheme();
    }
}

function missionStart(type, target, emu = "") {
    // 1. Check if the function is even being called
    console.log("Mission Start triggered:", { type, target, emu });

    // 2. Check if the Electron Bridge is alive
    if (!window.electronAPI) {
        console.error("CRITICAL ERROR: window.electronAPI is missing. Preload failed to load.");
        return;
    }

    if (!window.electronAPI.launchMission) {
        console.error("CRITICAL ERROR: launchMission is not defined in the API.");
        return;
    }

    // 3. Send the data to the Main Process
    window.electronAPI.launchMission({ type, target, emu });
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

window.electronAPI.onUpdateProgress((percent) => {
    const statusFooter = document.querySelector('.status-text');
    if (statusFooter) {
        statusFooter.innerHTML = `[ DOWNLOADING INTEL: ${percent}% ]`;
    }
});

window.electronAPI.onUpdateStatus((message) => {
    const statusFooter = document.querySelector('.status-text');
    if (statusFooter) {
        statusFooter.innerHTML = `[ ${message} ]`;
    }
});

window.electronAPI.onAppVersion((version) => {
    const tag = document.querySelector('.version-tag');
    if (tag) tag.innerText = `v${version}`;
});