const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");
const dbManager = require("./dbManager");

class NetworkManager {
  constructor(core) {
    this.core = core;
    this.app = express();
    this.app.use(express.json()); // 支持 JSON 请求体

    // 配置 CORS，允许前端跨域请求
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });
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
    this.app.get("/cover-by-id/:id", (req, res) => {
      const track = dbManager.getTrackById(req.params.id);
      if (track && track.cover_path && fs.existsSync(track.cover_path)) {
        res.sendFile(track.cover_path);
      } else {
        res.status(404).send("No cover");
      }
    });
    
    // 2. 获取单曲详情
    this.app.get("/api/track/details/:id", (req, res) => {
      const details = this.core.getTrackDetails(req.params.id);
      if (details) {
        res.json(details);
      } else {
        res.status(404).json({ error: "Track not found" });
      }
    });

    // 3. 库管理接口：添加新的物理目录
    this.app.post("/api/library/add", async (req, res) => {
      const { folderPath } = req.body;
      if (!folderPath)
        return res.status(400).json({ error: "Missing folderPath" });

      try {
        await this.core.addLibraryFolder(folderPath);
        res.json({ success: true, folders: this.core.libraryFolders });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
    
    // 3. 获取当前播放队列的完整 ID 序列 (轻量级)
    this.app.get("/api/playlist/ids", (req, res) => {
      res.json(this.core.playlist.getQueueIds());
    });

    // 4. 批量获取曲目详情 (推荐虚拟列表滚动时使用)
    this.app.post("/api/track/batch", (req, res) => {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: "Missing or invalid ids array" });
      }
      const details = this.core.playlist.getDetailsBatch(ids);
      res.json(details);
    });

    // 5. 基础健康检查
    this.app.get("/status", (req, res) => {
      res.json({
        status: "running",
        engine: "kroove",
        monitoredFolders: this.core.libraryFolders,
      });
    });
      // 手动匹配资源接口
    this.app.post("/api/track/update-manual", async (req, res) => {
      const { id, lrcPath, coverPath } = req.body;

      if (!id) return res.status(400).json({ error: "Missing track id" });

      try {
        await this.core.updateTrackManual(id, {
          lrc_path: lrcPath,
          cover_path: coverPath,
        });
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // 6. 获取可用的渲染模式列表
    this.app.get("/api/render/modes", (req, res) => {
      const modesDir = path.join(__dirname, "../../../kroove/src/composables/render");
      const modes = [];
      try {
        if (fs.existsSync(modesDir)) {
          const dirs = fs.readdirSync(modesDir, { withFileTypes: true });
          for (const dir of dirs) {
            if (dir.isDirectory()) {
              const manifestPath = path.join(modesDir, dir.name, "manifest.json");
              if (fs.existsSync(manifestPath)) {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
                modes.push({ label: manifest.name, value: manifest.id });
              }
            }
          }
        }
      } catch (e) {
        console.error("读取渲染模式失败:", e);
      }
      res.json(modes);
    });
  }

  /**
   * WebSocket 指令集中管理
   */
  initWebSocket() {
    this.wss.on("connection", (ws) => {
      console.log("👉 [WS] 集线器：前端 Vue 已连接");
      
      // [StateMachine Bonus] 一旦连接，立即同步全量状态快照给该客户端
      this.core.syncCurrentState(ws);

      ws.on("message", (message) => {
        try {
          const cmd = JSON.parse(message);
          // 所有指令统统透传给 Core 控制器处理
          this.core.handleCommand(cmd);
        } catch (e) {
          /* 忽略非法格式 */
        }
      });

      ws.on("close", () => console.log("👈 [WS] 前端 Vue 已断开"));
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
