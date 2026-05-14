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

    static names = {
        MG: 'Metal Gear',
        SR: "Snake's Revenge",
        MG2: 'Metal Gear 2',
        MGS: 'Metal Gear Solid',
        GB: 'Ghost Babel',
        MGS2: 'Sons of Liberty',
        MGS3: 'Snake Eater',
        ACID: 'Metal Gear Ac!d',
        ACID2: 'Metal Gear Ac!d 2',
        PO: 'Portable Ops',
        MGS4: 'Guns of the Patriots',
        PW: 'Peace Walker'
    };

    static getKeyByTarget(target) {
        for (const key of Object.keys(this)) {
            if (typeof this[key] === 'string' && this[key] === target) {
                return key;
            }
        }
        return null;
    }

    static getKeyByName(name) {
        for (const [key, value] of Object.entries(this.names)) {
            if (value === name) {
                return key;
            }
        }
        return null;
    }

    static getFolderName(key, fallback = '') {
        return (fallback || this.names[key] || key || 'default')
            .replace(/[\\/:*?"<>|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

function formatPlaytime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const RECENT_GAME_STORAGE_KEY = 'mgs-last-played-game';
window.cachedPlaytimes = {};

function saveLastPlayedGame(gameContext, type, target, emu, steamExe = '') {
    if (!gameContext) return;
    const payload = {
        type,
        target,
        emu,
        steamExe,
        gameKey: gameContext.romKey || '',
        displayName: gameContext.displayName || '',
        isRetro: gameContext.emuType === 'retro',
        gameFolder: gameContext.gameFolder || '',
        legacyKeys: gameContext.legacyKeys || []
    };
    localStorage.setItem(RECENT_GAME_STORAGE_KEY, JSON.stringify(payload));
}

function loadLastPlayedGame() {
    try {
        const raw = localStorage.getItem(RECENT_GAME_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.error('Failed to load last played game:', err);
        return null;
    }
}

function renderRecentGameButton(playtimes = {}) {
    const container = document.getElementById('recent-game-container');
    if (!container) return;

    const recent = loadLastPlayedGame();
    if (!recent || !recent.displayName || !recent.type || !recent.target) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = '';

    const card = document.createElement('div');
    card.id = 'recent-game-card';
    card.className = 'game-card resume-card';
    card.dataset.gameKey = recent.gameKey || '';
    card.dataset.emu = recent.emu || '';
    card.dataset.retro = recent.isRetro ? 'true' : 'false';
    card.dataset.desc = recent.displayName;
    card.setAttribute('oncontextmenu', 'openIntelMenu(event, this)');
    card.setAttribute('onclick', `missionControl(event, ${JSON.stringify(recent.type)}, ${JSON.stringify(recent.target)}, ${JSON.stringify(recent.emu)}, ${JSON.stringify(recent.steamExe || '')})`);

    const runningKey = localStorage.getItem('running-game-key');
    if (runningKey === recent.gameKey) {
        card.classList.add('running');
    }

    const intelTrigger = document.createElement('div');
    intelTrigger.className = 'intel-trigger';
    intelTrigger.setAttribute('onclick', 'openIntelMenu(event, this.parentElement)');
    intelTrigger.textContent = '...';

    const statusOverlay = document.createElement('div');
    statusOverlay.className = 'status-overlay';
    statusOverlay.innerHTML = '<div class="play-icon"></div><div class="pause-icon"></div>';

    const tag = document.createElement('div');
    tag.className = 'canon-tag tag-resume';
    tag.textContent = 'CONTINUE THE MISSION';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'title-wrap';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'game-title';
    titleSpan.textContent = recent.displayName;
    titleWrap.appendChild(titleSpan);

    const playtimeSpan = document.createElement('div');
    playtimeSpan.className = 'playtime';
    playtimeSpan.textContent = `Playtime: ${formatPlaytime(playtimes[recent.gameKey] || 0)}`;

    card.append(intelTrigger, statusOverlay, tag, titleWrap, playtimeSpan);
    container.appendChild(card);
}

const steamAppIdToKey = {
    '235460': 'MGR', // Revengeance
    '311340': 'GZ', // Ground Zeroes
    '543900': 'MGSURVIVE',
    '287700': 'MGSV' // Phantom Pain
};

window.activeProfile = "default";
window.currentTargetGame = "";
window.currentTargetGameKey = "";
window.currentTargetLegacyKeys = [];
window.currentTargetDisplayName = "";
window.currentTargetEmu = "";
let activeIntelCard = null;

function getEmuType(emuPath = '') {
    return emuPath.split('/')[0];
}

function savesSupportedForEmu(emuPath = '') {
    return getEmuType(emuPath) !== 'xenia';
}

function getActiveProfileStorageKey(gameFolder) {
    return `active-profile-${gameFolder}`;
}

function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, "\\'");
}

function getCardGameContext(cardElement, fallbackTarget = '', fallbackEmu = '') {
    const clickAttr = cardElement?.getAttribute('onclick') || '';
    const titleElement = cardElement?.querySelector('.game-title');
    const displayName = titleElement ? titleElement.innerText.trim() : '';
    const romKey = (() => {
        // Check dataset first (for resume card)
        if (cardElement?.dataset?.gameKey) {
            return cardElement.dataset.gameKey;
        }
        const romMatch = clickAttr.match(/romPaths\.([A-Z0-9_]+)/);
        if (romMatch) {
            return romMatch[1];
        }
        if (displayName) {
            const nameKey = romPaths.getKeyByName(displayName);
            if (nameKey) return nameKey;
        }
        return romPaths.getKeyByTarget(fallbackTarget) || '';
    })();
    const emuPath = (() => {
        // Check dataset first
        if (cardElement?.dataset?.emu) {
            return cardElement.dataset.emu;
        }
        const emuMatch = clickAttr.match(/emuPaths\.([A-Z0-9_]+)/);
        if (emuMatch) {
            return emuPaths[emuMatch[1]] || '';
        }
        return fallbackEmu || '';
    })();
    const resolvedDisplayName = displayName || (romPaths.names[romKey] || romKey || fallbackTarget);

    return {
        romKey,
        emuPath,
        emuType: getEmuType(emuPath),
        displayName: resolvedDisplayName,
        gameFolder: romPaths.getFolderName(romKey, resolvedDisplayName),
        legacyKeys: romKey ? [romKey] : []
    };
}

const manualFileMap = {
    MG: 'MG_Manual.pdf',
    MG2: 'MG2_Manual.pdf',
    MGS: 'MGS_Manual.pdf',
    GB: 'GB_Manual.pdf',
    SR: 'SR_Manual.pdf',
    MGS2: 'MGS2_Manual.pdf',
    MGS3: 'MGS3_Manual.pdf',
    ACID: 'ACID_Manual.pdf',
    ACID2: 'ACID2_Manual.pdf',
    PO: 'PO_Manual.pdf',
    MGS4: 'MGS4_Manual.pdf',
    PW: 'PW_Manual.pdf',
    MGR: 'MGR_Manual.pdf',
    MGSV: 'MGSV_Manual.pdf'
};

function getManualFileName(gameContext) {
    if (!gameContext) return null;

    if (gameContext.romKey && manualFileMap[gameContext.romKey]) {
        return manualFileMap[gameContext.romKey];
    }

    const normalizedName = (gameContext.displayName || '').toLowerCase();
    if (normalizedName.includes('phantom pain') || normalizedName.includes('mgsv') || normalizedName.includes('the phantom pain')) {
        return manualFileMap.MGSV;
    }
    if (normalizedName.includes('mgr') || normalizedName.includes('revengeance') || normalizedName.includes('metal gear rising')) {
        return manualFileMap.MGR;
    }

    return null;
}

function getAppRootUrl() {
    const href = window.location.href;
    const pagesIndex = href.indexOf('/pages/');
    if (pagesIndex !== -1) {
        return href.substring(0, pagesIndex);
    }
    return href.substring(0, href.lastIndexOf('/') + 1).replace(/\/$/, '');
}

function getManualUrl(filename) {
    const root = getAppRootUrl();
    return `${root.replace(/\/$/, '')}/img/manuals/${filename}`;
}

function openManualViewer(e, cardElement) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const gameContext = getCardGameContext(cardElement);
    const manualFile = getManualFileName(gameContext);
    if (!manualFile) {
        closeIntelMenu();
        alert(`NO MANUAL FOUND FOR ${gameContext.displayName.toUpperCase()}`);
        return;
    }

    const manualUrl = getManualUrl(manualFile);
    let overlay = document.getElementById('manual-viewer-overlay');

    const manualViewerHtml = `
        <div id="manual-viewer-modal">
            <div class="manual-viewer-header">
                <div id="manual-viewer-title">MANUAL: ${gameContext.displayName.toUpperCase()}</div>
                <button id="manual-viewer-close" class="btn-mgs btn-sm-mgs">CLOSE</button>
            </div>
            <div id="manual-viewer-content">
                <iframe id="manual-viewer-frame" src="${manualUrl}" frameborder="0" allowfullscreen></iframe>
                <div class="manual-viewer-fallback">
                    <p>PDF rendering failed. Use the button below to open the manual directly.</p>
                    <a id="manual-viewer-link" class="btn-mgs" href="${manualUrl}" target="_blank">OPEN MANUAL</a>
                </div>
            </div>
        </div>
    `;

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'manual-viewer-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = manualViewerHtml;
    overlay.onclick = (ev) => {
        if (ev.target.id === 'manual-viewer-overlay') closeManualViewer();
    };

    const closeButton = overlay.querySelector('#manual-viewer-close');
    if (closeButton) closeButton.addEventListener('click', closeManualViewer);

    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('active'), 10);
    closeIntelMenu();
}

function closeManualViewer() {
    const overlay = document.getElementById('manual-viewer-overlay');
    if (!overlay) return;

    overlay.classList.remove('active');
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 200);
}

window.openManualViewer = openManualViewer;

// ---------- PROFILE NAME VALIDATION ----------
// Valid Windows folder name: no \ / : * ? " < > | and not purely dots/spaces
const WINDOWS_FORBIDDEN = /[\\/:*?"<>|]/;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function applyThemeToOverlays(theme) {
    const settingsSidebar = document.getElementById('settings-sidebar');
    const saveManagerOverlay = document.getElementById('save-manager-overlay');
    const saveManagerModal = document.getElementById('save-manager-modal');

    if (settingsSidebar) settingsSidebar.setAttribute('data-theme', theme);
    if (saveManagerOverlay) saveManagerOverlay.setAttribute('data-theme', theme);
    if (saveManagerModal) saveManagerModal.setAttribute('data-theme', theme);
}

function validateProfileName(name) {
    if (!name || !name.trim()) return "NAME CANNOT BE EMPTY.";
    if (WINDOWS_FORBIDDEN.test(name)) return 'INVALID CHARACTERS: \\ / : * ? " < > |';
    if (WINDOWS_RESERVED.test(name.trim())) return "RESERVED SYSTEM NAME — CHOOSE ANOTHER.";
    if (name.trim().length > 30) return "MAX 30 CHARACTERS.";
    return null; // null = valid
}

// ---------- CREATE PROFILE ----------
window.createNewProfile = function() {
    const menu = document.getElementById('profile-creation-menu');
    const input = document.getElementById('new-profile-input');
    const err = document.getElementById('profile-create-error');
    if (menu) {
        menu.style.display = 'flex';
        input.value = "";
        if (err) err.textContent = "";
        input.focus();
    }
};

window.closeProfileMenu = function() {
    const menu = document.getElementById('profile-creation-menu');
    if (menu) menu.style.display = 'none';
};

window.confirmProfileCreation = async function() {
    const input = document.getElementById('new-profile-input');
    const errEl = document.getElementById('profile-create-error');
    const rawName = input.value.trim();

    const validationError = validateProfileName(rawName);
    if (validationError) {
        if (errEl) errEl.textContent = validationError;
        return;
    }

    try {
        const result = await window.electronAPI.createSaveProfile({
            game: window.currentTargetGame,
            profile: rawName,
            legacyKeys: window.currentTargetLegacyKeys
        });

        if (result && result.success) {
            window.closeProfileMenu();
            if (window.refreshProfileList) window.refreshProfileList();
        } else if (result && result.error) {
            if (errEl) errEl.textContent = result.error;
        }
    } catch (err) {
        console.error("IPC Error:", err);
    }
};

// ---------- RENAME PROFILE ----------
let _profileBeingRenamed = null;

window.openRenameMenu = function(profileName) {
    _profileBeingRenamed = profileName;
    const menu = document.getElementById('profile-rename-menu');
    const input = document.getElementById('rename-profile-input');
    const err = document.getElementById('profile-rename-error');
    const confirmBtn = document.getElementById('profile-rename-confirm-btn');
    if (menu) {
        input.value = profileName;
        if (err) err.textContent = "";
        input.disabled = false;
        if (confirmBtn) confirmBtn.disabled = false;
        if (profileName.toLowerCase() === 'default') {
            if (err) err.textContent = "DEFAULT PROFILE CANNOT BE RENAMED.";
            input.disabled = true;
            if (confirmBtn) confirmBtn.disabled = true;
        }
        menu.style.display = 'flex';
        if (!input.disabled) {
            input.focus();
            input.select();
        }
    }
};

window.closeRenameMenu = function() {
    const menu = document.getElementById('profile-rename-menu');
    const input = document.getElementById('rename-profile-input');
    const err = document.getElementById('profile-rename-error');
    const confirmBtn = document.getElementById('profile-rename-confirm-btn');
    if (menu) menu.style.display = 'none';
    if (input) input.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    if (err) err.textContent = "";
    _profileBeingRenamed = null;
};

window.confirmProfileRename = async function() {
    const input = document.getElementById('rename-profile-input');
    const errEl = document.getElementById('profile-rename-error');
    const newName = input.value.trim();

    if ((_profileBeingRenamed || '').toLowerCase() === 'default') {
        if (errEl) errEl.textContent = "DEFAULT PROFILE CANNOT BE RENAMED.";
        return;
    }

    const validationError = validateProfileName(newName);
    if (validationError) {
        if (errEl) errEl.textContent = validationError;
        return;
    }

    if (newName === _profileBeingRenamed) {
        window.closeRenameMenu();
        return;
    }

    try {
        const result = await window.electronAPI.renameProfile({
            gameKey: window.currentTargetGame,
            oldName: _profileBeingRenamed,
            newName,
            legacyKeys: window.currentTargetLegacyKeys
        });

        if (result && result.success) {
            if (window.activeProfile === _profileBeingRenamed) {
                window.activeProfile = newName;
                localStorage.setItem(getActiveProfileStorageKey(window.currentTargetGame), newName);
            }
            window.closeRenameMenu();
            if (window.refreshProfileList) window.refreshProfileList();
        } else {
            if (errEl) errEl.textContent = result?.error || "RENAME FAILED.";
        }
    } catch (err) {
        console.error("Rename error:", err);
    }
};

// ---------- DELETE PROFILE ----------
let _profileBeingDeleted = null;

window.openDeleteMenu = function(profileName) {
    _profileBeingDeleted = profileName;
    const menu = document.getElementById('profile-delete-menu');
    const label = document.getElementById('profile-delete-label');
    if (label) label.textContent = `PROFILE: [ ${profileName.toUpperCase()} ]`;
    if (menu) menu.style.display = 'flex';
};

window.closeDeleteMenu = function() {
    const menu = document.getElementById('profile-delete-menu');
    if (menu) menu.style.display = 'none';
    _profileBeingDeleted = null;
};

window.confirmProfileDelete = async function() {
    if (!_profileBeingDeleted) return;

    try {
        const result = await window.electronAPI.deleteProfile({
            gameKey: window.currentTargetGame,
            profile: _profileBeingDeleted,
            legacyKeys: window.currentTargetLegacyKeys
        });

        if (result && result.success) {
            // If we deleted the active profile, fall back to 'default'
            if (window.activeProfile === _profileBeingDeleted) {
                window.activeProfile = 'default';
                localStorage.setItem(getActiveProfileStorageKey(window.currentTargetGame), 'default');
            }
            window.closeDeleteMenu();
            if (window.refreshProfileList) window.refreshProfileList();
        } else {
            console.error("Delete failed:", result?.error);
        }
    } catch (err) {
        console.error("Delete error:", err);
    }
};

// ---------- PROFILE LIST ----------
window.refreshProfileList = async function() {
    const profileList = document.getElementById('profile-list');
    const backupList = document.getElementById('backup-list-manager');
    const saveStateNotice = document.getElementById('save-state-notice');

    if (!profileList || !window.currentTargetGame) return;

    profileList.innerHTML = '';
    backupList.innerHTML = '';
    if (saveStateNotice) {
        saveStateNotice.textContent = savesSupportedForEmu(window.currentTargetEmu)
            ? 'SELECT A SAVE TO MAKE IT THE CURRENT SAVE FOR THIS PROFILE.'
            : 'SAVE STATE ROTATION IS DISABLED FOR XENIA.';
    }

    try {
        const profiles = await window.electronAPI.getProfiles({
            gameKey: window.currentTargetGame,
            legacyKeys: window.currentTargetLegacyKeys
        });

        if (!profiles || profiles.length === 0) {
            profileList.innerHTML = `<div class="profile-empty">NO SAVE PROFILES FOUND</div>`;
            return;
        }

        let activeProfileToLoad = null;

        for (const profile of profiles) {
            const isActive = profile === window.activeProfile;

            const row = document.createElement('div');
            row.className = `profile-row${isActive ? ' profile-row--active' : ''}`;
            row.dataset.profile = profile;

            row.innerHTML = `
                <div class="profile-row__name" title="${profile}">
                    ${isActive ? '<span class="profile-active-pip"></span>' : ''}
                    ${profile.toUpperCase()}
                </div>
                <div class="profile-row__actions">
                    <button class="profile-action-btn" title="Rename" onclick="window.openRenameMenu('${profile.replace(/'/g, "\\'")}')">✎</button>
                    <button class="profile-action-btn profile-action-btn--danger" title="Delete" onclick="window.openDeleteMenu('${profile.replace(/'/g, "\\'")}')">✕</button>
                </div>
            `;

            const actionButtons = row.querySelectorAll('.profile-action-btn');
            const renameBtn = actionButtons[0];
            const deleteBtn = actionButtons[1];

            if (renameBtn) {
                renameBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.openRenameMenu(profile);
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.openDeleteMenu(profile);
                });
            }

            // Clicking the row (not its buttons) selects the profile and loads backups
            row.addEventListener('click', async (e) => {
                if (e.target.closest('.profile-row__actions')) return;

                window.activeProfile = profile;
                localStorage.setItem(getActiveProfileStorageKey(window.currentTargetGame), profile);
                await window.electronAPI.loadProfile({
                    gameKey: window.currentTargetGame,
                    profile,
                    emuType: getEmuType(window.currentTargetEmu),
                    legacyKeys: window.currentTargetLegacyKeys
                });

                // Update active styling without full reload
                document.querySelectorAll('.profile-row').forEach(r => {
                    const pip = r.querySelector('.profile-active-pip');
                    if (pip) pip.remove();
                    r.classList.remove('profile-row--active');
                });
                row.classList.add('profile-row--active');
                const nameEl = row.querySelector('.profile-row__name');
                if (nameEl && !nameEl.querySelector('.profile-active-pip')) {
                    const pip = document.createElement('span');
                    pip.className = 'profile-active-pip';
                    nameEl.prepend(pip);
                }

                await loadSavesForProfile(profile);
            });

            profileList.appendChild(row);

            if (isActive) {
                activeProfileToLoad = profile;
            }
        }

        if (activeProfileToLoad) {
            await loadSavesForProfile(activeProfileToLoad);
        }

    } catch (err) {
        console.error("PROFILE LOAD ERROR:", err);
    }
};

async function activateSaveSlot(slotId) {
    return window.electronAPI.activateSaveSlot({
        gameKey: window.currentTargetGame,
        profile: window.activeProfile,
        emuType: getEmuType(window.currentTargetEmu),
        slotId,
        legacyKeys: window.currentTargetLegacyKeys
    });
}

async function loadSavesForProfile(profile) {
    const backupList = document.getElementById('backup-list-manager');
    if (!backupList) return;

    backupList.innerHTML = '';

    if (!savesSupportedForEmu(window.currentTargetEmu)) {
        backupList.innerHTML = `<div class="profile-empty">SAVE STATES NOT AVAILABLE FOR XENIA</div>`;
        return;
    }

    try {
        const backups = await window.electronAPI.getSaveSlots({
            gameKey: window.currentTargetGame,
            profile,
            emuType: getEmuType(window.currentTargetEmu),
            legacyKeys: window.currentTargetLegacyKeys
        });

        if (!backups || backups.length === 0) {
            backupList.innerHTML = `<div class="profile-empty">NO SAVES FOUND</div>`;
            return;
        }

        backups.forEach(backup => {
            const item = document.createElement('div');
            item.className = `backup-item${backup.isCurrent ? ' backup-item--current' : ''}`;
            // Format: 2024-01-15T14-30-00 → 2024-01-15 14:30:00
            const pretty = backup.type === 'current'
                ? 'CURRENT SAVE'
                : backup.label.replace('T', ' ').replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
            item.innerHTML = `
                <div class="backup-item__text">
                    <span class="backup-item__label">${pretty}</span>
                    <span class="backup-item__meta">${backup.type === 'current' ? 'ACTIVE FOR THIS PROFILE' : 'LOAD AS CURRENT SAVE'}</span>
                </div>
                ${backup.type === 'backup' ? `<button class="profile-action-btn backup-load-btn" data-slot="${escapeAttr(backup.id)}">LOAD</button>` : `<span class="backup-item__badge">LIVE</span>`}
            `;
            if (backup.type === 'backup') {
                const loadButton = item.querySelector('.backup-load-btn');
                loadButton.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    const result = await activateSaveSlot(backup.id);
                    if (result?.success) {
                        await window.electronAPI.loadProfile({
                            gameKey: window.currentTargetGame,
                            profile,
                            emuType: getEmuType(window.currentTargetEmu),
                            legacyKeys: window.currentTargetLegacyKeys
                        });
                        await loadSavesForProfile(profile);
                    }
                });
            }
            backupList.appendChild(item);
        });

    } catch (err) {
        console.error("SAVE LOAD ERROR:", err);
    }
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
    applyThemeToOverlays(theme);
}

function applyLazyLoadingToGameCards() {
    const images = document.querySelectorAll('.game-card img');
    images.forEach(img => {
        if (!img.hasAttribute('loading')) {
            img.loading = 'lazy';
        }
        if (!img.hasAttribute('decoding')) {
            img.decoding = 'async';
        }
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.25s ease-in-out';
        img.addEventListener('load', () => {
            img.style.opacity = '1';
        });
    });
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

function refreshSettingsUI() {
    const fsState = getPref('fullscreen-pref', false);
    if (typeof syncFullscreenUI === 'function') syncFullscreenUI(fsState);
    if (typeof updateEffectsBtnUI === 'function') updateEffectsBtnUI();
    if (typeof loadMonitors === 'function') loadMonitors();
    if (typeof applyTheme === 'function') applyTheme();
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
    applyLazyLoadingToGameCards();

    // Load and display playtimes
    const playtimes = await window.electronAPI.getPlaytimes();
    window.cachedPlaytimes = playtimes;
    document.querySelectorAll('.game-card').forEach(card => {
        const key = card.dataset.gameKey;
        const time = playtimes[key] || 0;
        const span = card.querySelector('.playtime');
        if (span) span.textContent = `Playtime: ${formatPlaytime(time)}`;
    });
    renderRecentGameButton(playtimes);

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
            
            sidebar = document.createElement('div');
            sidebar.id = 'settings-sidebar';
            sidebar.innerHTML = html;
            document.body.appendChild(sidebar);

            overlay = document.createElement('div');
            overlay.id = 'settings-overlay';
            overlay.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSettings();
            };
            document.body.appendChild(overlay);
            refreshSettingsUI();

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
        refreshSettingsUI();
    }
}

function openIntelMenu(e, cardElement) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    activeIntelCard = cardElement;

    const clickAttr = cardElement.getAttribute('onclick') || "";
    const targetMatch = clickAttr.match(/missionControl\(event,\s*['"][^'"]+['"],\s*(?:romPaths\.([A-Z0-9_]+)|['"]([^'"]+)['"])/);
    const target = targetMatch?.[1] ? romPaths[targetMatch[1]] : (targetMatch?.[2] || '');
    const emuMatch = clickAttr.match(/missionControl\(event,\s*['"][^'"]+['"],\s*(?:romPaths\.[A-Z0-9_]+|['"][^'"]+['"]),\s*(?:emuPaths\.([A-Z0-9_]+)|['"]([^'"]*)['"])/);
    const emuPath = emuMatch?.[1] ? emuPaths[emuMatch[1]] : (emuMatch?.[2] || '');
    const gameContext = getCardGameContext(cardElement, target, emuPath);
    const detectedKey = gameContext.romKey || 'UNKNOWN_MISSION';
    const detectedEmu = gameContext.emuPath;
    const displayName = gameContext.displayName || detectedKey;

    let menu = document.getElementById('intel-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'intel-menu';
        document.body.appendChild(menu);
    }

    const isEmu = /missionControl\(event,\s*['"]emu['"]/.test(clickAttr);
    const saveButton = isEmu 
        ? `<div class="intel-menu-item" onclick="openSaveManager(event, '${escapeAttr(detectedKey)}', '${escapeAttr(detectedEmu)}', '${escapeAttr(displayName)}')">[ MANAGE SAVES ]</div>` 
        : '';

    const manualFile = getManualFileName(gameContext);
    const manualButton = manualFile
        ? `<div class="intel-menu-item" onclick="openManualViewer(event, activeIntelCard)">[ VIEW MANUAL ]</div>`
        : `<div class="intel-menu-item intel-menu-item--disabled">[ MANUAL UNAVAILABLE ]</div>`;

    menu.innerHTML = `
        <div class="intel-menu-item" onclick="launchFromIntelMenu()">[ LAUNCH MISSION ]</div>
        <div class="intel-menu-divider"></div>
        ${saveButton}
        ${manualButton}
        <div class="intel-menu-divider"></div>
        <div class="intel-menu-item" style="color: #ff4444;" onclick="closeIntelMenu()">CANCEL</div>
    `;

    menu.style.display = 'block';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    setTimeout(() => document.addEventListener('click', closeIntelMenu, { once: true }), 50);
}

async function openSaveManager(e, romKey, emuPath, displayName) {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    window.currentTargetGame = romPaths.getFolderName(romKey, displayName);
    window.currentTargetGameKey = romKey;
    window.currentTargetLegacyKeys = romKey ? [romKey] : [];
    window.currentTargetDisplayName = displayName;
    console.log(`[SYSTEM] Target Locked: ${window.currentTargetGame}`);

    let overlay = document.getElementById('save-manager-overlay');
    if (!overlay) {
        try {
            const saveManagerPath = `${getAppRootUrl()}/pages/save-manager.html`;
            const response = await fetch(saveManagerPath);
            const html = await response.text();
            
            overlay = document.createElement('div');
            overlay.id = 'save-manager-overlay';
            overlay.innerHTML = `<div id="save-manager-modal">${html}</div>`;
            document.body.appendChild(overlay);
            applyThemeToOverlays(getPref('mgs-theme', 'retro'));

            overlay.onclick = (ev) => { if (ev.target.id === 'save-manager-overlay') closeSaveManager(); };
        } catch (err) { return console.error("Load Failed:", err); }
    }

    overlay.style.display = 'flex';
    applyThemeToOverlays(getPref('mgs-theme', 'retro'));
    
    setTimeout(() => {
        overlay.classList.add('active');

        // Rebind the new profile button (avoids double-fire from inline onclick)
        const newProfileBtn = overlay.querySelector('button[onclick*="createNewProfile"]');
        if (newProfileBtn) {
            newProfileBtn.removeAttribute('onclick'); 
            newProfileBtn.onclick = () => window.createNewProfile();
        }

        const label = document.getElementById('active-game-label');
        if (label) label.innerText = `MISSION: ${displayName.toUpperCase()}`;

        window.activeProfile = localStorage.getItem(getActiveProfileStorageKey(window.currentTargetGame)) || 'default';
        window.currentTargetEmu = emuPath;
        if (window.refreshProfileList) window.refreshProfileList();
    }, 50);
}

function closeSaveManager() {
    const overlay = document.getElementById('save-manager-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => { overlay.style.display = 'none'; }, 300);
    }
}

function launchFromIntelMenu() {
    if (activeIntelCard) {
        activeIntelCard.click();
        closeIntelMenu();
    }
}

function closeIntelMenu() {
    const menu = document.getElementById('intel-menu');
    if (menu) menu.style.display = 'none';
}

let pendingCard = null;
let pendingSteamExe = "";

function missionControl(event, type, target, emu, steamExe = "") {
    const card = event.currentTarget;
    const gameContext = getCardGameContext(card, target, emu);

    if (card.classList.contains('running')) {
        const modal = document.getElementById('abort-modal');
        if (modal) modal.style.display = 'flex';
        pendingCard = card;
        pendingSteamExe = steamExe;
    } else {
        let gameKey;
        if (type === 'steam') {
            gameKey = steamAppIdToKey[target] || target;
        } else {
            gameKey = gameContext.romKey;
        }

        saveLastPlayedGame(gameContext, type, target, emu, steamExe);

        window.electronAPI.launchMission({
            type,
            target,
            emu,
            steamExe,
            gameKey,
            profile: localStorage.getItem(getActiveProfileStorageKey(gameContext.gameFolder)) || 'default',
            legacyKeys: gameContext.legacyKeys
        });
        
        localStorage.setItem('running-game-key', gameKey);
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
    pendingSteamExe = "";
}

let activeTime = 'all';
let activeStories = ['canon', 'parallel', 'ignored', 'alternate'];

function toggleTime(choice, btn) {
    document.querySelectorAll('#time-filters .btn-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    activeTime = choice;
    runMasterFilter();
}

function toggleStory(choice, btn) {
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
        
        let timeMatch = false;
        if (activeTime === 'all') timeMatch = true;
        if (activeTime === 'retro' && isRetro) timeMatch = true;
        if (activeTime === 'modern' && !isRetro) timeMatch = true;

        const storyMatch = activeStories.includes(cardCat);

        card.classList.toggle('hidden', !(timeMatch && storyMatch));
    });
}

// --- 6. EVENT LISTENERS ---
window.electronAPI.onMissionEnd(async (data) => {
    localStorage.removeItem('running-game-key');
    document.querySelectorAll('.game-card').forEach(c => c.classList.remove('running'));
    
    // Refresh playtimes from backend
    const playtimes = await window.electronAPI.getPlaytimes();
    document.querySelectorAll('.game-card').forEach(card => {
        const key = card.dataset.gameKey;
        const time = playtimes[key] || 0;
        const span = card.querySelector('.playtime');
        if (span) span.textContent = `Playtime: ${formatPlaytime(time)}`;
    });
});

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
    }
});
