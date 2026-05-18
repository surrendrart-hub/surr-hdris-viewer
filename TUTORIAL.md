# Tutoriel SURR HDRIs Viewer

Guide pas à pas pour utiliser le viewer en mode **web** (instantané, online)
et en mode **local** (avec ta library persistante).

---

## 🌐 Partie 1 — Mode WEB (zéro install)

### 1.1 Utiliser le viewer déployé

1. Ouvre le lien du viewer (par exemple `https://<user>.github.io/surr-hdris-viewer/`)
2. Tu vois le placeholder coloré dans la sphère 3D + sa projection 2D en bas
3. **Glisse-dépose** un fichier `.hdr` / `.exr` / `.tif` / `.dpx` / `.jpg` /
   `.png` depuis ton explorateur sur la page
4. La sphère 3D et le viewer 2D se mettent à jour instantanément
5. **OrbitControls** :
   - Clic gauche + drag → rotation autour de la sphère
   - Molette → zoom avant/arrière
   - Clic droit + drag → pan
6. Pour copier l'URL d'une image de la library : clique 📋 sur sa card

### 1.2 Limitations du mode web

- ❌ Pas de chemin absolu local (le navigateur ne peut pas connaître où sont
  tes fichiers sur ton disque)
- ❌ Pas d'écriture sur ton disque depuis la page web déployée (sauf via
  drag & drop volontaire)
- ✅ Library latérale : visible **si** le repo contient des HDRIs + leurs
  `manifest.json` (générés en local avant le push)

---

## 💻 Partie 2 — Mode LOCAL (workflow VFX)

C'est le mode recommandé pour le boulot quotidien : ta library persiste,
tu copies les chemins absolus directement dans Nuke / Maya / Houdini.

### 2.1 Installation

#### Prérequis : un moteur de serveur HTTP local

Tu as plusieurs options, ordre de simplicité :

**Option A — Python (recommandée)**
- Télécharge depuis https://www.python.org/downloads/
- Pendant l'install : **coche** "Add python.exe to PATH"
- Vérification dans une nouvelle PowerShell : `python --version`

**Option B — Node.js**
- Télécharge depuis https://nodejs.org/
- Le `start-server.bat` détecte Node et utilise `npx serve` automatiquement

**Option C — Aucun install**
- Télécharge `miniserve.exe` depuis https://github.com/svenstaro/miniserve/releases
- Place-le à côté de `start-server.bat` et adapte la première ligne du `.bat`
  pour l'appeler

#### Cloner le projet

```bash
git clone https://github.com/<ton-user>/surr-hdris-viewer.git
cd "surr-hdris-viewer"
```

### 2.2 Premier lancement

1. **Double-clic** sur `start-server.bat` (Windows)
   ou exécute `./start-server.sh` (macOS/Linux après `chmod +x`)
2. La fenêtre de commande affiche :
   ```
   Generation de config.js avec le chemin du projet :
     C:\Users\toi\Desktop\surr-hdris-viewer
   [OK] Python detecte. Demarrage sur http://localhost:8000
   ```
3. Ton navigateur s'ouvre automatiquement sur `http://localhost:8000`
4. Le placeholder coloré apparaît dans le viewport 3D ✅

### 2.3 Ajouter des HDRIs à ta library

1. Récupère quelques fichiers HDR/EXR (par exemple sur
   [Poly Haven](https://polyhaven.com/hdris))
2. Place-les dans les dossiers selon leur catégorie :
   ```
   assets/
   ├── skies/      ← skies HDRIs
   ├── outdoor/    ← extérieurs (forêts, rues, etc.)
   ├── indoor/     ← intérieurs (salons, bureaux, etc.)
   └── studio/     ← studios photo, light setups
   ```
3. Clique le bouton **↻** au-dessus de chaque panneau pour rescanner
4. Les fichiers apparaissent en cards avec un motif hachuré "no preview"

### 2.4 Générer les thumbnails (sans ImageMagick !)

Le motif hachuré est moche → on génère de vrais thumbnails JPEG.

**Méthode native (recommandée) :**

1. Clique sur le bouton **🛠** dans le header (4ème icône à droite, à
   côté de ⚙)
2. Un toast indique : "Sélectionne le dossier assets/ (ou une catégorie)"
3. Le picker de dossier s'ouvre → navigue vers `assets/` du projet et
   sélectionne-le
4. Autorise le site à écrire dans ce dossier (popup du navigateur)
5. Le bouton 🛠 et la barre `file-info` affichent la progression :
   `Build : skies/hdri_01.hdr  (3/12)`
6. À la fin, un toast confirme :
   ```
   Build terminé : 12 thumbs générés · 0 skip · 0 échecs · 4 catégories
   ```
7. La library se rafraîchit automatiquement → tu vois maintenant les
   thumbnails à la place du motif hachuré 🎉

> 📌 **Browsers supportés** : Chrome, Edge, Opera (la **File System Access
> API** n'est pas dispo sur Firefox ni Safari à ce jour). Si tu utilises
> un browser non supporté, tu peux toujours utiliser `make-previews.bat`
> (avec ImageMagick) comme dans la version originale.

### 2.5 Copier les chemins (workflow DCC)

#### Sur une card library
- Survole une card → 2 boutons apparaissent en haut à droite
- 📋 → copie le **chemin absolu du fichier** : `C:\...\assets\skies\sky01.exr`
- 📂 → copie le **chemin du dossier parent**

#### Sur le viewer central
- Le file actuellement chargé est tracké
- Boutons 📋 et 📂 dans le header agissent dessus

#### Coller dans Nuke (exemple)
```nuke
1. Ctrl+N → ajouter un Read node
2. Click sur le bouton "file" du Read
3. Ctrl+V → le chemin C:\…\sky01.exr est collé
4. Apply → le fichier est chargé
```

#### Ouvrir le dossier dans Explorer
1. Clique 📂 (le chemin est dans le presse-papier)
2. **Win+R** (ouvre Exécuter)
3. **Ctrl+V** puis **Entrée** → l'Explorateur s'ouvre sur le dossier

### 2.6 Si tu déplaces le projet

Aucun problème — tout est en chemins relatifs.

1. Coupe-colle le dossier `surr-hdris-viewer` où tu veux (`D:\`, `Z:\`,
   `~/Documents/`, etc.)
2. Relance `start-server.bat` depuis le nouvel emplacement
3. Le `.bat` régénère `config.js` avec le nouveau chemin absolu
4. **Important** : `Ctrl+F5` dans le navigateur pour bypasser le cache
5. Si tu avais un override manuel dans Settings (⚙), reset-le ou mets-le à jour

---

## 🚀 Partie 3 — Publier ton viewer sur GitHub Pages

Idéal pour partager avec ton équipe : un lien web, zéro install.

### 3.1 Préparer le projet

1. **Connecte-toi à GitHub** et crée un nouveau repo nommé exactement
   `surr-hdris-viewer` (ou ce que tu veux)
2. En local :
   ```bash
   cd "surr-hdris-viewer"
   git init
   git add .
   git commit -m "Initial commit: HDRI Viewer"
   git branch -M main
   git remote add origin https://github.com/<ton-user>/surr-hdris-viewer.git
   git push -u origin main
   ```

> Note : `config.js` est dans `.gitignore` (il contient un chemin local
> spécifique à ta machine — il ne doit pas être commit). Le viewer
> tournera en mode "web" sur GitHub Pages.

### 3.2 Activer GitHub Pages

1. Sur GitHub, va dans **Settings** du repo → **Pages**
2. **Source** : `Deploy from a branch`
3. **Branch** : `main` · **Folder** : `/ (root)` → Save
4. Au bout d'environ 1 minute, GitHub Pages te donne ton URL :
   `https://<ton-user>.github.io/surr-hdris-viewer/`

### 3.3 Ajouter des HDRIs à la library web

**Pour que la library latérale fonctionne en ligne**, GitHub Pages ne
fournit pas de directory listing → on doit lister explicitement les
fichiers avec un `manifest.json`.

Le bouton 🛠 fait exactement ça :

1. En local, lance le viewer (`start-server.bat`)
2. Place tes HDRIs dans `assets/skies/`, etc.
3. Clique 🛠 → sélectionne `assets/` → autorise le write
4. Les `*_thumb.jpg` **et** les `manifest.json` sont créés
5. Commit + push :
   ```bash
   git add assets/
   git commit -m "Add library HDRIs + thumbnails + manifest"
   git push
   ```
6. Sur la version GitHub Pages, recharge la page : la library affiche
   maintenant tes HDRIs ✨

> 💡 **Astuce taille** : si tu ne veux pas push des HDRIs de plusieurs
> Go sur GitHub (qui limite à 100 Mo par fichier), décommente les
> lignes correspondantes dans `.gitignore`. Seuls les thumbnails (~30 Ko)
> et `manifest.json` seront versionnés → la library affiche les cards
> mais le click pour charger essaiera de fetch un fichier inexistant.
> *(Alternative : héberger les sources sur un CDN et adapter les URLs
> dans `manifest.json`.)*

---

## 🔧 Troubleshooting

### "Three.js failed to load" / "import maps not supported"
- Tu lances `index.html` directement en double-clic (file://) — ça ne
  marche pas avec les ES modules.
- **Fix** : utilise `start-server.bat` (mode local) ou la version web
  déployée.

### Sphère 3D noire / pas de viewer
- Ouvre la console (F12) → onglet Console
- Cherche les erreurs en rouge. Si "WebGL context lost" → ton GPU est
  surchargé, recharge la page.

### Thumbnails noirs après build
- Vérifie dans la console qu'il n'y a pas d'erreur "toBlob"
- Si tu as utilisé `make-previews.bat` (ImageMagick) avant : supprime
  les `*_thumb.jpg` existants et relance le build via 🛠 (le pipeline JS
  fait un tonemap propre, contrairement à `-auto-level` d'IM qui pète
  les hautes lumières)

### Bouton 🛠 inactif / "FSA non supportée"
- File System Access API ≠ Firefox / Safari (à mai 2025)
- Utilise Chrome / Edge / Opera, OU utilise `make-previews.bat` comme
  fallback (nécessite ImageMagick installé)

### Library vide en ligne (GitHub Pages)
- Tu n'as pas généré les `manifest.json` → fais-le en local avec 🛠 puis
  re-push

### Les chemins copiés sont des URLs au lieu de C:\...
- Le viewer pense être en mode web (pas de `config.js`)
- Vérifie que tu lances bien via `start-server.bat` (qui écrit
  `config.js`) et pas via `python -m http.server` direct
- OU configure manuellement via ⚙ Settings

---

## 📚 Pour aller plus loin

- **Code source** : tout est en JS modules natifs, chaque module a une
  responsabilité claire (cf. `README.md` § Structure)
- **Ajouter un nouveau format** : édite `js/loaders.js`, ajoute un case
  dans le switch + une fonction de décodage
- **Personnaliser le thème** : édite les variables CSS au début de
  `css/style.css` (couleurs, espacements)

Bon viewing 🎬
