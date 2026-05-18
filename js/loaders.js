/**
 * loaders.js
 * ------------------------------------------------------------
 * Multi-loaders pour formats VFX :
 *   - .hdr            → RGBELoader (Three.js)
 *   - .exr            → EXRLoader (Three.js)
 *   - .tif / .tiff    → UTIF (CDN, lazy-load)
 *   - .dpx            → parser custom (10-bit RGB packed)
 *   - .jpg/.jpeg/.png → createImageBitmap natif
 *
 * Chaque sous-loader retourne :
 *   {
 *     texture: THREE.Texture | THREE.DataTexture,   // pour le 3D
 *     source2D: HTMLCanvasElement,                  // pour le 2D (tonemapé)
 *     meta: { width, height, format, bitDepth }
 *   }
 *
 * Memory management : le caller doit s'assurer de disposer / closer
 * la précédente texture / ImageBitmap (le viewer3D s'en occupe).
 * ------------------------------------------------------------
 */

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// ============================================================
// Dispatch principal
// ============================================================

/**
 * Charge un fichier en détectant son format par extension.
 * @param {File} file
 * @param {(p:number)=>void} [onProgress] - callback 0..1
 * @returns {Promise<{texture, source2D, meta}>}
 */
export async function loadFile(file, onProgress = () => {}) {
    const ext = getExtension(file.name);
    onProgress(0.05);

    switch (ext) {
        case 'hdr':
            return loadHDR(file, onProgress);
        case 'exr':
            return loadEXR(file, onProgress);
        case 'tif':
        case 'tiff':
            return loadTIFF(file, onProgress);
        case 'dpx':
            return loadDPX(file, onProgress);
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'webp':
        case 'bmp':
            return loadImage(file, onProgress);
        default:
            throw new Error(`Format non supporté : .${ext}`);
    }
}

function getExtension(name) {
    const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
}

// ============================================================
// .hdr (Radiance RGBE) → RGBELoader
// ============================================================

async function loadHDR(file, onProgress) {
    const buffer = await readAsArrayBuffer(file, onProgress, 0.4);
    onProgress(0.5);

    const loader = new RGBELoader();
    loader.setDataType(THREE.HalfFloatType); // HalfFloat = compromis qualité/mémoire 8K

    const texData = loader.parse(buffer);
    onProgress(0.8);

    const texture = new THREE.DataTexture(
        texData.data,
        texData.width,
        texData.height,
        texData.format,
        texData.type
    );
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    // flipY = false : RGBELoader fournit les data en ordre WebGL Y-up
    // (row 0 = bas de l'image), ce qui s'affiche correctement sur la sphère
    // sans flip GPU. Pour le canvas 2D, on flippe manuellement dans
    // floatTexToCanvas() ci-dessous.
    texture.flipY = false;
    texture.needsUpdate = true;

    // Tonemap → canvas 2D (avec flip vertical interne)
    const source2D = floatTexToCanvas(texData.data, texData.width, texData.height, texData.type);
    onProgress(1.0);

    return {
        texture,
        source2D,
        meta: {
            width: texData.width,
            height: texData.height,
            format: 'HDR (Radiance RGBE)',
            bitDepth: 32
        }
    };
}

// ============================================================
// .exr → EXRLoader
// ============================================================

async function loadEXR(file, onProgress) {
    const buffer = await readAsArrayBuffer(file, onProgress, 0.4);
    onProgress(0.5);

    const loader = new EXRLoader();
    loader.setDataType(THREE.HalfFloatType);

    const texData = loader.parse(buffer);
    onProgress(0.8);

    const texture = new THREE.DataTexture(
        texData.data,
        texData.width,
        texData.height,
        texData.format,
        texData.type
    );
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    // Idem RGBELoader : data en ordre WebGL Y-up
    texture.flipY = false;
    texture.needsUpdate = true;

    const source2D = floatTexToCanvas(texData.data, texData.width, texData.height, texData.type);
    onProgress(1.0);

    return {
        texture,
        source2D,
        meta: {
            width: texData.width,
            height: texData.height,
            format: 'OpenEXR',
            bitDepth: 32
        }
    };
}

// ============================================================
// .tif / .tiff → UTIF (lazy-loaded depuis CDN)
// ============================================================

let _UTIF = null;
async function ensureUTIF() {
    if (_UTIF) return _UTIF;
    if (window.UTIF) { _UTIF = window.UTIF; return _UTIF; }

    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Échec chargement UTIF (CDN)'));
        document.head.appendChild(s);
    });
    _UTIF = window.UTIF;
    if (!_UTIF) throw new Error('UTIF indisponible après chargement CDN');
    return _UTIF;
}

async function loadTIFF(file, onProgress) {
    const UTIF = await ensureUTIF();
    onProgress(0.3);

    const buffer = await readAsArrayBuffer(file, onProgress, 0.6);

    const ifds = UTIF.decode(buffer);
    if (!ifds.length) throw new Error('TIFF invalide : aucune image trouvée');
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]); // Uint8Array RGBA
    const w = ifds[0].width;
    const h = ifds[0].height;
    onProgress(0.85);

    // Canvas 2D
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);

    // Texture 3D : on utilise le même canvas (Three accepte un canvas)
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    onProgress(1.0);
    return {
        texture,
        source2D: canvas,
        meta: { width: w, height: h, format: 'TIFF', bitDepth: 8 }
    };
}

// ============================================================
// .dpx → parser custom (SMPTE 268M, 10-bit RGB packed)
// Le plus courant en VFX/cinéma (scans pellicule, log).
// Note : on supporte le sous-ensemble le plus rencontré.
// ============================================================

async function loadDPX(file, onProgress) {
    const buffer = await readAsArrayBuffer(file, onProgress, 0.4);
    onProgress(0.5);

    const dv = new DataView(buffer);

    // Détection endianness via magic number aux offsets 0..3
    // "SDPX" big-endian (0x53445058) ou "XPDS" little-endian (0x58504453)
    const magicBE = dv.getUint32(0, false);
    const magicLE = dv.getUint32(0, true);
    let littleEndian;
    if (magicBE === 0x53445058) littleEndian = false;
    else if (magicLE === 0x53445058) littleEndian = true;
    else throw new Error('DPX invalide : magic SDPX/XPDS absent');

    // Offset image data : bytes 4..7
    const imageOffset = dv.getUint32(4, littleEndian);

    // Image header — bytes 768..1664 environ
    // Largeur : offset 772, hauteur : offset 776
    const width  = dv.getUint32(772, littleEndian);
    const height = dv.getUint32(776, littleEndian);

    // Image element 0 — offset 780 = nb composants (descriptor à 800)
    // Pour simplifier : descriptor (offset 800) = 50 → RGB
    const descriptor = dv.getUint8(800);
    // Bit depth : offset 803 (uint8)
    const bitDepth = dv.getUint8(803);
    // Packing : offset 804 (uint16) — 1 = type A (10-bit dans 32-bit word, padding LSB)
    const packing = dv.getUint16(804, littleEndian);

    if (descriptor !== 50) {
        throw new Error(`DPX descriptor ${descriptor} non supporté (seul RGB=50 implémenté)`);
    }
    if (bitDepth !== 10) {
        throw new Error(`DPX bit-depth ${bitDepth} non supporté (seul 10-bit implémenté)`);
    }

    onProgress(0.65);

    // Décodage 10-bit RGB packed (méthode A : R 10b | G 10b | B 10b | pad 2b)
    const out = new Uint8ClampedArray(width * height * 4);
    const pixCount = width * height;
    const wordsOffset = imageOffset;

    for (let i = 0; i < pixCount; i++) {
        const word = dv.getUint32(wordsOffset + i * 4, littleEndian);
        // Méthode A : R = bits 22..31, G = bits 12..21, B = bits 2..11
        const r10 = (word >>> 22) & 0x3FF;
        const g10 = (word >>> 12) & 0x3FF;
        const b10 = (word >>>  2) & 0x3FF;
        const o = i * 4;
        out[o    ] = r10 >> 2; // 10→8 bit (shift, on tronque)
        out[o + 1] = g10 >> 2;
        out[o + 2] = b10 >> 2;
        out[o + 3] = 255;
    }
    onProgress(0.9);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(out);
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    onProgress(1.0);
    return {
        texture,
        source2D: canvas,
        meta: { width, height, format: 'DPX (10-bit RGB)', bitDepth: 10 }
    };
}

// ============================================================
// .jpg / .png / .webp / .bmp → createImageBitmap
// ============================================================

async function loadImage(file, onProgress) {
    onProgress(0.2);
    const bitmap = await createImageBitmap(file);
    onProgress(0.7);

    // Canvas 2D : on dessine la bitmap sur un canvas pour avoir une source
    // réutilisable (le bitmap pourrait être close() par le viewer 2D plus tard)
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    const ext = getExtension(file.name).toUpperCase();
    onProgress(1.0);
    return {
        texture,
        source2D: canvas,
        meta: {
            width: canvas.width,
            height: canvas.height,
            format: ext || 'IMG',
            bitDepth: 8
        }
    };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Lit un File en ArrayBuffer avec progression streaming.
 * @param {File} file
 * @param {(p:number)=>void} onProgress
 * @param {number} maxP - fraction maximale rapportée (ex: 0.4 = 40%)
 */
function readAsArrayBuffer(file, onProgress, maxP = 0.5) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
        reader.onprogress = (e) => {
            if (e.lengthComputable) onProgress((e.loaded / e.total) * maxP);
        };
        reader.onload = () => resolve(reader.result);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Tonemap un buffer float (HalfFloat ou Float) RGBA équirectangulaire
 * vers un canvas 8-bit sRGB pour affichage 2D.
 *
 * Tonemap : Reinhard simple (x / (1+x)) + gamma 2.2.
 *
 * IMPORTANT — orientation Y :
 *   RGBELoader / EXRLoader produisent un buffer en convention WebGL
 *   (row 0 = bas de l'image). Pour l'affichage 2D dans un canvas
 *   (où row 0 = haut de l'image), on inverse l'index de ligne
 *   lors de la copie.
 *
 * @param {Uint16Array | Float32Array} data
 * @param {number} w
 * @param {number} h
 * @param {number} type - THREE.HalfFloatType ou THREE.FloatType
 */
function floatTexToCanvas(data, w, h, type) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(w, h);
    const px = out.data;

    // Conversion HalfFloat → Float32 si nécessaire
    const toFloat = (type === THREE.HalfFloatType)
        ? halfFloatToFloat32
        : (x) => x;

    // Flip vertical : on lit la source en ordre WebGL (bottom-up)
    // et on écrit dans le canvas en ordre standard (top-down).
    for (let y = 0; y < h; y++) {
        const srcRow = (h - 1 - y) * w; // ligne source inversée
        const dstRow = y * w;
        for (let x = 0; x < w; x++) {
            const si = (srcRow + x) * 4;
            const di = (dstRow + x) * 4;

            let r = toFloat(data[si    ]);
            let g = toFloat(data[si + 1]);
            let b = toFloat(data[si + 2]);

            // Reinhard tonemap
            r = r / (1 + r);
            g = g / (1 + g);
            b = b / (1 + b);
            // Gamma 2.2 (approche sRGB)
            r = Math.pow(r, 1 / 2.2);
            g = Math.pow(g, 1 / 2.2);
            b = Math.pow(b, 1 / 2.2);

            px[di    ] = Math.min(255, Math.max(0, r * 255 | 0));
            px[di + 1] = Math.min(255, Math.max(0, g * 255 | 0));
            px[di + 2] = Math.min(255, Math.max(0, b * 255 | 0));
            px[di + 3] = 255;
        }
    }

    ctx.putImageData(out, 0, 0);
    return canvas;
}

// Conversion HalfFloat (Uint16 IEEE 754 binary16) → Float32
function halfFloatToFloat32(h) {
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7C00) >> 10;
    const f = h & 0x03FF;

    if (e === 0) {
        return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
    } else if (e === 0x1F) {
        return f ? NaN : ((s ? -1 : 1) * Infinity);
    }
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}
