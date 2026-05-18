/**
 * pathutils.js
 * ------------------------------------------------------------
 * - Configuration "Project Root" (chemin absolu) en localStorage
 *   pour reconstruire les chemins absolus à partir des URLs
 *   relatives `./assets/<cat>/<file>`.
 * - Helpers de copie clipboard.
 * - Détection automatique du séparateur (Windows \\ vs POSIX /).
 *
 * Le projet utilise toujours des URLs relatives pour rester
 * portable ; le "root" sert UNIQUEMENT à la copie de chemins
 * lisibles côté Explorer/DCC.
 * ------------------------------------------------------------
 */

import { showToast } from './toast.js';

const ROOT_KEY = 'hdriViewer.projectRoot';

/**
 * Récupère la valeur auto-générée par start-server.bat (via config.js).
 * Renvoie '' si le serveur a été lancé autrement (sans le .bat).
 */
function getAutoRoot() {
    return (typeof window !== 'undefined' && window.__SUR_HDRI_PROJECT_ROOT__) || '';
}

/**
 * Récupère le chemin du projet, en priorité :
 *   1) override manuel stocké dans localStorage
 *   2) valeur auto-détectée injectée par start-server.bat
 *   3) chaîne vide → prompt utilisateur (fallback)
 */
export function getRoot() {
    const stored = localStorage.getItem(ROOT_KEY);
    if (stored) return stored;
    return getAutoRoot();
}

export function setRoot(r) {
    if (typeof r !== 'string') return;
    const cleaned = r.trim().replace(/[\\/]+$/, '');
    if (cleaned) {
        localStorage.setItem(ROOT_KEY, cleaned);
        showToast(`Project root enregistré : ${cleaned}`, 'success');
    } else {
        localStorage.removeItem(ROOT_KEY);
        // Après reset, si auto-detect dispo, on revient dessus
        const auto = getAutoRoot();
        if (auto) {
            showToast(`Reset → auto-detection : ${auto}`, 'info', 4000);
        } else {
            showToast('Project root réinitialisé', 'info');
        }
    }
}

/**
 * Demande à l'utilisateur de configurer le project root.
 * Pré-rempli avec la valeur auto-détectée si dispo.
 * @returns {string|null} - le chemin saisi ou null si annulé
 */
export function promptRoot() {
    const current = getRoot();
    const auto = getAutoRoot();
    const isOverride = !!localStorage.getItem(ROOT_KEY);

    const lines = [
        "Chemin absolu du dossier projet (utilisé pour copier les chemins de fichiers) :",
        ""
    ];
    if (auto) {
        lines.push(`Auto-détecté par start-server.bat :`);
        lines.push(`  ${auto}`);
        lines.push('');
        if (isOverride) {
            lines.push(`(actuellement override manuel : ${current})`);
            lines.push('Laissez vide et OK pour revenir à l\'auto-détection.');
        } else {
            lines.push('Modifiez ci-dessous uniquement si nécessaire.');
        }
    } else {
        lines.push("Aucune valeur auto-détectée (lancez start-server.bat pour l'avoir).");
        lines.push("Exemple Windows : C:\\Users\\nom\\Desktop\\sur - HDRIs VIEWER");
        lines.push("Exemple macOS/Linux : /Users/nom/projects/sur-hdris-viewer");
    }
    lines.push('');
    lines.push('Ce chemin est stocké dans ton navigateur (localStorage).');

    const input = prompt(lines.join('\n'), current);
    if (input === null) return null;
    setRoot(input);
    return getRoot();
}

/**
 * S'assure qu'un root est configuré.
 * Avec config.js auto-généré → renvoie immédiatement sans prompt.
 * Sans config.js → prompt à l'utilisateur.
 * @returns {string|null}
 */
export function ensureRoot() {
    let root = getRoot();
    if (!root) {
        root = promptRoot();
    }
    return root || null;
}

/**
 * Construit un chemin absolu à partir d'une URL relative.
 * Renvoie null si le root n'est pas configuré.
 * @param {string} relativeUrl - ex: './assets/skies/sky01.exr'
 */
export function toAbsolutePath(relativeUrl) {
    const root = ensureRoot();
    if (!root) return null;

    const sep = root.includes('\\') ? '\\' : '/';
    const rel = relativeUrl
        .replace(/^\.\//, '')
        .replace(/^\//, '');

    // Décode les %20 etc. pour avoir un chemin lisible
    const decoded = decodeURIComponent(rel);

    return root + sep + decoded.replace(/\//g, sep);
}

/**
 * Retourne le dossier parent d'un chemin (Windows ou POSIX).
 */
export function getFolderOf(absolutePath) {
    const idx = Math.max(
        absolutePath.lastIndexOf('\\'),
        absolutePath.lastIndexOf('/')
    );
    return idx >= 0 ? absolutePath.substring(0, idx) : absolutePath;
}

/**
 * Copie un texte dans le presse-papier + toast feedback.
 * @param {string} text
 * @param {string} [label] - texte affiché dans le toast (sinon "Copié")
 */
export async function copyToClipboard(text, label = 'Copié') {
    if (!text) {
        showToast('Rien à copier', 'error');
        return false;
    }
    try {
        await navigator.clipboard.writeText(text);
        // Toast plus court pour ne pas spammer
        const preview = text.length > 60 ? text.substring(0, 57) + '…' : text;
        showToast(`${label} : ${preview}`, 'success', 2500);
        return true;
    } catch (err) {
        console.error('clipboard error', err);
        showToast('Échec copie clipboard', 'error');
        return false;
    }
}

/**
 * Détection mode WEB (déployé) vs LOCAL (start-server.bat).
 * - LOCAL : config.js a injecté un projectRoot OU localStorage en a un
 * - WEB   : aucun root → on copie l'URL absolue au lieu du chemin local
 */
function isLocalMode() {
    return !!getRoot();
}

/**
 * Action "copier le chemin du fichier".
 * - Mode LOCAL : copie le chemin absolu (C:\...\file.exr) — parfait
 *                pour coller dans Nuke / Maya / Houdini / etc.
 * - Mode WEB   : copie l'URL absolue (https://...exr) — parfait pour
 *                partager le lien.
 */
export async function copyFilePath(relativeUrl) {
    if (isLocalMode()) {
        const abs = toAbsolutePath(relativeUrl);
        if (!abs) return;
        await copyToClipboard(abs, 'Chemin fichier');
    } else {
        // Web mode : pas de chemin local → on copie l'URL absolue
        const absUrl = new URL(relativeUrl, window.location.href).href;
        await copyToClipboard(absUrl, 'URL');
    }
}

/**
 * Action "copier le dossier".
 * - Mode LOCAL : copie le chemin du dossier parent → Win+R pour l'ouvrir
 * - Mode WEB   : copie l'URL du dossier (utile pour partage)
 */
export async function copyFolderPath(relativeUrl) {
    if (isLocalMode()) {
        const abs = toAbsolutePath(relativeUrl);
        if (!abs) return;
        const folder = getFolderOf(abs);
        const ok = await copyToClipboard(folder, 'Dossier');
        if (ok) {
            showToast('→ Win+R puis Ctrl+V pour ouvrir', 'info', 4000);
        }
    } else {
        const fullUrl = new URL(relativeUrl, window.location.href).href;
        const folderUrl = fullUrl.replace(/\/[^\/]+$/, '/');
        await copyToClipboard(folderUrl, 'URL dossier');
    }
}
