const fs = require('fs');
const path = require('path');

// 将 JSON 配置文件放到和 db 一样的外面层级
const configPath = path.resolve(__dirname, '../../kroove_config.json');

const defaultConfig = {
    libraryFolders: [], // 记录所有监听扫描的本地音乐文件夹
    themeMode: 'system',
    autoRetrieve: true
};

class ConfigManager {
    constructor() {
        this.config = { ...defaultConfig };
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

    save() {
        try {
            // 使用 null, 4 保持 JSON 格式漂亮可读
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 4), 'utf8');
        } catch (e) {
            console.error("❌ 写入配置文件出错:", e);
        }
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        this.config[key] = value;
        this.save();
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
