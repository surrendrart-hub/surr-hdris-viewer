/**
 * viewer3D.js
 * ------------------------------------------------------------
 * Scène Three.js : sphère matte centrée + OrbitControls.
 * - Matériau non-réfléchissant (MeshBasicMaterial)
 * - Mapping équirectangulaire de la texture HDRI sur la sphère
 * - Background transparent → la couleur du panel CSS apparaît
 * - Anti-coupure : recalcule la distance caméra à chaque resize
 *   pour que la sphère soit toujours entièrement visible
 * ------------------------------------------------------------
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Initialise le viewport 3D dans le conteneur fourni.
 * @param {HTMLElement} container - élément DOM (.viewer-stage)
 * @returns {{
 *   setTexture: (texture: THREE.Texture | null) => void,
 *   resize: () => void,
 *   dispose: () => void
 * }}
 */
export function initViewer3D(container) {

    // --- Vide le placeholder texte s'il existe ---
    container.innerHTML = '';

    // --- Scène ---
    const scene = new THREE.Scene();
    scene.background = null; // Transparent → CSS bg visible derrière

    // --- Caméra ---
    const initialAspect = container.clientWidth / container.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(
        45,             // FOV vertical
        initialAspect,  // aspect
        0.01,           // near
        100             // far
    );
    camera.position.set(0, 0, 3);

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,           // Background transparent
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    // Color space par défaut sRGB output (Three r152+)
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    // --- Sphère ---
    // Rayon 1, 64 segments → suffisamment lisse sans surcharger
    const geometry = new THREE.SphereGeometry(1, 64, 32);

    // MeshBasicMaterial : ignore l'éclairage = aucun reflet parasite.
    // La texture est restituée telle quelle sur la surface.
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.FrontSide
    });

    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // --- OrbitControls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.7;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0, 0);
    // Les limites min/max sont fixées après calcul de la distance optimale
    controls.minDistance = 1.5;
    controls.maxDistance = 20;
    controls.update();

    // --- Anti-coupure : calcule la distance caméra minimale pour que
    //     la sphère unité tienne dans le viewer, peu importe l'aspect.
    function computeFitDistance() {
        const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight || 1;
        const fovV = (camera.fov * Math.PI) / 180; // vertical fov en radians
        const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect); // horizontal fov

        // Distance pour qu'une sphère unité tienne verticalement
        const distV = 1 / Math.sin(fovV / 2);
        // Distance pour qu'elle tienne horizontalement
        const distH = 1 / Math.sin(fovH / 2);

        // On prend le max et on ajoute un padding (1.25) pour respirer
        return Math.max(distV, distH) * 1.25;
    }

    // --- Resize handler ---
    function resize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;

        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        // Re-calcule la distance minimale anti-coupure
        const fitDistance = computeFitDistance();
        controls.minDistance = fitDistance * 0.6; // on autorise un zoom-in
        // Si la caméra est trop proche → on la pousse à la distance de fit
        const camDist = camera.position.length();
        if (camDist < fitDistance * 0.9) {
            camera.position.setLength(fitDistance);
        }
        controls.update();
    }

    // Observer pour les resizes du conteneur (pas seulement window)
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Premier appel après création
    resize();
    // Place initiale de la caméra au fit
    camera.position.setLength(computeFitDistance());
    controls.update();

    // --- Render loop ---
    let animationId = null;
    function tick() {
        controls.update();
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(tick);
    }
    tick();

    // --- API : setTexture ---
    // Reçoit une THREE.Texture déjà décodée et configurée en
    // EquirectangularReflectionMapping (ou similaire) par le caller.
    // S'occupe de DISPOSER l'ancienne texture pour éviter les fuites mémoire
    // sur les fichiers 8K+ EXR / HDR.
    function setTexture(texture) {
        const oldMap = material.map;

        if (texture) {
            // Mapping équirectangulaire pour une sphère :
            // on n'utilise PAS EquirectangularReflectionMapping (qui sert pour
            // les envMap réflectives) — on plaque la texture en UV mapping
            // classique car la SphereGeometry de Three a déjà des UVs équirect.
            texture.mapping = THREE.UVMapping;
            texture.colorSpace = THREE.SRGBColorSpace;

            // Note : on ne force PLUS flipY ici — l'orientation correcte
            // dépend du type de texture (CanvasTexture vs DataTexture).
            // C'est géré dans le loader de chaque format (voir loaders.js
            // et main.js → createPlaceholder).

            texture.needsUpdate = true;
            material.map = texture;
        } else {
            material.map = null;
        }
        material.needsUpdate = true;

        // Libère l'ancienne texture (importante sur 8K HDR / EXR)
        if (oldMap && oldMap !== texture) {
            oldMap.dispose();
        }
    }

    // --- API : dispose (cleanup complet) ---
    function dispose() {
        if (animationId) cancelAnimationFrame(animationId);
        resizeObserver.disconnect();
        controls.dispose();
        geometry.dispose();
        if (material.map) material.map.dispose();
        material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
    }

    return { setTexture, resize, dispose };
}
