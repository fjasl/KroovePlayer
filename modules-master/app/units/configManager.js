const fs = require('fs');
const path = require('path');

// 将 JSON 配置文件放到和 db 一样的外面层级
const configPath = path.resolve(__dirname, '../../kroove_config.json');

const defaultConfig = {
    serverPort: 6344,            // 后端服务端口
    libraryFolders: [], // 记录所有监听扫描的本地音乐文件夹
    themeMode: 'system',
    autoRetrieve: true,
    last_played_id: null,
    playbackMode: 'sequential', // 播放模式
    volume: 1.0,               // 音量
    uiState: {                 // [New] 持续化 UI 状态
        activeSidebarId: 'home',
        activeTab: 'songs',
        isFullScreen: false,
        themeMode: 'dark',
        enableLyricsAnimation: true
    }
};

class ConfigManager {
    constructor() {
        this.config = { ...defaultConfig };
        this._saveTimer = null;
        this.load();
    }

    load() {
        if (fs.existsSync(configPath)) {
            try {
                const data = fs.readFileSync(configPath, 'utf8');
                this.config = { ...this.config, ...JSON.parse(data) };
            } catch (e) {
                console.error("❌ 读取配置文件失败:", e);
            }
        } else {
            // 如果不存在，首次运行会自动创建
            this.save();
        }
    }

    /**
     * 立即原子写入：先写临时文件再 rename，防止写入中途崩溃导致文件损坏。
     * 同时会取消任何挂起的防抖写入。
     */
    save() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        try {
            const tmpPath = configPath + '.tmp';
            fs.writeFileSync(tmpPath, JSON.stringify(this.config, null, 4), 'utf8');
            fs.renameSync(tmpPath, configPath);
        } catch (e) {
            console.error("❌ 写入配置文件出错:", e);
        }
    }

    /**
     * 防抖写入：500ms 内的多次调用合并为一次磁盘写入。
     * 适用于高频更新场景（如音量拖拽、播放进度持久化）。
     */
    _scheduleSave() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.save(), 500);
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        this.config[key] = value;
        this._scheduleSave();
    }

    // --- 专门为监控目录提供的便捷封装 ---
    addLibraryFolder(folderPath) {
        if (!this.config.libraryFolders.includes(folderPath)) {
            this.config.libraryFolders.push(folderPath);
            this.save();
        }
    }

    removeLibraryFolder(folderPath) {
        this.config.libraryFolders = this.config.libraryFolders.filter(p => p !== folderPath);
        this.save();
    }
}

module.exports = new ConfigManager();
