#include "engine.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <cstring>
#ifdef _WIN32
#include <windows.h>
#endif

namespace engine {

Engine::Engine() {
  // 0. 内存清零，防止读到随机垃圾数据
  memset(&shared_state_, 0, sizeof(SharedEngineState));

  // 1. 地址缝合
  m_status.engine_player_properties = &m_player.m_properties;
  m_status.engine_lyric_document = &lrc_core_.doc;

  // 2. 注册核心监听
  m_player.setOnPropertiesChangedCallback(
      [this](const player::PlayerProperties &props) {
        handle_internal_update(props);
      });
}

Engine::~Engine() {}

bool Engine::engine_load(const std::string &songUrl,
                         const std::string &lrcUrl) {
  // 1. 自动从文件路径读取歌词内容
  std::string lrcContent = "";
  if (!lrcUrl.empty()) {
#ifdef _WIN32
    int len = MultiByteToWideChar(CP_UTF8, 0, lrcUrl.c_str(), -1, NULL, 0);
    std::wstring wstr(len, 0);
    MultiByteToWideChar(CP_UTF8, 0, lrcUrl.c_str(), -1, &wstr[0], len);
    std::ifstream file(wstr.c_str());
#else
    std::ifstream file(lrcUrl);
#endif
    if (file.is_open()) {
      std::stringstream buffer;
      buffer << file.rdbuf();
      lrcContent = buffer.str();
    }
  }

  if (lrcContent.empty()) {
    lrcContent = "[00:00.00] 纯音乐，请欣赏";
  }

  lyricer::LrcParser temp_parser;
  temp_parser.parse(lrcContent);

  {
    std::lock_guard<std::mutex> lock(status_mutex_);
    lrc_core_.doc = std::move(temp_parser.doc);

    // 重置同步状态
    m_status.line_index = -1;
    m_status.line_progress = 0.0;
    m_status.word_index = -1;
    m_status.word_progress = 0.0;
  }

  // 3. 启动音频加载
  m_player.load(songUrl);

  // 4. 启动频谱分析器（仅首次调用生效，后续由内部守卫跳过）
  m_visualizer.start(shared_state_.spectrum, 256);

  return true;
}

void Engine::handle_internal_update(const player::PlayerProperties &props) {
  bool significant_changed = false;
  lyricer::LyricQueryState queryResult;

  {
    std::lock_guard<std::mutex> lock(status_mutex_);

    // 将高频查询放入锁内：修复了“如果切歌（正在主线程删改 doc.lines）同时 mpv 异步线程在背后查歌词”所造成的跨线程段错误 (Segfault)！
    queryResult = lyricer::LyricQuery::query(lrc_core_.doc, props.timePos);

    // 1. 同步到共享内存结构体 (高频，静默)
    shared_state_.playback_state = static_cast<int>(props.state);
    shared_state_.time_pos = props.timePos;
    shared_state_.duration = props.duration;
    shared_state_.volume = props.volume;
    shared_state_.is_paused = props.isPaused ? 1 : 0;
    shared_state_.is_muted = props.isMuted ? 1 : 0;

    shared_state_.line_index = queryResult.currentLineIndex;
    shared_state_.line_progress = queryResult.lineProgress;
    shared_state_.word_index = queryResult.currentWordIndex;
    shared_state_.word_progress = queryResult.wordProgress;

    // 2. 检测低频“逻辑事件”：状态切换或歌词跳行
    if (props.state != m_last_player_state ||
        queryResult.currentLineIndex != m_last_line_index) {
      // 仅更新 status 镜像，供低频回调使用
      m_status.line_index = queryResult.currentLineIndex;
      m_status.word_index = queryResult.currentWordIndex;
      m_status.line_progress = queryResult.lineProgress;
      m_status.word_progress = queryResult.wordProgress;

      significant_changed = true;
    }
  }

  // 3. 分流通知 (逻辑事件独立，进度状态综合)
  if (props.state != m_last_player_state && on_state_change_) {
    std::cout << "State changed to: " << static_cast<int>(props.state)
              << std::endl;
    on_state_change_(props.state);
  }
  if (queryResult.currentLineIndex != m_last_line_index && on_line_change_) {
    on_line_change_(queryResult.currentLineIndex);
  }

  // 默认高频状态更新 (包含进度)
  if (on_status_update_) {
    on_status_update_(m_status);
  }

  // 更新上一状态缓存
  m_last_player_state = props.state;
  m_last_line_index = queryResult.currentLineIndex;
}

void Engine::set_on_status_update(
    std::function<void(const EngineStatus &)> cb) {
  on_status_update_ = cb;
}

void Engine::set_on_state_change(std::function<void(player::PlayerState)> cb) {
  on_state_change_ = cb;
}

void Engine::set_on_line_change(std::function<void(int)> cb) {
  on_line_change_ = cb;
}

void Engine::setVisualizerFrequency(int hz) {
  m_visualizer.setFrequency(hz);
}

void Engine::syncStatus(SharedEngineState *sharedState) {
  if (!sharedState) return;

  // 1. 同步播放状态
  auto props = m_player.getProperties();
  sharedState->playback_state = static_cast<int>(props.state);
  sharedState->time_pos = props.timePos;
  sharedState->duration = props.duration;
  sharedState->volume = props.volume;
  sharedState->is_paused = props.isPaused ? 1 : 0;
  sharedState->is_muted = props.isMuted ? 1 : 0;

  // 2. 同步歌词状态
  sharedState->line_index = m_status.line_index;
  sharedState->line_progress = m_status.line_progress;
  sharedState->word_index = m_status.word_index;
  sharedState->word_progress = m_status.word_progress;
}

void Engine::engine_play() { m_player.play(); }
void Engine::engine_pause() { m_player.pause(); }
void Engine::engine_stop() { m_player.stop(); }
void Engine::engine_seek(double seconds, bool relative) { m_player.seek(seconds, relative); }
void Engine::engine_setVolume(double volume) { m_player.setVolume(volume); }
void Engine::engine_setMute(bool mute) { m_player.setMute(mute); }

} // namespace engine
