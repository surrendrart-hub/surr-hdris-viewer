/**
 * main.js
 * ------------------------------------------------------------
 * Bootstrap de l'application HDRIs Viewer.
 * - Initialise viewport 3D, viewer 2D, drag & drop
 * - Branche le pipeline : drop / fichier → loaders → viewers
 * - Charge un placeholder par défaut
 * - Memory management : la précédente texture est disposée
 *   automatiquement par viewer3D.setTexture()
 * ------------------------------------------------------------
 */

import * as THREE from 'three';
import { initViewer3D } from './viewer3D.js';
import { initViewer2D } from './viewer2D.js';
import { loadFile } from './loaders.js';
import { initDragDrop } from './dragdrop.js';
import { initLibrary, refreshAllLibraries } from './library.js';
import { copyFilePath, copyFolderPath, promptRoot, getRoot } from './pathutils.js';
import { showToast } from './toast.js';
import { buildLibrary, hasFSA } from './thumbnails.js';

// --- DOM ---
const stage3D = document.getElementById('viewport-3d-stage');
const stage2D = document.getElementById('viewer-2d-stage');
const fileInfo = document.getElementById('file-info');

// --- Viewers ---
const viewer3D = initViewer3D(stage3D);
const viewer2D = initViewer2D(stage2D);

// --- Source courante du fichier chargé (pour les actions copy/folder) ---
// Initialisée à null pour le placeholder ; mise à jour à chaque load.
let currentSource = null; // { url: string|null, name: string, fromLibrary: boolean }

// --- API : pousse une texture/canvas dans les deux viewers ---
function applyResult({ texture, source2D, meta }, fileName, sourceUrl = null) {
    viewer3D.setTexture(texture);
    viewer2D.setSource(source2D);

    if (fileInfo) {
        const label = fileName
            ? `${fileName}  ·  ${meta.width}×${meta.height}  ·  ${meta.format}  ·  ${meta.bitDepth}-bit`
            : `${meta.width}×${meta.height}  ·  ${meta.format}`;
        fileInfo.textContent = label;
    }

    // Track la source : URL si vient de la library, sinon juste le nom
    currentSource = fileName
        ? { url: sourceUrl, name: fileName, fromLibrary: !!sourceUrl }
        : null;

    // Active/désactive les boutons d'action du header en fonction
    updateHeaderActionsAvailability();
}

// --- Drag & drop + bouton file picker ---
// Quand le fichier vient d'un drag&drop / file picker, on n'a PAS d'URL
// (le navigateur masque le chemin pour des raisons de sécurité).
const dragdrop = initDragDrop({
    async onFileSelected(file, onProgress) {
        const result = await loadFile(file, onProgress);
        applyResult(result, file.name, null); // pas d'URL connue
    }
});

// --- Library latérale (auto-scan ./assets/<cat>/) ---
// Wrapper du handleFile pour conserver l'URL relative quand on charge
// depuis la library (≠ drag&drop). On en a besoin pour les actions
// "copier le chemin" du viewer central.
async function loadFromLibrary(file, relativeUrl) {
    await dragdrop.handleFile(file);
    // À ce stade, applyResult a été appelée mais sans l'URL.
    // On la complète maintenant que le fichier est chargé.
    if (currentSource && currentSource.name === file.name) {
        currentSource.url = relativeUrl;
        currentSource.fromLibrary = true;
        updateHeaderActionsAvailability();
    }
}

const leftPanel  = document.querySelector('.library-panel-left');
const rightPanel = document.querySelector('.library-panel-right');
if (leftPanel) {
    initLibrary(leftPanel, ['skies', 'outdoor'], loadFromLibrary);
}
if (rightPanel) {
    initLibrary(rightPanel, ['indoor', 'studio'], loadFromLibrary);
}

// --- Actions du header (copy path / open folder / settings) ---
setupHeaderActions();

function setupHeaderActions() {
    const headerRight = document.querySelector('.app-header .header-right');
    if (!headerRight) return;

    // SVG icons (inline pour rester cohérent avec les cards library)
    const SVG_COPY = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11 V3 a1 1 0 0 1 1 -1 h8"/></svg>`;
    const SVG_FOLDER = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5 a1 1 0 0 1 1 -1 h3 l1.5 1.5 h5.5 a1 1 0 0 1 1 1 v6 a1 1 0 0 1 -1 1 h-10 a1 1 0 0 1 -1 -1 z"/></svg>`;
    const SVG_GEAR = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 2 V3 M8 13 V14 M2 8 H3 M13 8 H14 M3.8 3.8 L4.5 4.5 M11.5 11.5 L12.2 12.2 M3.8 12.2 L4.5 11.5 M11.5 4.5 L12.2 3.8"/></svg>`;

    // Bouton "Copy file path"
    const btnPath = document.createElement('button');
    btnPath.id = 'header-btn-copy-path';
    btnPath.className = 'header-action-btn';
    btnPath.type = 'button';
    btnPath.title = 'Copier le chemin du fichier courant';
    btnPath.innerHTML = SVG_COPY;
    btnPath.addEventListener('click', () => {
        if (!currentSource?.url) {
            showToast(
                currentSource
                    ? "Fichier chargé via drag&drop : chemin source inconnu"
                    : 'Aucun fichier chargé',
                'error'
            );
            return;
        }
        copyFilePath(currentSource.url);
    });

    // Bouton "Copy folder path"
    const btnFolder = document.createElement('button');
    btnFolder.id = 'header-btn-copy-folder';
    btnFolder.className = 'header-action-btn';
    btnFolder.type = 'button';
    btnFolder.title = 'Copier le chemin du dossier parent (Win+R pour ouvrir)';
    btnFolder.innerHTML = SVG_FOLDER;
    btnFolder.addEventListener('click', () => {
        if (!currentSource?.url) {
            showToast(
                currentSource
                    ? "Fichier chargé via drag&drop : dossier source inconnu"
                    : 'Aucun fichier chargé',
                'error'
            );
            return;
        }
        copyFolderPath(currentSource.url);
    });

    // Bouton "Build library" — JS-side thumbnails + manifest.json
    // Remplace make-previews.bat (et ImageMagick) pour la communauté.
    const SVG_BUILD = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4 h12 M2 8 h8 M2 12 h12"/><circle cx="13" cy="8" r="2"/></svg>`;
    const btnBuild = document.createElement('button');
    btnBuild.id = 'header-btn-build';
    btnBuild.className = 'header-action-btn';
    btnBuild.type = 'button';
    btnBuild.title = "Générer les thumbnails (et manifest.json) pour la library — remplace make-previews.bat";
    btnBuild.innerHTML = SVG_BUILD;
    btnBuild.addEventListener('click', async () => {
        if (!hasFSA()) {
            showToast(
                "Ce navigateur ne supporte pas File System Access — utilise Chrome/Edge/Opera",
                'error', 5000
            );
            return;
        }
        showToast('Sélectionne le dossier assets/ (ou une catégorie)', 'info', 3500);
        try {
            const result = await buildLibrary((p) => {
                // Progress affiché dans file-info pendant le build
                if (fileInfo && p.phase === 'thumbs') {
                    fileInfo.textContent = `Build : ${p.name}  (${p.done + 1}/${p.total})`;
                }
            });
            if (!result) return; // annulé

            showToast(
                `Build terminé : ${result.generated} thumbs générés · ${result.skipped} skip · ${result.failed} échecs · ${result.categories} catégories`,
                'success',
                5000
            );
            await refreshAllLibraries();
        } catch (err) {
            console.error(err);
            showToast(`Erreur build : ${err.message || err}`, 'error', 5000);
        }
    });

    // Bouton "Settings" (configurer le project root)
    const btnSettings = document.createElement('button');
    btnSettings.id = 'header-btn-settings';
    btnSettings.className = 'header-action-btn';
    btnSettings.type = 'button';
    btnSettings.title = 'Configurer le chemin absolu du projet (pour copier les chemins)';
    btnSettings.innerHTML = SVG_GEAR;
    btnSettings.addEventListener('click', () => {
        promptRoot();
    });

    // Insertion : avant le file-info (qui est déjà dans header-right)
    headerRight.insertBefore(btnPath, fileInfo);
    headerRight.insertBefore(btnFolder, fileInfo);
    headerRight.insertBefore(btnBuild, fileInfo);
    headerRight.insertBefore(btnSettings, fileInfo);
}

function updateHeaderActionsAvailability() {
    const btnPath = document.getElementById('header-btn-copy-path');
    const btnFolder = document.getElementById('header-btn-copy-folder');
    if (!btnPath || !btnFolder) return;

    const hasUrl = !!currentSource?.url;
    btnPath.classList.toggle('disabled', !hasUrl);
    btnFolder.classList.toggle('disabled', !hasUrl);
}

// --- Placeholder par défaut (texture procédurale équirectangulaire) ---
applyResult(createPlaceholder(), null);

// Dev: API console
window.__hdriViewer = { viewer3D, viewer2D, loadFile, applyResult };

/* ============================================================
   Génère le placeholder équirectangulaire procédural.
   ============================================================ */
function createPlaceholder() {
    const W = 2048;
    const H = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');

    // Gradient horizontal
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0.00, '#1a1a2a');
    grad.addColorStop(0.20, '#ff1ca8');
    grad.addColorStop(0.40, '#2a9bff');
    grad.addColorStop(0.55, '#33cc77');
    grad.addColorStop(0.75, '#f5c14a');
    grad.addColorStop(1.00, '#1a1a2a');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Vignettage pôles
    const vGrad = g.createLinearGradient(0, 0, 0, H);
    vGrad.addColorStop(0.00, 'rgba(0,0,0,0.55)');
    vGrad.addColorStop(0.50, 'rgba(0,0,0,0.00)');
    vGrad.addColorStop(1.00, 'rgba(0,0,0,0.55)');
    g.fillStyle = vGrad;
    g.fillRect(0, 0, W, H);

    // Grille
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1.5;
    for (let i = 0; i <= 12; i++) {
        const x = (i / 12) * W;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }
    for (let j = 0; j <= 6; j++) {
        const y = (j / 6) * H;
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }

    // Méridien + équateur en rose
    g.strokeStyle = '#ff1ca8';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W / 2, 0); g.lineTo(W / 2, H);
    g.moveTo(0, H / 2); g.lineTo(W, H / 2);
    g.stroke();

    // Texte
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 100px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SUR · HDRIs VIEWER', W / 2, H / 2 - 60);
    g.font = '46px -apple-system, "Segoe UI", sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText('DEFAULT PLACEHOLDER (equirectangular 2:1)', W / 2, H / 2 + 20);
    g.font = '32px monospace';
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillText('Glissez votre HDRI / EXR / TIFF / DPX / JPG / PNG', W / 2, H / 2 + 80);

    // Construction de la texture Three.js (CanvasTexture)
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    return {
        texture,
        source2D: canvas,
        meta: { width: W, height: H, format: 'Placeholder (procedural)', bitDepth: 8 }
    };
}
