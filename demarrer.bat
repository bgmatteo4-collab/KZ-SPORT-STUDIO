@echo off
rem ============================================================================
rem  KZ Studio — demarrage, Windows.
rem
rem  A double-cliquer. Il verifie Node, installe ce qu'il faut la premiere fois,
rem  ecrit la configuration, lance le serveur et ouvre la regie.
rem
rem  Note : les messages sont SANS ACCENTS, volontairement. L'invite de
rem  commandes de Windows gere mal l'UTF-8 selon la version, et un lanceur qui
rem  affiche des caracteres illisibles au premier contact fait douter de tout
rem  le reste. Le reste du projet est en francais accentue.
rem ============================================================================

title KZ Studio
cd /d "%~dp0"

echo.
echo   KZ STUDIO
echo   ---------
echo.

rem --- 1. Node.js ------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js n'est pas installe sur cette machine.
  echo.
  echo   J'ouvre la page de telechargement. Prends la version "LTS",
  echo   installe-la en laissant les options par defaut, puis relance
  echo   ce fichier.
  echo.
  start "" https://nodejs.org/fr/download
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODEV=%%v
echo   [v] Node %NODEV%

rem --- 2. pnpm, via corepack (livre avec Node) -------------------------------
call corepack enable >nul 2>nul
where pnpm >nul 2>nul
if errorlevel 1 (
  echo   [X] pnpm est introuvable malgre corepack.
  echo       Ouvre une invite de commandes EN ADMINISTRATEUR et tape :
  echo         corepack enable
  echo       puis relance ce fichier.
  pause
  exit /b 1
)
echo   [v] pnpm pret

rem --- 3. La configuration, a la premiere ouverture --------------------------
if not exist ".env" (
  echo   [.] Premiere ouverture : j'ecris la configuration .env
  > .env echo # Configuration KZ Studio. Modifiable a la main.
  >> .env echo # ESPN ne demande aucun jeton et couvre Ligue 1 et Ligue des Champions.
  >> .env echo KZ_PROVIDER=espn
  >> .env echo ESPN_LEAGUE=fra.1
  >> .env echo KZ_MULTIPLEX=1
  >> .env echo KZ_PORT=4100
)

rem --- 4. Les dependances, une seule fois ------------------------------------
if not exist "node_modules" (
  echo   [.] Installation des dependances. C'est long UNE SEULE FOIS,
  echo       compte deux a trois minutes. Ne ferme pas cette fenetre.
  echo.
  call pnpm install
  if errorlevel 1 (
    echo.
    echo   [X] L'installation a echoue. Verifie ta connexion et relance.
    pause
    exit /b 1
  )
)
echo   [v] Dependances en place

rem --- 5. Le match de demonstration, pour pouvoir travailler hors ligne ------
if not exist "fixtures\demo-ucl.json" (
  echo   [.] Generation du match de demonstration
  call pnpm fixture >nul 2>nul
)

rem --- 6. On ouvre la regie quand le serveur a eu le temps de repondre -------
start "" /b cmd /c "timeout /t 9 /nobreak >nul && start "" http://localhost:4000/regie/"

echo.
echo   ======================================================================
echo.
echo    Regie        http://localhost:4000/regie/
echo    Banc d'essai http://localhost:4000/preview/     (F = plein ecran)
echo.
echo    DANS OBS, deux sources navigateur, 1920 x 1080 chacune :
echo.
echo      Arriere-plan   http://localhost:4000/overlay/?layer=bg
echo      ta webcam      ENTRE LES DEUX
echo      Avant-plan     http://localhost:4000/overlay/?layer=fg
echo.
echo    Dans la regie : touche M pour choisir le match.
echo.
echo    Pour tout arreter : ferme cette fenetre, ou Ctrl+C.
echo.
echo   ======================================================================
echo.

call pnpm dev

echo.
echo   Serveur arrete.
pause
