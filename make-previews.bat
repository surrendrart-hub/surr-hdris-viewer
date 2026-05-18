@echo off
REM ============================================================
REM  make-previews.bat
REM  Genere des thumbnails JPEG (_thumb.jpg) pour les HDRIs
REM  presents dans assets\skies, outdoor, indoor, studio.
REM
REM  Pourquoi ? Pour alleger l'affichage de la library laterale,
REM  qui sinon devrait decoder des HDR/EXR/DPX a chaque load.
REM
REM  Le viewer principal continue de lire les FICHIERS ORIGINAUX
REM  (HDR/EXR/TIFF/DPX) en priorite.
REM
REM  Dependance : ImageMagick (commande "magick").
REM ============================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  ============================================================
echo   SUR - HDRIs Viewer  /  generation des thumbnails JPEG
echo  ============================================================

REM --- Verification ImageMagick ---
where magick >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [ERREUR] ImageMagick introuvable ^(commande "magick"^).
    echo.
    echo  Installation rapide :
    echo    1. Telecharger l'installeur Windows :
    echo       https://imagemagick.org/script/download.php#windows
    echo       choisir : ImageMagick-x.x.x-Q16-HDRI-x64-dll.exe
    echo    2. Pendant l'installation, COCHER :
    echo       [x] Add application directory to your system path
    echo    3. Fermer puis rouvrir la fenetre PowerShell/CMD
    echo    4. Relancer ce script
    echo.
    pause
    exit /b 1
)

REM --- Parametres ---
set THUMB_W=512
set THUMB_H=256
set QUALITY=82
set SUFFIX=_thumb.jpg
set CATEGORIES=skies outdoor indoor studio

set /a TOTAL=0
set /a CREATED=0
set /a SKIPPED=0
set /a FAILED=0

for %%C in (%CATEGORIES%) do (
    if exist "assets\%%C" (
        echo.
        echo  --- Categorie : %%C ---
        pushd "assets\%%C"

        for %%F in (*.hdr *.exr *.tif *.tiff *.dpx) do (
            if exist "%%F" (
                set /a TOTAL+=1
                set "INPUT=%%F"
                set "BASE=%%~nF"
                set "OUTPUT=!BASE!!SUFFIX!"

                if exist "!OUTPUT!" (
                    set /a SKIPPED+=1
                    echo    skip   !INPUT!  ^(thumb existe deja^)
                ) else (
                    echo    make   !INPUT!  -^>  !OUTPUT!
                    REM ----------------------------------------------------
                    REM Pipeline tonemap pour les HDR/EXR :
                    REM   - -evaluate multiply 0.6 : reduit l'exposition pour
                    REM     ramener les hautes valeurs en zone visible (sinon
                    REM     -auto-level rend tout noir a cause du soleil)
                    REM   - -gamma 2.2 : encode lineaire -^> sRGB
                    REM   - -clamp : ecrete les valeurs hors [0,1]
                    REM Pour les TIFF/DPX 8-16 bit : meme pipeline marche
                    REM (les multiplications sur 8-bit sont neutres).
                    REM ----------------------------------------------------
                    magick "!INPUT!" -auto-orient -evaluate multiply 0.6 -gamma 2.2 -clamp -colorspace sRGB -resize !THUMB_W!x!THUMB_H! -quality !QUALITY! -strip "!OUTPUT!" 2>nul
                    if errorlevel 1 (
                        set /a FAILED+=1
                        echo    [echec] !INPUT!
                    ) else (
                        set /a CREATED+=1
                    )
                )
            )
        )

        popd
    )
)

echo.
echo  ============================================================
echo   Fichiers HDR/EXR/TIFF/DPX scannes : !TOTAL!
echo   Thumbnails crees                  : !CREATED!
echo   Thumbnails deja existants         : !SKIPPED!
echo   Echecs                            : !FAILED!
echo  ============================================================
echo.
echo  Astuce :
echo    - Pour forcer la regeneration : supprimez les *_thumb.jpg
echo      puis relancez ce script.
echo    - Rechargez la page web du viewer ou cliquez le bouton
echo      Refresh (↻) du panneau Library pour voir les nouveaux
echo      thumbnails.
echo.
pause
