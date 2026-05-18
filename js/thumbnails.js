/**
 * thumbnails.js
 * ------------------------------------------------------------
 * Génération de thumbnails JPEG + manifest.json côté navigateur
 * via la File System Access API (FSA).
 *
 * Remplace entièrement ImageMagick :
 *   - Décode les HDR/EXR/TIFF/DPX avec les mêmes loaders que le
 *     viewer (cohérence visuelle garantie)
 *   - Réutilise le tonemap Reinhard + gamma 2.2 déjà implémenté
 *   - Resize en 512x256 via canvas
 *   - Écrit le résultat .jpg directement dans le dossier de
 *     l'utilisateur (FSA API)
 *
 * Génère aussi un manifest.json par catégorie, indispensable pour
 * le déploiement web (GitHub Pages ne fournit pas de directory
 * listing → on doit lister explicitement les fichiers).
 *
 * Browsers : Chrome/Edge/Opera supportent FSA. Firefox/Safari
 * non (à date 2025-05) — on fallback sur un download d'un ZIP
 * de tous les thumbnails + le manifest, l'utilisateur les place
 * manuellement.
 * ------------------------------------------------------------
 */

import { loadFile } from './loaders.js';
import { showToast } from './toast.js';

const THUMB_W = 512;
const THUMB_H = 256;
const QUALITY = 0.82;

const PRIMARY_EXT_RE = /\.(hdr|exr|tif|tiff|dpx|jpg|jpeg|png|webp|bmp)$/i;
const HEAVY_EXT_RE   = /\.(hdr|exr|tif|tiff|dpx)$/i;
const THUMB_RE       = /_thumb\.(jpg|jpeg|png)$/i;

/**
 * Détecte si la File System Access API est dispo (Chrome/Edge/Opera).
 */
export function hasFSA() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Génère un thumbnail Blob JPEG à partir d'un File.
 * Réutilise loadFile() : on profite du tonemap Reinhard déjà fait.
 *
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function generateThumbnailBlob(file) {
    const result = await loadFile(file, () => {});
    // result.source2D est un canvas tonemap à la résolution d'origine

    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fond noir au cas où l'image n'est pas un parfait 2:1
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    ctx.drawImage(result.source2D, 0, 0, THUMB_W, THUMB_H);

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob a échoué'))),
            'image/jpeg',
            QUALITY
        );
    });
}

/**
 * Pipeline complet :
 *   1) Demande à l'utilisateur de picker un dossier (FSA)
 *   2) Itère récursivement skies/outdoor/indoor/studio (ou tout
 *      sous-dossier trouvé si on a picker assets/)
 *   3) Pour chaque HDR/EXR/TIFF/DPX/JPG/PNG sans `*_thumb.jpg`,
 *      génère et écrit le thumbnail
 *   4) Écrit aussi `manifest.json` par catégorie (pour le mode web)
 *
 * @param {(p: {phase, name, done, total}) => void} onProgress
 * @returns {Promise<{categories: number, generated: number, skipped: number, failed: number}>}
 */
export async function buildLibrary(onProgress = () => {}) {
    if (!hasFSA()) {
        showToast(
            "Navigateur sans File System Access API (utilise Chrome/Edge/Opera) — fallback ZIP non implémenté",
            'error',
            5000
        );
        return null;
    }

    let rootHandle;
    try {
        // Le user doit picker le dossier `assets/` du projet
        rootHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents'
        });
    } catch (e) {
        if (e.name === 'AbortError') return null;
        throw e;
    }

    onProgress({ phase: 'scan', name: rootHandle.name, done: 0, total: 0 });

    // Détecte les sous-dossiers (categories) ; si on a picker une catégorie
    // directement, on l'utilise comme seule entrée.
    const subdirs = [];
    for await (const [name, handle] of rootHandle.entries()) {
        if (handle.kind === 'directory') subdirs.push({ name, handle });
    }

    // Si pas de sous-dossiers → l'utilisateur a picker une catégorie
    const categories = subdirs.length > 0
        ? subdirs
        : [{ name: rootHandle.name, handle: rootHandle }];

    let totalGenerated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const cat of categories) {
        const res = await processCategory(cat.handle, cat.name, onProgress);
        totalGenerated += res.generated;
        totalSkipped += res.skipped;
        totalFailed += res.failed;
    }

    return {
        categories: categories.length,
        generated: totalGenerated,
        skipped: totalSkipped,
        failed: totalFailed
    };
}

async function processCategory(dirHandle, catName, onProgress) {
    // Lister tous les fichiers
    const files = [];
    for await (const [name, h] of dirHandle.entries()) {
        if (h.kind === 'file') files.push({ name, handle: h });
    }

    // Séparer primaires / thumbnails existants
    const existingThumbs = new Set();
    const primaries = [];
    for (const f of files) {
        if (THUMB_RE.test(f.name)) {
            existingThumbs.add(f.name.replace(THUMB_RE, ''));
        } else if (PRIMARY_EXT_RE.test(f.name)) {
            primaries.push(f);
        }
    }

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < primaries.length; i++) {
        const p = primaries[i];
        const base = p.name.replace(/\.[^.]+$/, '');
        const thumbName = `${base}_thumb.jpg`;

        onProgress({
            phase: 'thumbs',
            name: `${catName}/${p.name}`,
            done: i,
            total: primaries.length
        });

        if (existingThumbs.has(base)) {
            skipped++;
            continue;
        }

        try {
            const file = await p.handle.getFile();
            const blob = await generateThumbnailBlob(file);
            await writeFile(dirHandle, thumbName, blob);
            generated++;
            existingThumbs.add(base); // pour qu'il apparaisse dans le manifest
        } catch (e) {
            console.error('[thumbnails]', p.name, e);
            failed++;
        }
    }

    // Écriture du manifest.json pour le mode web
    onProgress({ phase: 'manifest', name: `${catName}/manifest.json`, done: 0, total: 1 });
    try {
        // Re-scan after write to include newly created thumbs
        const allNames = [];
        for await (const [name, h] of dirHandle.entries()) {
            if (h.kind === 'file' && PRIMARY_EXT_RE.test(name)) {
                allNames.push(name);
            }
        }
        allNames.sort();
        const manifest = {
            category: catName,
            generated: new Date().toISOString(),
            files: allNames
        };
        const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
        await writeFile(dirHandle, 'manifest.json', blob);
    } catch (e) {
        console.error('[manifest]', catName, e);
    }

    return { generated, skipped, failed };
}

async function writeFile(dirHandle, name, blob) {
    const handle = await dirHandle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
}
