#pragma once

#ifdef _WIN32
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#else
#include <pulse/simple.h>
#include <pulse/error.h>
#endif

#include <vector>
#include <atomic>
#include <thread>
#include <complex>

namespace visualizer {

/**
 * @class Visualizer
 * @brief 独立于播放核心的音频捕捉与频谱分析模块
 */
class Visualizer {
public:
    Visualizer();
    ~Visualizer();

    bool start(float* spectrumBuffer, int binCount);
    void stop();
    void setFrequency(int hz);

private:
    void captureLoop();
    void processFFT(const float* input, int count);

    std::atomic<bool> m_running{false};
    std::thread m_thread;
    float* m_spectrumTarget = nullptr;
    int m_binCount = 256;
    int m_intervalMs = 16; 

    std::vector<float> m_hannWindow;
    
#ifdef _WIN32
    IAudioCaptureClient* m_captureClient = nullptr;
    IAudioClient* m_audioClient = nullptr;
    WAVEFORMATEX* m_pwfx = nullptr;
#else
    pa_simple* m_pulseClient = nullptr;
#endif
};

} // namespace visualizer
