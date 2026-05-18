@echo off
REM ============================================================
REM  git-push.bat
REM  Initialise le repo Git local et push vers GitHub.
REM
REM  Repo cible : https://github.com/surrendrart-hub/surr-hdris-viewer
REM
REM  Prerequis : avoir Git for Windows installe + ton auth GitHub
REM  configuree (HTTPS token OU SSH key).
REM    - Git for Windows : https://git-scm.com/download/win
REM    - Configurer auth : https://docs.github.com/en/get-started/getting-started-with-git/caching-your-github-credentials-in-git
REM
REM  USAGE : double-clic sur ce fichier.
REM  Au premier lancement, Git va peut-etre te demander tes
REM  identifiants GitHub (un token, pas ton mot de passe).
REM ============================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

set REMOTE_URL=https://github.com/surrendrart-hub/surr-hdris-viewer.git
set BRANCH=main
set COMMIT_MSG=Initial commit: SURR HDRIs Viewer (web + local packs)

echo.
echo  ============================================================
echo   SURR HDRIs Viewer  /  Push initial vers GitHub
echo  ============================================================
echo   Repo : %REMOTE_URL%
echo   Branche : %BRANCH%
echo.

REM --- Verification Git ---
where git >nul 2>nul
if errorlevel 1 (
    echo  [ERREUR] Git n'est pas installe ou pas dans le PATH.
    echo  Telecharge-le depuis : https://git-scm.com/download/win
    echo  Pendant l'install, garde l'option "Add to PATH" cochee.
    pause
    exit /b 1
)
git --version
echo.

REM --- Configuration Git si necessaire (commit author) ---
git config user.name >nul 2>nul
if errorlevel 1 (
    echo  Premier usage de Git sur cette machine.
    set /p "GIT_NAME=Ton nom (apparaitra dans les commits) : "
    set /p "GIT_EMAIL=Ton email GitHub : "
    git config --global user.name "!GIT_NAME!"
    git config --global user.email "!GIT_EMAIL!"
)

REM --- Initialisation du repo si pas encore fait ---
if not exist ".git" (
    echo  Initialisation du depot Git local...
    git init -b %BRANCH%
    if errorlevel 1 (
        echo  [ERREUR] git init a echoue.
        pause
        exit /b 1
    )
    echo.
)

REM --- Configuration du remote ---
git remote remove origin 2>nul
git remote add origin %REMOTE_URL%
echo  Remote 'origin' configure sur : %REMOTE_URL%
echo.

REM --- Add + commit ---
echo  Ajout des fichiers...
git add -A
echo.
echo  Status :
git status --short
echo.

REM Verifie qu'il y a au moins un fichier a commit
git diff --cached --quiet
if not errorlevel 1 (
    REM rien a commit ; check s'il y a deja un commit
    git log -1 --oneline 2>nul
    if errorlevel 1 (
        echo  [INFO] Rien a commit.
    )
) else (
    echo  Creation du commit...
    git commit -m "%COMMIT_MSG%"
    echo.
)

REM --- Force la branche locale a s'appeler main ---
git branch -M %BRANCH%

REM --- Push ---
echo.
echo  Push vers GitHub (origin/%BRANCH%)...
echo  Si Git te demande l'authentification :
echo    - Username : ton login GitHub
echo    - Password : un Personal Access Token (PAS ton mot de passe)
echo      Generer un token : https://github.com/settings/tokens
echo.
git push -u origin %BRANCH%
if errorlevel 1 (
    echo.
    echo  [ECHEC] Le push a echoue.
    echo.
    echo  Verifications a faire :
    echo    1. Le repo distant existe : https://github.com/surrendrart-hub/surr-hdris-viewer
    echo    2. Tu as les droits d'ecriture (collaborator ou owner)
    echo    3. Tu as configure une auth Git ^(token HTTPS ou SSH key^)
    echo.
    echo  Si le repo distant a deja des commits que tu n'as pas en
    echo  local, lance :  git pull origin %BRANCH% --rebase  puis re-push.
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   PUSH REUSSI !
echo  ============================================================
echo   Repo en ligne : https://github.com/surrendrart-hub/surr-hdris-viewer
echo.
echo   Pour activer GitHub Pages (site web zero install) :
echo     1. Aller sur https://github.com/surrendrart-hub/surr-hdris-viewer/settings/pages
echo     2. Source : "Deploy from a branch"
echo     3. Branch : main  /  (root)
echo     4. Save
echo.
echo   Apres 1-2 minutes, ton site sera dispo sur :
echo     https://surrendrart-hub.github.io/surr-hdris-viewer/
echo  ============================================================
echo.
pause
