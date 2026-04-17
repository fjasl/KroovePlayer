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
        this.scanType = 'add';   // 'add' | 'remove' | 'update'
        this.lastFile = '';      // 当前正在处理的文件名
    }

    /**
     * 核心扫描入口：遍历所有库文件夹并增量更新
     */
    async scanAll() {
        const folders = configManager.get('libraryFolders') || [];
        console.log(`🚀 开始扫描 ${folders.length} 个库目录...`);
        this.isScanning = true;
        this.scanCount = 0;
        
        if (this.onScanStatus) this.onScanStatus(true, 0, 'add', '正在初始化...');

        for (const folder of folders) {
            await this.scanDirectory(folder);
        }
        
        this.isScanning = false;
        if (this.onScanStatus) this.onScanStatus(false, this.scanCount, 'add', '扫描完成');
        console.log("✅ 库扫描完成！");
    }

    async scanDirectory(dir) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.resolve(dir, entry.name);
            if (entry.isDirectory()) {
                await this.scanDirectory(fullPath);
            } else if (this.isAudioFile(fullPath)) {
                const isNew = await this.processTrack(fullPath);
                if (isNew) {
                    this.scanCount++;
                    if (this.onScanStatus && this.scanCount % 5 === 0) {
                        this.onScanStatus(true, this.scanCount, 'add', entry.name);
                    }
                }
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
                return false; // 无变动
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

            // 3. 歌词匹配逻辑 (使用独立提取的匹配算法)
            let lrcPath = existing ? existing.lrc_path : null;
            if (!existing || existing.is_lrc_manual === 0) {
                lrcPath = this.findBestLrc(filePath);
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
            return true; // 确实有变动或新增

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

        const triggerChange = (type = 'add', fileName = '') => {
            this.isScanning = true;
            this.scanCount++; 
            if (this.onScanStatus) this.onScanStatus(true, this.scanCount, type, fileName);

            if (this.notifyTimer) clearTimeout(this.notifyTimer);
            this.notifyTimer = setTimeout(() => {
                console.log(`🔄 [Watcher] ${type} 扫描周期结束，正在通知系统同步...`);
                this.isScanning = false;
                if (this.onScanStatus) this.onScanStatus(false, this.scanCount, type, fileName);
                if (onLibraryChanged) onLibraryChanged();
                this.scanCount = 0; // 结算后清零
            }, 3000); 
        };

        this.watcher
            .on('add', async filePath => {
                const fileName = path.basename(filePath);
                if (this.isAudioFile(filePath)) {
                    console.log(`➕ [Watcher] 发现新曲目: ${fileName}`);
                    await this.processTrack(filePath);
                    triggerChange('add', fileName);
                } else if (filePath.toLowerCase().endsWith('.lrc')) {
                    console.log(`📜 [Watcher] 发现新歌词: ${fileName}，正在尝试匹配音频...`);
                    await this.reprocessDirectory(path.dirname(filePath));
                    triggerChange('update', fileName);
                }
            })
            .on('change', async filePath => {
                const fileName = path.basename(filePath);
                if (this.isAudioFile(filePath)) {
                    console.log(`📝 [Watcher] 更新曲目: ${fileName}`);
                    await this.processTrack(filePath);
                    triggerChange('update', fileName);
                } else if (filePath.toLowerCase().endsWith('.lrc')) {
                    console.log(`📝 [Watcher] 歌词内容变动: ${fileName}，重新关联同目录曲目...`);
                    await this.reprocessDirectory(path.dirname(filePath));
                    triggerChange('update', fileName);
                }
            })
            .on('unlink', filePath => {
                const fileName = path.basename(filePath);
                if (this.isAudioFile(filePath)) {
                    console.log(`➖ [Watcher] 物理删除: ${fileName}`);
                    dbManager.removeTrackByPath(filePath);
                    triggerChange('remove', fileName);
                } else if (filePath.toLowerCase().endsWith('.lrc')) {
                    console.log(`➖ [Watcher] 歌词删除: ${fileName}，更新同目录曲目关联...`);
                    this.reprocessDirectory(path.dirname(filePath));
                    triggerChange('update', fileName);
                }
            });
    }

    /**
     * 当歌词变动时，重新处理该目录下所有音频文件以同步歌词关联
     */
    async reprocessDirectory(dirPath) {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.resolve(dirPath, entry.name);
                // 仅针对音频文件执行轻量级的歌词路径更新
                if (entry.isFile() && this.isAudioFile(fullPath)) {
                    this.updateLyricOnly(fullPath);
                }
            }
        } catch (e) {
            console.error(`❌ 重处理目录 ${dirPath} 失败:`, e.message);
        }
    }

    /**
     * [轻量级更新] 仅重新计算并更新歌词路径，不解析音频元数据，不处理封面
     */
    updateLyricOnly(audioPath) {
        const existing = dbManager.db.prepare('SELECT * FROM tracks WHERE path = ?').get(audioPath);
        if (!existing) return; // 如果歌本身没入库，不处理
        if (existing.is_lrc_manual !== 0) return; // 用户手动指定的歌词，不自动覆盖

        const newLrcPath = this.findBestLrc(audioPath);
        
        // 只有当计算出的歌词路径与数据库不一致时才写入，减少 DB 压力
        if (newLrcPath !== existing.lrc_path) {
            dbManager.db.prepare('UPDATE tracks SET lrc_path = ? WHERE path = ?').run(newLrcPath, audioPath);
            console.log(`🔗 [LyricSync] 已自动关联: ${path.basename(audioPath)} -> ${newLrcPath ? path.basename(newLrcPath) : '无'}`);
        }
    }

    /**
     * [核心算法] 歌词匹配：精确匹配 -> 归一化模糊匹配
     */
    findBestLrc(filePath) {
        const baseName = path.basename(filePath, path.extname(filePath));
        const dir = path.dirname(filePath);

        // 1. 精确匹配
        const potLrc = path.join(dir, baseName + '.lrc');
        if (fs.existsSync(potLrc)) return potLrc;

        // 2. 模糊匹配 (归一化)
        try {
            const files = fs.readdirSync(dir);
            const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
            const baseNorm = normalize(baseName);
            if (baseNorm.length === 0) return null;

            const bestMatch = files.find(f => {
                if (!f.toLowerCase().endsWith('.lrc')) return false;
                const lrcBaseNorm = normalize(path.basename(f, '.lrc'));
                return lrcBaseNorm.length > 0 && (baseNorm.includes(lrcBaseNorm) || lrcBaseNorm.includes(baseNorm));
            });
            return bestMatch ? path.join(dir, bestMatch) : null;
        } catch (e) {
            return null;
        }
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
