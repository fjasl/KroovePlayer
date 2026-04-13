const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../kroove.db');
const db = new Database(dbPath);

// 初始化数据表 
    // 1. 核心曲目表：增加了文件指纹和手动标志位
    db.exec(`
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL,    -- 音乐路径
            lrc_path TEXT,               -- 歌词路径
            cover_path TEXT,             -- 封面路径
            title TEXT,
            artist TEXT,
            album TEXT,
            duration REAL,
            
            -- 增量更新同步位
            file_mtime INTEGER,          -- 修改时间
            file_size INTEGER,           -- 文件大小
            
            -- 手动控制位 (1 表示用户手动锁定，自动扫描不覆盖)
            is_metadata_manual INTEGER DEFAULT 0,
            is_lrc_manual INTEGER DEFAULT 0,
            is_cover_manual INTEGER DEFAULT 0
        );

        -- 2. 库文件夹表：记录用户监控的曲库根目录
        CREATE TABLE IF NOT EXISTS library_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL
        );

        -- 3. 应用状态表
        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL
        );
    `);

module.exports = {
    db,
    // 【核心能力】极速由 ID 获取物理路径
    getTrackById: (id) => db.prepare('SELECT * FROM tracks WHERE id = ?').get(id),
    setState: (key, val) => db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run(key, JSON.stringify(val)),
    getState: (key) => {
        const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key);
        return row ? JSON.parse(row.value) : null;
    }
};
