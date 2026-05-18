/**
 * dragdrop.js
 * ------------------------------------------------------------
 * Gère :
 *   - Drag & drop sur toute la fenêtre
 *   - Overlay visuel "Glissez votre HDRI/Image ici"
 *   - Bouton de fallback "Open file…" déclenchant <input type="file">
 *   - Affichage du loader overlay + progress bar pendant le décodage
 *   - Affichage des erreurs (toast minimal)
 *
 * Callback unique fourni : onFileSelected(file)
 * ------------------------------------------------------------
 */

import { showToast } from './toast.js';

export function initDragDrop({ onFileSelected }) {

    // --- Récupération des éléments UI ---
    const overlay         = document.getElementById('dragdrop-overlay');
    const loaderOverlay   = document.getElementById('loader-overlay');
    const loaderText      = document.getElementById('loader-text');
    const loaderProgress  = document.getElementById('loader-progress-bar');

    // --- États du compteur dragenter/dragleave (évite le flicker) ---
    let dragCounter = 0;

    // Prevent default browser behavior pour permettre le drop
    function preventAll(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // --- Drag enter / leave : compteur pour gérer les enfants ---
    window.addEventListener('dragenter', (e) => {
        preventAll(e);
        if (!hasFiles(e.dataTransfer)) return;
        dragCounter++;
        overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
        preventAll(e);
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.classList.remove('active');
        }
    });

    window.addEventListener('dragover', preventAll);

    // --- Drop ---
    window.addEventListener('drop', async (e) => {
        preventAll(e);
        dragCounter = 0;
        overlay.classList.remove('active');

        const files = [...(e.dataTransfer?.files || [])];
        if (!files.length) return;
        // On ne traite que le premier fichier (single-file viewer)
        await handleFile(files[0]);
    });

    // --- File picker fallback ---
    // Crée un <input type="file"> caché qu'on déclenche au clic sur
    // un bouton "Open file" (ajouté au header)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.hdr,.exr,.tif,.tiff,.dpx,.jpg,.jpeg,.png,.webp,.bmp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (file) await handleFile(file);
        fileInput.value = ''; // Reset pour permettre le re-pick du même fichier
    });

    // --- Bouton "Open file…" injecté dans le header ---
    const headerRight = document.querySelector('.app-header .header-right');
    if (headerRight) {
        const btn = document.createElement('button');
        btn.className = 'open-file-btn';
        btn.type = 'button';
        btn.textContent = 'Open file…';
        btn.addEventListener('click', () => fileInput.click());
        headerRight.insertBefore(btn, headerRight.firstChild);
    }

    // --- Pipeline principal ---
    async function handleFile(file) {
        showLoader(`Décodage : ${file.name}`);
        try {
            await onFileSelected(file, (p) => {
                setProgress(p);
            });
        } catch (err) {
            console.error('[dragdrop] load error', err);
            showToast(`Erreur : ${err.message || err}`, 'error');
        } finally {
            hideLoader();
        }
    }

    // --- Loader UI helpers ---
    function showLoader(text) {
        loaderText.textContent = text || 'Décodage…';
        setProgress(0);
        loaderOverlay.hidden = false;
    }
    function hideLoader() {
        loaderOverlay.hidden = true;
    }
    function setProgress(p) {
        const pct = Math.max(0, Math.min(100, p * 100));
        loaderProgress.style.width = pct + '%';
    }

    function hasFiles(dt) {
        if (!dt) return false;
        if (dt.types && dt.types.indexOf) {
            return dt.types.indexOf('Files') !== -1;
        }
        // Edge fallback
        return Array.from(dt.types || []).includes('Files');
    }

    // Expose handleFile() pour que d'autres modules (library.js)
    // puissent réutiliser le même pipeline loader UI + onFileSelected.
    return { handleFile };
}
