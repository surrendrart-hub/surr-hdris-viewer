@echo off
REM ============================================================
REM  force-push.bat
REM  Ecrase le contenu du remote GitHub avec ton repo local.
REM
REM  A utiliser UNIQUEMENT quand :
REM    - Tu as cree le repo sur GitHub avec un README/LICENSE
REM      auto-generes
REM    - Tu veux que ton local ecrase ces fichiers placeholder
REM    - GitHub Desktop te dit "Newer commits on remote"
REM
REM  NE PAS UTILISER si le remote contient du vrai contenu que
REM  tu veux preserver !
REM ============================================================

setlocal
cd /d "%~dp0"

echo.
echo  ============================================================
echo   FORCE PUSH  /  remplace remote par local
echo  ============================================================
echo   Repo : https://github.com/surrendrart-hub/surr-hdris-viewer
echo   Dossier local : %CD%
echo.
echo   Cette operation va ECRASER le contenu actuel du remote.
echo   Tout ce qui est en ligne et qui n'est pas en local sera
echo   perdu (typiquement : README auto-genere par GitHub).
echo.

set /p "CONFIRM=Continuer ? Tape 'oui' pour confirmer : "
if /I not "%CONFIRM%"=="oui" (
    echo.
    echo  Annule.
    pause
    exit /b 0
)
echo.

REM Verifie qu'on est bien dans un repo Git
if not exist ".git" (
    echo  [ERREUR] Pas de repo Git ici. Lance d'abord git-push.bat
    pause
    exit /b 1
)

REM Verifie qu'origin est configure
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    echo  Le remote 'origin' n'est pas configure. Je le configure...
    git remote add origin https://github.com/surrendrart-hub/surr-hdris-viewer.git
)

echo  Remote actuel :
git remote -v
echo.

echo  Push force en cours...
echo  Si Git demande des credentials, c'est ton compte GitHub :
echo    - Username : ton login GitHub
echo    - Password : un Personal Access Token
echo      (genere sur https://github.com/settings/tokens)
echo  Mais si GitHub Desktop a deja cache tes creds, ca passera
echo  sans rien demander.
echo.

git push -u origin main --force
if errorlevel 1 (
    echo.
    echo  [ECHEC] Le push force a echoue.
    echo.
    echo  Verifications :
    echo    1. Tu es connecte au bon compte GitHub Desktop ?
    echo       (Menu File -^> Options -^> Accounts)
    echo    2. Tu as les droits write sur ce repo ?
    echo    3. Le repo distant existe bien ?
    echo       https://github.com/surrendrart-hub/surr-hdris-viewer
    echo.
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   FORCE PUSH REUSSI !
echo  ============================================================
echo   Ton code est en ligne :
echo     https://github.com/surrendrart-hub/surr-hdris-viewer
echo.
echo   Dans GitHub Desktop :
echo     - Ferme la popup "Newer commits on remote" (Cancel)
echo     - Repository menu -^> Pull  (pour resync l'etat)
echo     - Tout est maintenant aligne
echo.
echo   Pour activer GitHub Pages :
echo     https://github.com/surrendrart-hub/surr-hdris-viewer/settings/pages
echo     Source = "Deploy from a branch"  /  Branch = main / (root)
echo     -^>  https://surrendrart-hub.github.io/surr-hdris-viewer/
echo  ============================================================
echo.
pause
