/**
 * library.js
 * ------------------------------------------------------------
 * Panneaux latéraux "Library" — auto-scannent les dossiers
 * `./assets/<category>/` via le directory listing HTTP renvoyé
 * par le serveur (Python http.server, Node serve, etc.).
 *
 * Chemins 100% relatifs (`./assets/...`) → portable :
 * si le dossier projet est déplacé, ça continue de marcher.
 * ------------------------------------------------------------
 */

import { copyFilePath, copyFolderPath } from './pathutils.js';

// Tous les formats supportés en chargement principal
const VALID_EXT = /\.(hdr|exr|tif|tiff|dpx|jpg|jpeg|png|webp|bmp)$/i;

// Formats VFX prioritaires (le viewer charge toujours l'original
// quand il existe, jamais le thumbnail JPEG)
const PRIORITY_EXT = ['hdr', 'exr', 'dpx', 'tif', 'tiff'];

// Suffixe des thumbnails générés par make-previews.bat
const THUMB_SUFFIX_RE = /_thumb\.(jpg|jpeg|png)$/i;

// SVG icons inline (12px) — utilisés dans les boutons des cards
const SVG_COPY = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11 V3 a1 1 0 0 1 1 -1 h8"/></svg>`;
const SVG_FOLDER = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5 a1 1 0 0 1 1 -1 h3 l1.5 1.5 h5.5 a1 1 0 0 1 1 1 v6 a1 1 0 0 1 -1 1 h-10 a1 1 0 0 1 -1 -1 z"/></svg>`;

/**
 * Initialise un panneau Library.
 *
 * @param {HTMLElement} panel        - Élément racine du panneau
 * @param {string[]}    categories   - Liste de catégories (sous-dossiers de ./assets/)
 * @param {(file:File)=>Promise<void>} onSelect - Callback appelé quand l'utilisateur clique un item
 */
// Registre des refresh callbacks pour pouvoir tout rafraîchir après un build
const refreshCallbacks = [];

export function refreshAllLibraries() {
    return Promise.all(refreshCallbacks.map(fn => fn()));
}

export async function initLibrary(panel, categories, onSelect) {

    // --- Bouton refresh global du panneau ---
    const refreshBtn = panel.querySelector('.library-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadAll(true));
    }

    async function loadAll(force = false) {
        for (const cat of categories) {
            await loadCategory(cat);
        }
    }

    // Enregistre dans le registre global
    refreshCallbacks.push(loadAll);

    async function loadCategory(cat) {
        const ul = panel.querySelector(`[data-category="${cat}"] .library-items`);
        const countEl = panel.querySelector(`[data-category="${cat}"] .library-count`);
        if (!ul) return;

        ul.innerHTML = '<li class="library-status">Chargement…</li>';
        if (countEl) countEl.textContent = '';

        try {
            const items = await listCategory(cat);

            if (items.length === 0) {
                ul.innerHTML = `<li class="library-empty">— vide —<br><span class="library-hint">déposez des fichiers dans <code>assets/${cat}/</code></span></li>`;
                if (countEl) countEl.textContent = '0';
                return;
            }

            ul.innerHTML = '';
            for (const item of items) {
                const li = renderItem(item, onSelect);
                ul.appendChild(li);
            }
            if (countEl) countEl.textContent = String(items.length);
        } catch (err) {
            console.error(`[library] ${cat}`, err);
            ul.innerHTML = '<li class="library-status library-error">Indisponible</li>';
        }
    }

    await loadAll();
}

// ============================================================
// Liste les fichiers d'une catégorie.
//
// Stratégie en cascade (du plus pratique au plus portable) :
//   1. Directory listing HTTP (Python http.server, Node serve, etc.)
//      → fonctionne en mode LOCAL avec start-server.bat
//   2. manifest.json (fichier statique listant les images)
//      → fonctionne en mode WEB (GitHub Pages, Netlify, etc.)
//   3. Dossier vide / inaccessible → renvoie []
// ============================================================
async function listCategory(cat) {
    const url = `./assets/${cat}/`;

    // === Tentative 1 : directory listing ===
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
            const ct = res.headers.get('content-type') || '';
            const html = await res.text();
            if (ct.includes('html') && html.includes('<a ')) {
                const items = parseDirectoryListing(html, url, cat);
                if (items.length > 0) return items;
                // listing vide → essaie manifest avant de retourner []
            }
        }
    } catch (e) {
        // CORS, 404, etc. → on tente le manifest
    }

    // === Tentative 2 : manifest.json (mode web) ===
    try {
        const mres = await fetch(`${url}manifest.json`, { cache: 'no-store' });
        if (mres.ok) {
            const manifest = await mres.json();
            return parseManifest(manifest, url, cat);
        }
    } catch (e) {
        // pas de manifest → fall through
    }

    return [];
}

/**
 * Parse le HTML d'un directory listing (Python http.server / Node serve).
 * Extrait les fichiers supportés et associe primaires ↔ thumbnails.
 */
function parseDirectoryListing(html, url, cat) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = [...doc.querySelectorAll('a')];

    const allFiles = [];
    for (const a of anchors) {
        const href = a.getAttribute('href');
        if (!href) continue;
        if (href.startsWith('/') || href.startsWith('..') ||
            href.endsWith('/') || href.startsWith('?') ||
            href.startsWith('#')) continue;
        if (!VALID_EXT.test(href)) continue;

        const name = decodeURIComponent(href.replace(/^.*\//, ''));
        allFiles.push({
            name,
            url: url + href,
            ext: name.split('.').pop().toLowerCase()
        });
    }

    return pairAndSort(allFiles, url, cat);
}

/**
 * Parse un manifest.json (mode web : GitHub Pages / Netlify / etc.)
 * Format attendu :
 *   { "files": ["sky01.hdr", "sky01_thumb.jpg", ...] }
 */
function parseManifest(manifest, url, cat) {
    if (!manifest || !Array.isArray(manifest.files)) return [];

    const allFiles = [];
    for (const name of manifest.files) {
        if (!VALID_EXT.test(name)) continue;
        allFiles.push({
            name,
            url: url + encodeURIComponent(name),
            ext: name.split('.').pop().toLowerCase()
        });
    }
    return pairAndSort(allFiles, url, cat);
}

/**
 * Logique commune : sépare thumbnails / primaires, les apparie, tri.
 */
function pairAndSort(allFiles, url, cat) {
    const thumbsByBase = new Map();
    const primaries = [];
    for (const f of allFiles) {
        if (THUMB_SUFFIX_RE.test(f.name)) {
            const base = f.name.replace(THUMB_SUFFIX_RE, '');
            thumbsByBase.set(base, f.url);
        } else {
            primaries.push(f);
        }
    }

    for (const p of primaries) {
        const base = p.name.replace(/\.[^.]+$/, '');
        if (thumbsByBase.has(base)) {
            p.thumbUrl = thumbsByBase.get(base);
        }
        p.isPriority = PRIORITY_EXT.includes(p.ext);
        p.category = cat;
    }

    primaries.sort((a, b) => {
        if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    return primaries;
}

// ============================================================
// Construit un <li> pour un item de la library
// Format card : thumbnail au-dessus, badge + nom en dessous.
// Le click charge TOUJOURS le fichier original (priorité formats VFX),
// le thumbnail JPEG n'est utilisé que pour l'affichage.
// ============================================================
function renderItem(item, onSelect) {
    const li = document.createElement('li');
    li.className = 'library-item';
    if (item.isPriority) li.classList.add('library-item-priority');
    li.title = `${item.name}  ·  click pour charger ${item.isPriority ? "(format VFX d'origine)" : ''}`;

    // --- Thumbnail (preview JPEG si dispo, sinon placeholder gradient) ---
    const thumb = document.createElement('div');
    thumb.className = 'library-thumb';
    if (item.thumbUrl) {
        thumb.style.backgroundImage = `url("${item.thumbUrl}")`;
    } else {
        thumb.classList.add('library-thumb-empty');
        thumb.textContent = 'no preview';
    }

    // --- Overlay d'actions (apparait au survol) ---
    const actions = document.createElement('div');
    actions.className = 'library-item-actions';

    const btnCopyPath = document.createElement('button');
    btnCopyPath.type = 'button';
    btnCopyPath.className = 'library-action-btn';
    btnCopyPath.title = 'Copier le chemin du fichier';
    btnCopyPath.innerHTML = SVG_COPY;
    btnCopyPath.addEventListener('click', (e) => {
        e.stopPropagation(); // pas de load
        copyFilePath(item.url);
    });

    const btnOpenFolder = document.createElement('button');
    btnOpenFolder.type = 'button';
    btnOpenFolder.className = 'library-action-btn';
    btnOpenFolder.title = 'Copier le chemin du dossier (Win+R pour ouvrir)';
    btnOpenFolder.innerHTML = SVG_FOLDER;
    btnOpenFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        copyFolderPath(item.url);
    });

    actions.appendChild(btnCopyPath);
    actions.appendChild(btnOpenFolder);
    thumb.appendChild(actions);

    // --- Ligne meta : badge + nom ---
    const meta = document.createElement('div');
    meta.className = 'library-item-row';

    const badge = document.createElement('span');
    badge.className = `library-badge ext-${item.ext}`;
    badge.textContent = item.ext.toUpperCase();

    const name = document.createElement('span');
    name.className = 'library-item-name';
    name.textContent = item.name.replace(/\.[^.]+$/, '');

    meta.appendChild(badge);
    meta.appendChild(name);

    li.appendChild(thumb);
    li.appendChild(meta);

    li.addEventListener('click', async () => {
        document.querySelectorAll('.library-item.active').forEach(el => el.classList.remove('active'));
        li.classList.add('loading');

        try {
            // IMPORTANT : on charge le fichier ORIGINAL (item.url),
            // pas le thumbnail. Pour HDR/EXR/DPX/TIFF c'est l'original
            // VFX qui passe dans le pipeline loadFile().
            const file = await fetchAsFile(item.url, item.name);
            // On passe aussi item.url pour que main.js puisse l'utiliser
            // dans les actions "copy path / open folder" du header.
            await onSelect(file, item.url);
            li.classList.add('active');
        } catch (err) {
            console.error('[library] load item failed', err);
        } finally {
            li.classList.remove('loading');
        }
    });

    return li;
}

// ============================================================
// Récupère une ressource HTTP et l'enveloppe dans un File
// pour la passer au pipeline loadFile() existant.
// ============================================================
async function fetchAsFile(url, filename) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
}
