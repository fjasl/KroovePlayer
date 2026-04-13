#pragma once

#include "lyricer/LyricTypes.h"
#include "player/PlayerTypes.h"
#include <string>

namespace engine {

struct EngineStatus {
  // 单一数据源：指向模块内部实体
  const player::PlayerProperties *engine_player_properties = nullptr;
  const lyricer::LyricDocument *engine_lyric_document = nullptr;

  // Engine 层面的计算结果
  int line_index = -1;
  double line_progress = 0.0;

  int word_index = -1;        // 用户要求的字段
  double word_progress = 0.0; // 用户要求的字段
};

/**
 * @struct SharedEngineState
 * @brief 内存对齐的结构体，用于 Node.js 与 C++ 之间的“零拷贝”数据共享。
 * 此结构体通过 Napi::Buffer 直接映射到 JS 侧，JS 可以通过 DataView 或
 * TypedArray 极高频率地读取而无需经过 N-API 转换。
 */
#pragma pack(push, 8) // 恢复到标准的 8 字节对齐，这能确保 double 不被跨界拆分
struct SharedEngineState {
  // 播放器状态 (4 bytes, 对应 player::PlayerState)
  int playback_state;
  int padding0;          // 强制补齐 4 字节，使后面的 time_pos 处于 offset 8
  
  double time_pos;       // Offset: 8
  double duration;       // Offset: 16
  double volume;         // Offset: 24
  
  int is_paused;         // 改用 int 减少对齐麻烦 Offset: 32
  int is_muted;          // Offset: 36

  // 歌词同步状态
  int line_index;        // Offset: 40
  int padding1;          // 再次补齐

  double line_progress;  // Offset: 48
  int word_index;        // Offset: 56
  int padding2;          // 再次补齐
  double word_progress;  // Offset: 64
};
#pragma pack(pop)

} // namespace engine