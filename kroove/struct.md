# Kroove 跨平台高质量独立播放器 - 核心存储与流转架构

本架构主要确立了“前端（Vue）控制薄层化”、“Node 业务总线零拷贝化”、“C++ 底层解码异步化”的巅峰多媒体设计模式。核心特点是：**完全解耦，绝不将庞大的对象数组加载到内存中。**

## 一、底层物理存储：SQLite 基床管理（`dbManager.js`）

在存储万量级歌曲元数据时，舍弃 JSON 及纯文件系统，全面切入同步 C++ 绑定的 `better-sqlite3`。

### 1核心设计原则
1. **纯同步调用**：避免 V8 Promise 微任务造成的执行栈堆积。
2. **特殊资产落地化**：音乐提取出的封面图片 (`cover`) 坚决不进数据库的 Blob 列存，而是在文件扫描时统一提取写出为物理图片档 (`AppData/covers/{MD5}.jpg`)。配合 Express 静态服务，彻底将巨幅图片的渲染工作推回给浏览器的极速 C++ 缓存层。

### 2数据表结构规划
```sql
-- `tracks` : 存放底层文件的绝对静态体征
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- 【关键标识，整个系统的流通货币】
    path TEXT UNIQUE NOT NULL,            -- 歌曲物理绝对路径 
    title TEXT,
    artist TEXT,
    album TEXT,
    duration REAL,
    cover_filename TEXT                   -- 封面图片缓存的文件名
);

-- `app_state` : 存放掉电与重启的环境记忆体
CREATE TABLE app_state (
    key TEXT UNIQUE NOT NULL,      -- 例：last_played_id, volume, mode
    value TEXT NOT NULL            -- JSON 序列化字符
);
```

---

## 二、内存调度中枢：游标指针层（`playlistManager.js`）

Node 宿主的内存管理严格杜绝“巨头对象数组模式”，而是全权实施“游标与整数流水线”。

### 1极简的内存结构
不再存在 `[{title:'A',...}, {title:'B',...}]` 的大部头字典存储，唯一的排队者只有一根纯整数构成的数字大坝：
```javascript
class PlaylistManager {
    constructor() {
        // 全内存中只有最省空间的整数 ID 数组，占用通常不及 1MB
        this.queue = [101, 15, 308, 922, ...];  
        this.currentIndex = 0; // 【核心游标】：负责决定当下该提啥货
        this.mode = 'sequential'; 
    }
}
```

### 2运行时动作与洗牌的低负荷收益
*   当用户执行“随机乱序”操作时，Node 仅需在一瞬间完成一票整数数组的 `shuffle` 元素交换算法，对性能几若无感。

---

## 三、微观操作生命周期（时序流转范式）

当我们执行诸如**“播放某张新专辑/点击下一首”**时，架构如何精抛运转？

1. **(Vue端指控) 下发交互事件**
   前端通过无状态的 `WebSocket` (替代传统的难适配系统的 Unix Sockets) 发出简单的事件：
   `> {"cmd": "play_next"}`
2. **(Node端中介) 游标运算与提货**
   `playlistManager` 确认当前游标推进（`currentIndex++`）。
   从中抽取出了新一曲目的整数 ID——`101`。
   紧接着 Node 花费 0.1 毫秒使用此 ID 同步向 SQLite 索取物理真身：
   `SELECT path, title, artist, cover_filename FROM tracks WHERE id = 101`
3. **(核心下潜) 切歌与发兵**
   Node 获取了这首歌的真实物理路径，将其指派给 `ag_backend.node` 的 N-API 函数：`engine.play("E:\music\sample.flac")`。
4. **(异步反馈) 给 UI 呈现层套壳**
   与此同时，Node 将查询出来的曲面信息和重定向好的静态封面接口，发送给前端：
   `> {"type":"ui_update", "title":"...", "coverUrl":"127.0.0.1:8080/covers/101.jpg"}`
   Vue Store 被动接收，照图画瓢无脑改变 DOM。
5. **(闭环延续) 零拷贝 EOF 心跳检测**
   一曲放罢，基于底层的 C++ 并不会频繁触发回调打断 Node 事件循环，而是借用底层直接互通的 `SharedStatusBuffer`。
   Node 通过极高频（但无害）的 `setInterval` 切片监控这块内存，一旦发现 C++ 写的播放状态 `state == 5` (EOF 结束)，便立刻拉动第二步 `playlistManager.next()`，实现全自动循环链条。
