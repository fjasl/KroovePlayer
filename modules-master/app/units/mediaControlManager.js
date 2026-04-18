const os = require('os');
let Mpris = null;

// --- 跨平台库预加载 ---
if (os.platform() === 'linux') {
    try {
        Mpris = require('mpris-service');
    } catch (e) {
        console.warn('⚠️ [MediaControl] 无法加载 mpris-service，Linux 媒体控制将不可用。');
    }
}

class MediaControlManager {
    constructor(core) {
        this.core = core;
        this.player = null;   // Linux MPRIS 实例
        this.platform = os.platform();

        if (this.platform === 'linux' && Mpris) {
            this.initMpris();
        } else if (this.platform === 'win32') {
            console.warn('ℹ️ [MediaControl] Windows SMTC 目前已留白，不启用原生控制。');
        }
    }

    // ==========================================
    // --- Linux MPRIS 实现 ---
    // ==========================================
    initMpris() {
        try {
            this.player = new Mpris({
                name: 'KroovePlayer',
                identity: 'Kroove Music Player',
                supportedInterfaces: ['player']
            });

            console.log('✅ [MediaControl] Linux MPRIS 服务已启动');

            this.player.getPosition = () => Math.round(this.core.playback.timePos * 1e6);

            this.player.on('play', () => this.core.resume());
            this.player.on('pause', () => this.core.pause());
            this.player.on('playpause', () => {
                this.core.playback.isPaused ? this.core.resume() : this.core.pause();
            });
            this.player.on('next', () => this.core.next());
            this.player.on('previous', () => this.core.prev());
            this.player.on('position', (opts) => this.core.engine.seek(opts.position / 1e6, false));
        } catch (e) {
            console.error('❌ [MediaControl] MPRIS 初始化失败:', e);
        }
    }

    /**
     * 更新播放状态 (播放/暂停/停止)
     */
    updateStatus() {
        if (this.platform !== 'linux' || !this.player) return;

        const state = this.core.playback.state;
        const isPaused = this.core.playback.isPaused;
        
        let status = 'Stopped';
        if (state === 3) status = 'Playing';
        else if (state === 4 || isPaused) status = 'Paused';

        if (this.player.playbackStatus !== status) {
            this.player.playbackStatus = status;
            if (status === 'Playing') this.player.seeked(Math.round(this.core.playback.timePos * 1e6));
        }
    }

    /**
     * 更新歌曲元数据
     */
    updateMetadata(track) {
        if (!track || this.platform !== 'linux' || !this.player) return;

        this.player.metadata = {
            'mpris:trackid': this.player.objectPath('track/' + (track.id || '0')),
            'mpris:length': Math.round((track.duration || 0) * 1e6),
            'xesam:title': track.title || 'Unknown Title',
            'xesam:artist': [track.artist || 'Unknown Artist'],
            'xesam:album': track.album || 'Unknown Album',
            'mpris:artUrl': track.cover_path ? `file://${track.cover_path}` : ''
        };
    }

    /**
     * 同步播放进度
     */
    updatePosition() {
        if (this.player) {
            this.player.seeked(Math.round(this.core.playback.timePos * 1e6));
        }
    }
}

module.exports = MediaControlManager;
