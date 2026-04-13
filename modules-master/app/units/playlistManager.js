const dbManager = require('./dbManager.js');

class PlaylistManager {
    constructor() {
        // 全内存只有极省空间的整数 ID
        this.queue = []; 
        this.history = []; // 播放历史记录，用于实现精准“上一首”
        this.currentIndex = 0;
        this.mode = 'sequential'; // 'sequential', 'shuffle', 'repeat'
        
        // 双向 Map (应用户要求，方便后续按名查找，虽然会有重名覆盖的情况但可满足初步需要)
        this.idToName = new Map();
        this.nameToId = new Map();
        this.fullData = []; // 用于发给前端渲染曲库大列表
    }

    setMode(newMode) {
        this.mode = newMode;
        console.log(`🔀 播放模式已切换为: ${this.mode}`);
    }

    // 从数据库拉取全部 ID 进内存游标
    loadAll() {
        // 连同列表所需数据一并取出
        const rows = dbManager.db.prepare('SELECT id, title, artist, album, duration FROM tracks').all();
        this.queue = rows.map(r => r.id);
        
        this.idToName.clear();
        this.nameToId.clear();
        this.fullData = [];

        rows.forEach(r => {
            this.idToName.set(r.id, r.title);
            this.nameToId.set(r.title, r.id);
            this.fullData.push({
                id: r.id,
                title: r.title,
                artist: r.artist,
                album: r.album,
                duration: r.duration
            });
        });

        this.currentIndex = dbManager.getState('last_played_index') || 0;
    }

    getFullList() {
        return this.fullData;
    }

    next(isAuto = false) {
        if (this.queue.length === 0) return null;
        
        // 1. 如果是自然播完（isAuto）且是单曲循环模式，直接返回当前同一首即可
        if (isAuto && this.mode === 'repeat') {
            return this.current();
        }

        // 跳转前，将当前 ID 记入历史记录
        const curId = this.current();
        if (curId) {
            this.history.push(curId);
            if (this.history.length > 50) this.history.shift(); // 限制记录数量
        }

        // 2. 根据模式决定下一个 Index
        if (this.mode === 'shuffle') {
            this.currentIndex = Math.floor(Math.random() * this.queue.length);
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.queue.length;
        }

        dbManager.setState('last_played_index', this.currentIndex);
        return this.queue[this.currentIndex];
    }

    prev() {
        if (this.queue.length === 0) return null;

        let prevId;
        if (this.history.length > 0) {
            // 从历史记录中弹出上一首
            prevId = this.history.pop();
            const idx = this.queue.indexOf(prevId);
            if (idx !== -1) this.currentIndex = idx;
        } else {
            // 没有历史时，降级为顺序逻辑
            this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
            prevId = this.queue[this.currentIndex];
        }

        dbManager.setState('last_played_index', this.currentIndex);
        return prevId;
    }
    
    current() {
        if (this.queue.length === 0) return null;
        return this.queue[this.currentIndex];
    }

    /**
     * 获取当前播放点附近的 ID 列表 (用于前端预载元数据)
     */
    getWindowIds(before = 5, after = 15) {
        if (this.queue.length === 0) return [];
        const start = Math.max(0, this.currentIndex - before);
        const end = Math.min(this.queue.length, this.currentIndex + after + 1);
        return this.queue.slice(start, end);
    }
}
module.exports = new PlaylistManager();
