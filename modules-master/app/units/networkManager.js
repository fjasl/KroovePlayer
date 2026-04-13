const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const dbManager = require('./dbManager');

class NetworkManager {
    constructor(core) {
        this.core = core;
        this.app = express();
        this.app.use(express.json()); // 支持 JSON 请求体
        this.server = http.createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
        
        this.initRoutes();
        this.initWebSocket();
    }

    /**
     * 路由节点集中管理：所有对外的 HTTP 接口都在这里
     */
    initRoutes() {
        // 1. 封面分发 (按 ID 获取)
        this.app.get('/cover-by-id/:id', (req, res) => {
            const track = dbManager.getTrackById(req.params.id);
            if (track && track.cover_path && fs.existsSync(track.cover_path)) {
                res.sendFile(track.cover_path);
            } else {
                res.status(404).send('No cover');
            }
        });

        // 2. 库管理接口：添加新的物理目录
        this.app.post('/api/library/add', async (req, res) => {
            const { folderPath } = req.body;
            if (!folderPath) return res.status(400).json({ error: 'Missing folderPath' });
            
            try {
                await this.core.addLibraryFolder(folderPath);
                res.json({ success: true, folders: this.core.libraryFolders });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });

        // 3. 基础健康检查
        this.app.get('/status', (req, res) => {
            res.json({ 
                status: 'running', 
                engine: 'kroove', 
                monitoredFolders: this.core.libraryFolders 
            });
        });
    }

    /**
     * WebSocket 指令集中管理
     */
    initWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log("👉 [WS] 集线器：前端 Vue 已连接");
            
            ws.on('message', (message) => {
                try {
                    const cmd = JSON.parse(message);
                    // 所有指令统统透传给 Core 控制器处理
                    this.core.handleCommand(cmd);
                } catch(e) { /* 忽略非法格式 */ }
            });

            ws.on('close', () => console.log("👈 [WS] 前端 Vue 已断开"));
        });

        // 将 wss 给 core，让 core 具备主动广播的能力
        this.core.bindWss(this.wss);
    }

    /**
     * 启动网络总线
     */
    start(port = 8080) {
        return new Promise((resolve) => {
            this.server.listen(port, () => {
                console.log(`✨ Kroove 网络节点已集中：http://127.0.0.1:${port}`);
                resolve();
            });
        });
    }
}

module.exports = NetworkManager;
