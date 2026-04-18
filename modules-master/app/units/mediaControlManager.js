const os = require('os');
let Mpris = null;
let WinRT = null;

// --- 跨平台库预加载 ---
if (os.platform() === 'linux') {
    try {
        Mpris = require('mpris-service');
    } catch (e) {
        console.warn('⚠️ [MediaControl] 无法加载 mpris-service，Linux 媒体控制将不可用。');
    }
} else if (os.platform() === 'win32') {
    try {
        // 推荐安装: npm install @nodert-win11/windows.media.control
        WinRT = require('@nodert-win11/windows.media.control');
    } catch (e) {
        console.warn('⚠️ [MediaControl] 未检测到 NodeRT 库，Windows 媒体控制已禁用。');
    }
}

class MediaControlManager {
    constructor(core) {
        this.core = core;
        this.player = null;   // Linux MPRIS 实例
        this.smtc = null;     // Windows SMTC 实例
        this.platform = os.platform();

        if (this.platform === 'linux' && Mpris) {
            this.initMpris();
        } else if (this.platform === 'win32' && WinRT) {
            this.initWindowsSmtc();
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

    // ==========================================
    // --- Windows SMTC (NodeRT) 实现 ---
    // ==========================================
    initWindowsSmtc() {
        try {
            // 获取当前视图的媒体控制中心
            this.smtc = WinRT.SystemMediaTransportControls.getForCurrentView();
            
            // 启用系统控制按钮
            this.smtc.isPlayEnabled = true;
            this.smtc.isPauseEnabled = true;
            this.smtc.isNextEnabled = true;
            this.smtc.isPreviousEnabled = true;

            // 监听按钮点击事件
            this.smtc.on('buttonpressed', (sender, args) => {
                const Button = WinRT.SystemMediaTransportControlsButton;
                switch (args.button) {
                    case Button.play: this.core.resume(); break;
                    case Button.pause: this.core.pause(); break;
                    case Button.next: this.core.next(); break;
                    case Button.previous: this.core.prev(); break;
                }
            });

            console.log('✅ [MediaControl] Windows SMTC 服务已启动');
        } catch (e) {
            console.error('❌ [MediaControl] Windows SMTC 初始化失败:', e);
        }
    }

    /**
     * 更新播放状态 (播放/暂停/停止)
     */
    updateStatus() {
        const state = this.core.playback.state;
        const isPaused = this.core.playback.isPaused;
        
        let status = 'Stopped';
        if (state === 3) status = 'Playing';
        else if (state === 4 || isPaused) status = 'Paused';

        // Linux 更新
        if (this.player && this.player.playbackStatus !== status) {
            this.player.playbackStatus = status;
            if (status === 'Playing') this.player.seeked(Math.round(this.core.playback.timePos * 1e6));
        }

        // Windows 更新
        if (this.smtc) {
            const SmtcStatus = WinRT.MediaPlaybackStatus;
            this.smtc.playbackStatus = (status === 'Playing') ? SmtcStatus.playing : SmtcStatus.paused;
        }
    }

    /**
     * 更新歌曲元数据
     */
    updateMetadata(track) {
        if (!track) return;

        // Linux 更新
        if (this.player) {
            this.player.metadata = {
                'mpris:trackid': this.player.objectPath('track/' + (track.id || '0')),
                'mpris:length': Math.round((track.duration || 0) * 1e6),
                'xesam:title': track.title || 'Unknown Title',
                'xesam:artist': [track.artist || 'Unknown Artist'],
                'xesam:album': track.album || 'Unknown Album',
                'mpris:artUrl': track.cover_path ? `file://${track.cover_path}` : ''
            };
        }

        // Windows 更新
        if (this.smtc) {
            const updater = this.smtc.displayUpdater;
            updater.type = WinRT.MediaPlaybackType.music;
            updater.musicProperties.title = track.title || "Unknown Title";
            updater.musicProperties.artist = track.artist || "Unknown Artist";
            updater.musicProperties.albumTitle = track.album || "Unknown Album";
            
            // Windows 封面更新相对复杂，需要通过 StorageFile，此处优先同步文字信息
            updater.update();
        }
    }

    /**
     * 同步播放进度 (解决进度条跳动)
     */
    updatePosition() {
        if (this.player) {
            this.player.seeked(Math.round(this.core.playback.timePos * 1e6));
        }
        // Windows SMTC 会根据 playbackStatus 自动推算，通常不需要高频手动同步
    }
}

module.exports = MediaControlManager;
