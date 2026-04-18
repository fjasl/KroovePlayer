#!/bin/bash

# 设置环境变量，确保 npm 能找到相关的 node 进程
export PATH="/home/yun/.nvm/versions/node/v24.13.1/bin:$PATH"

# 获取项目根目录的绝对路径
PROJECT_ROOT=$(dirname "$(readlink -f "$0")")
BACKEND_DIR="$PROJECT_ROOT/modules-master/app"
FRONTEND_DIR="$PROJECT_ROOT/kroove"

echo "🚀 正在启动 KroovePlayer..."

# 1. 启动后端 (Node.js)
echo "📡 正在启动后端服务..."
cd "$BACKEND_DIR" || exit
/home/yun/.nvm/versions/node/v24.13.1/bin/node app.js &
BACKEND_PID=$!

# 2. 启动前端 (Vite)
echo "🎨 正在启动前端界面..."
cd "$FRONTEND_DIR" || exit
/home/yun/.nvm/versions/node/v24.13.1/bin/npm run dev &
FRONTEND_PID=$!

# 捕获退出信号 (Ctrl+C)，确保退出时关闭所有进程
trap "echo '🛑 正在关闭服务...'; kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

echo "✅ 所有服务已就绪！"
echo "🌐 前端地址通常为: http://localhost:5173"
echo "按 Ctrl+C 停止运行。"

# 保持脚本运行，等待进程结束
wait
