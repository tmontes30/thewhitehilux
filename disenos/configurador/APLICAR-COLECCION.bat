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
  echo  Exportalo desde el configurador ^(boton "Exportar productos nuevos"^)
  echo  y dejalo en Descargas o en esta carpeta.
  goto fin
)

echo  Usando: %ARCHIVO%
echo.
echo  Generando fotos y agregando los productos nuevos ^(lo que ya estaba no se toca^)...
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
  popd
  echo  ATENCION: las pruebas de la tienda fallaron. NO se publico nada. Avisale a Claude.
  goto fin
)
echo  Pruebas OK.
popd

node preparar.js --sin-bases >nul 2>nul
node copiar-al-panel.js >nul 2>nul
if "%~1"=="/prueba" exit /b 0

rem ---- Publicar en la pagina (GitHub Pages se actualiza solo en 1-2 minutos) ----
echo.
echo  Publicando en thewhitehilux.cavedevz.com...
pushd "%~dp0..\.."
git add web/data/catalog.js web/assets/img/productos web/admin/configurador disenos/configurador/datos.js
git diff --cached --quiet
if not errorlevel 1 (
  echo  No habia cambios nuevos que publicar.
  popd
  goto abrir
)
git -c user.name="tmontes30" -c user.email="tmontes30@users.noreply.github.com" commit -q -m "Productos nuevos desde el configurador"
git push -q
if errorlevel 1 (
  popd
  echo  ATENCION: no se pudo publicar ^(revisa tu internet^). Los cambios quedaron guardados; avisale a Claude.
  goto fin
)
echo  Publicado. En 1-2 minutos se ve en la pagina.
echo  Los productos nuevos aparecen solos en el panel de admin.

rem ---- El servidor de pagos tiene su propia copia del catalogo: sin esto no aceptaria pagar los productos nuevos ----
echo.
echo  Actualizando el servidor de pagos ^(2-4 minutos^)...
call firebase deploy --only functions:crearPreferencia,functions:validarCupon,functions:webhook,functions:guardarCarrito --project the-white-hilux >nul 2>nul
if errorlevel 1 (
  echo  ATENCION: no se pudo actualizar el servidor de pagos. Los productos se ven en la tienda,
  echo  pero NO se podran pagar hasta actualizarlo. Avisale a Claude.
) else (
  echo  Servidor de pagos actualizado.
)
popd

:abrir
echo  Abriendo la tienda...
start "" "https://thewhitehilux.cavedevz.com/"

:fin
echo.
if "%~1"=="/prueba" exit /b 1
pause
