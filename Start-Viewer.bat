@echo off
cd /d "%~dp0"
start "" http://localhost:4173
npx --yes serve . -p 4173 --no-clipboard
