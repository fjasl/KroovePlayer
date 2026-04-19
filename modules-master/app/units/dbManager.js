const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = path.resolve(__dirname, "../../kroove.db");
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
    `);

module.exports = {
  db,
  // 【核心能力】极速由 ID 获取物理路径
  getTrackById: (id) => db.prepare("SELECT * FROM tracks WHERE id = ?").get(id),
  // dbManager.js
  removeTrackByPath: (filePath) => 
    db.prepare("DELETE FROM tracks WHERE path = ?").run(filePath),

  updateTrackManual: (id, data) => {
    const fields = [];
    const values = [];

    if (data.lrc_path !== undefined) {
      fields.push("lrc_path = ?", "is_lrc_manual = 1");
      values.push(data.lrc_path);
    }
    if (data.cover_path !== undefined) {
      fields.push("cover_path = ?", "is_cover_manual = 1");
      values.push(data.cover_path);
    }

    values.push(id);
    return db
      .prepare(`UPDATE tracks SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
  },

  // 清理不再属于任何监控目录的歌曲
  pruneOrphanedTracks: (allowedFolders) => {
    const tracks = db.prepare("SELECT id, path FROM tracks").all();
    const toDelete = tracks.filter(track => {
      // 如果路径不属于任何一个监控文件夹，且该文件在磁盘上可能已失效，则标记为删除
      return !allowedFolders.some(folder => track.path.startsWith(folder));
    });
    
    if (toDelete.length > 0) {
      const deleteStmt = db.prepare("DELETE FROM tracks WHERE id = ?");
      const transaction = db.transaction((ids) => {
        for (const id of ids) deleteStmt.run(id);
      });
      transaction(toDelete.map(t => t.id));
    }
    return toDelete.length;
  }
};
