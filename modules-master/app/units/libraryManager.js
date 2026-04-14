const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mm = require('music-metadata');
const chokidar = require('chokidar');
const dbManager = require('./dbManager');
const configManager = require('./configManager'); // 引入新的 JSON 配置管理器

const CACHE_DIR = path.resolve(__dirname, '../cache/covers');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

class LibraryManager {
    constructor() {
        this.watcher = null;
        this.notifyTimer = null;
        this.scanCount = 0; // 当前“突发”扫描的文件总数
        this.isScanning = false;
        this.onScanStatus = null; // 用于通知上层的回调
    }

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
     * 实时库监视器初始化
     * @param {Function} onLibraryChanged - 库发生变动后的回调 (带防抖)
     */
    initWatcher(onLibraryChanged) {
        const folders = configManager.get('libraryFolders') || [];
        if (folders.length === 0) return;

        if (this.watcher) this.watcher.close();

        console.log(`👁️  库监视器已开启: 正在观察 ${folders.length} 个目录...`);
        
        this.watcher = chokidar.watch(folders, {
            ignored: /(^|[\/\\])\../, // 忽略隐藏文件
            persistent: true,
            ignoreInitial: true, // 初始扫描由 scanAll 完成，watcher 只看增量
            awaitWriteFinish: {
                stabilityThreshold: 1000,
                pollInterval: 100
            }
        });

        const triggerChange = () => {
            if (this.onScanStatus) this.onScanStatus(true, this.scanCount);

            if (this.notifyTimer) clearTimeout(this.notifyTimer);
            this.notifyTimer = setTimeout(() => {
                console.log("🔄 [Watcher] 检测到库显著变动，正在通知系统同步...");
                this.isScanning = false;
                if (this.onScanStatus) this.onScanStatus(false, this.scanCount);
                if (onLibraryChanged) onLibraryChanged();
                this.scanCount = 0; // 结算后清零
            }, 3000); // 扫描稳定 3 秒后关闭通知
        };

        this.watcher
            .on('add', async filePath => {
                if (this.isAudioFile(filePath)) {
                    this.isScanning = true;
                    this.scanCount++;
                    console.log(`➕ [Watcher] 发现新曲目: ${path.basename(filePath)}`);
                    await this.processTrack(filePath);
                    triggerChange();
                }
            })
            .on('change', async filePath => {
                if (this.isAudioFile(filePath) || filePath.endsWith('.lrc')) {
                    console.log(`📝 [Watcher] 更新资源: ${path.basename(filePath)}`);
                    // 如果是歌词变动，需要处理其对应的音频文件
                    const targetPath = filePath.endsWith('.lrc') 
                        ? filePath.replace('.lrc', '.mp3') // 简化逻辑，实际可能需要更复杂的映射
                        : filePath;
                    
                    if (fs.existsSync(targetPath)) await this.processTrack(targetPath);
                    triggerChange();
                }
            })
            .on('unlink', filePath => {
                if (this.isAudioFile(filePath)) {
                    console.log(`➖ [Watcher] 物理删除: ${path.basename(filePath)}`);
                    dbManager.removeTrackByPath(filePath);
                    triggerChange();
                }
            });
    }

    isAudioFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return ['.mp3', '.flac', '.wav', '.ogg', '.m4a'].includes(ext);
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
