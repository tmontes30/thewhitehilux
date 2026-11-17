@echo off
chcp 65001 >nul
title TWH - Aplicar coleccion a la tienda
cd /d "%~dp0"

echo.
echo  ============================================
echo   THE WHITE HILUX - Aplicar coleccion
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  No encontre Node.js. Instalalo desde https://nodejs.org y vuelve a intentar.
  goto fin
)

rem 1) Archivo en esta carpeta; 2) si no, el mas reciente en Descargas
set "ARCHIVO="
if exist "twh-coleccion.json" set "ARCHIVO=%~dp0twh-coleccion.json"
if not defined ARCHIVO (
  for /f "delims=" %%F in ('dir /b /o-d "%USERPROFILE%\Downloads\twh-coleccion*.json" 2^>nul') do (
    if not defined ARCHIVO set "ARCHIVO=%USERPROFILE%\Downloads\%%F"
  )
)
if not defined ARCHIVO (
  echo  No encontre twh-coleccion.json.
  echo  Descargalo desde el configurador ^(boton "Descargar coleccion"^)
  echo  y dejalo en Descargas o en esta carpeta.
  goto fin
)

echo  Usando: %ARCHIVO%
echo.
echo  Generando fotos y actualizando la tienda. Esto tarda unos minutos...
echo.
node aplicar.js "%ARCHIVO%"
if errorlevel 1 (
  echo.
  echo  Algo fallo al aplicar la coleccion. Revisa el mensaje de arriba.
  goto fin
)

echo.
echo  Revisando que los pagos sigan funcionando...
pushd "%~dp0..\..\web"
call npm test >nul 2>nul
if errorlevel 1 (
  echo  ATENCION: las pruebas de la tienda fallaron. Avisale a Claude.
) else (
  echo  Pruebas OK.
)
popd

node preparar.js --sin-bases >nul 2>nul

echo.
echo  Listo. Para publicar: git add -A, git commit y git push (o pidele a Claude).
echo  Los productos nuevos aparecen solos en el panel de admin.
echo  Abriendo la tienda...
if "%~1"=="/prueba" exit /b 0
start "" "%~dp0..\..\web\index.html"

:fin
echo.
if "%~1"=="/prueba" exit /b 1
pause
