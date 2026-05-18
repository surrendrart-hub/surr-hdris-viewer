/**
 * viewer2D.js
 * ------------------------------------------------------------
 * Affichage "à plat" (projection équirectangulaire 2:1) de
 * l'image HDRI dans un canvas. S'adapte au conteneur en
 * préservant le ratio 2:1.
 *
 * Pour les fichiers HDR/EXR (float), la texture aura déjà été
 * tonemapée en RGBA8 par le loader avant d'être envoyée ici
 * (à l'Étape 3). Pour l'instant on accepte n'importe quel
 * <canvas>, <img>, ou ImageBitmap.
 * ------------------------------------------------------------
 */

/**
 * Initialise le viewer 2D dans le conteneur.
 * @param {HTMLElement} container - élément DOM (.viewer-stage)
 */
export function initViewer2D(container) {

    container.innerHTML = '';

    // Wrapper qui maintient le ratio 2:1 centré dans le stage
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.maxWidth = '100%';
    wrapper.style.maxHeight = '100%';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    container.appendChild(wrapper);

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    canvas.style.objectFit = 'contain';
    canvas.style.border = '1px solid var(--border, #3a3a3a)';
    canvas.style.borderRadius = '2px';
    wrapper.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    let currentSource = null; // image|canvas|bitmap décodé

    // --- Resize : on calcule le rectangle 2:1 max qui rentre ---
    function resize() {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw === 0 || ch === 0) return;

        // Ratio cible 2:1
        const targetRatio = 2 / 1;
        const containerRatio = cw / ch;

        let dispW, dispH;
        if (containerRatio > targetRatio) {
            // Le conteneur est trop large → on contraint par la hauteur
            dispH = ch;
            dispW = ch * targetRatio;
        } else {
            // Trop haut → on contraint par la largeur
            dispW = cw;
            dispH = cw / targetRatio;
        }

        // Buffer canvas en haute résolution (pixel ratio)
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(dispW * dpr);
        canvas.height = Math.round(dispH * dpr);
        canvas.style.width = dispW + 'px';
        canvas.style.height = dispH + 'px';

        redraw();
    }

    // --- Redraw : redessine la source courante (si présente) ---
    function redraw() {
        // Fond neutre sombre pour les images plus petites
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!currentSource) return;

        // drawImage gère <img>, <canvas>, ImageBitmap, VideoFrame…
        // L'image est strechée pour remplir le canvas (déjà au ratio 2:1).
        try {
            ctx.drawImage(currentSource, 0, 0, canvas.width, canvas.height);
        } catch (err) {
            console.error('[viewer2D] drawImage failed', err);
        }
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    // --- API : setSource ---
    // Accepte un HTMLImageElement, HTMLCanvasElement ou ImageBitmap.
    function setSource(source) {
        // Libère l'ancienne ImageBitmap si applicable
        if (currentSource && currentSource !== source && typeof currentSource.close === 'function') {
            try { currentSource.close(); } catch (_) { /* noop */ }
        }
        currentSource = source;
        redraw();
    }

    // --- API : dispose ---
    function dispose() {
        resizeObserver.disconnect();
        if (currentSource && typeof currentSource.close === 'function') {
            try { currentSource.close(); } catch (_) { /* noop */ }
        }
        currentSource = null;
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }

    return { setSource, resize, dispose };
}
