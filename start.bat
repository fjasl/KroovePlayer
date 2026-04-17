@echo off
:: 使用 wt 启动，第一个标签页运行前端，第二个标签页运行后端
:: %~dp0 是脚本所在的当前目录路径
wt -d "%~dp0kroove" cmd /k "npm run dev" ; nt -d "%~dp0modules-master\app" cmd /k "node app.js"
