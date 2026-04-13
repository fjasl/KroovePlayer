const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mm = require('music-metadata');
const dbManager = require('./dbManager');
const configManager = require('./configManager'); // 引入新的 JSON 配置管理器

const CACHE_DIR = path.resolve(__dirname, '../cache/covers');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

class LibraryManager {
    /**
     * 核心扫描入口：遍历所有库文件夹并增量更新
     */
    async scanAll() {
        const folders = configManager.get('libraryFolders') || [];
        console.log(`🚀 开始扫描 ${folders.length} 个库目录...`);

        for (const folder of folders) {
            await this.scanDirectory(folder);
        }
        console.log("✅ 库扫描完成！");
    }

    async scanDirectory(dir) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.resolve(dir, entry.name);
            if (entry.isDirectory()) {
                await this.scanDirectory(fullPath);
            } else if (entry.name.toLowerCase().endsWith('.mp3')) {
                await this.processTrack(fullPath);
            }
        }
    }

    async processTrack(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const mtime = stats.mtimeMs;
            const size = stats.size;

            // 1. 增量检查：如果该文件已存在且 mtime/size 没变过，直接跳过
            const existing = dbManager.db.prepare('SELECT * FROM tracks WHERE path = ?').get(filePath);
            if (existing && existing.file_mtime === mtime && existing.file_size === size) {
                return;
            }

            console.log(`🔍 正在解析: ${path.basename(filePath)}`);
            const metadata = await mm.parseFile(filePath);
            
            // 2. 封面处理优先级 (Level 1: 内嵌)
            let coverPath = existing ? existing.cover_path : null;
            if (!existing || existing.is_cover_manual === 0) {
                const picture = mm.selectCover(metadata.common.picture);
                if (picture) {
                    const hash = crypto.createHash('md5').update(picture.data).digest('hex');
                    const ext = picture.format.split('/')[1] || 'jpg';
                    const targetPath = path.join(CACHE_DIR, `${hash}.${ext}`);
                    if (!fs.existsSync(targetPath)) fs.writeFileSync(targetPath, picture.data);
                    coverPath = targetPath;
                } else {
                    // (Level 2: 同名文件)
                    const baseName = path.basename(filePath, path.extname(filePath));
                    const dir = path.dirname(filePath);
                    const potJpg = path.join(dir, baseName + '.jpg');
                    const potPng = path.join(dir, baseName + '.png');
                    if (fs.existsSync(potJpg)) coverPath = potJpg;
                    else if (fs.existsSync(potPng)) coverPath = potPng;
                }
            }

            // 3. 歌词匹配逻辑 (Level 1: 外部同名)
            let lrcPath = existing ? existing.lrc_path : null;
            if (!existing || existing.is_lrc_manual === 0) {
                const baseName = path.basename(filePath, path.extname(filePath));
                const potLrc = path.join(path.dirname(filePath), baseName + '.lrc');
                lrcPath = fs.existsSync(potLrc) ? potLrc : null;
            }

            // 4. 入库 (增量更新)
            dbManager.db.prepare(`
                INSERT INTO tracks (
                    path, lrc_path, cover_path, title, artist, album, duration, 
                    file_mtime, file_size
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    lrc_path = excluded.lrc_path,
                    cover_path = excluded.cover_path,
                    title = CASE WHEN is_metadata_manual = 0 THEN excluded.title ELSE title END,
                    artist = CASE WHEN is_metadata_manual = 0 THEN excluded.artist ELSE artist END,
                    album = CASE WHEN is_metadata_manual = 0 THEN excluded.album ELSE album END,
                    file_mtime = excluded.file_mtime,
                    file_size = excluded.file_size
            `).run(
                filePath, 
                lrcPath, 
                coverPath, 
                metadata.common.title || path.basename(filePath, '.mp3'),
                metadata.common.artist || "未知歌手",
                metadata.common.album || "未知专辑",
                metadata.format.duration || 0,
                mtime,
                size
            );

        } catch (e) {
            console.error(`❌ 解析 ${filePath} 出错:`, e.message);
        }
    }

    /**
     * 添加新的库目录并立即开启一次全量扫描，存放进入 JSON
     */
    async addFolder(folderPath) {
        try {
            configManager.addLibraryFolder(path.resolve(folderPath)); // 写入 JSON
            await this.scanAll(); // 立即热扫
        } catch (e) {
            console.error("❌ 添加目录失败:", e);
        }
    }
}

module.exports = new LibraryManager();
