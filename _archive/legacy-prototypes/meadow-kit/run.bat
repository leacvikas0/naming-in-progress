@echo off
rem Double-click to run the meadow demo.
cd /d "%~dp0"
echo.
echo   meadow-kit  ->  http://localhost:4180/
echo   softness lab ->  http://localhost:4180/scratch/soft-compare.html
echo   species rack ->  http://localhost:4180/scratch/preview.html?species=daisy
echo.
echo   Ctrl+C to stop.
echo.
node tools/serve.mjs 4180
pause
