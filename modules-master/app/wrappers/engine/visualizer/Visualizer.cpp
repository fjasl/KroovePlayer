#include "Visualizer.h"
#ifdef _WIN32
#include <audioclientactivationparams.h>
#else
#include <unistd.h>
#include <cstdio>
#include <string>
#include <memory>
#endif
#include <math.h>
#include <algorithm>

#ifndef PI
#define PI 3.14159265358979323846
#endif

namespace visualizer {

Visualizer::Visualizer() {
    m_hannWindow.resize(512);
    for (int i = 0; i < 512; i++) {
        m_hannWindow[i] = 0.5f * (1.0f - cosf(2.0f * (float)PI * i / 511.0f));
    }
}

Visualizer::~Visualizer() {
    stop();
}

void Visualizer::setFrequency(int hz) {
    if (hz <= 0) hz = 60;
    m_intervalMs = 1000 / hz;
}

bool Visualizer::start(float* spectrumBuffer, int binCount) {
    if (m_running) return true;
    m_spectrumTarget = spectrumBuffer;
    m_binCount = binCount;
    m_running = true;
    m_thread = std::thread(&Visualizer::captureLoop, this);
    return true;
}

void Visualizer::stop() {
    m_running = false;
    if (m_thread.joinable()) m_thread.join();
#ifdef _WIN32
    if (m_captureClient) { m_captureClient->Release(); m_captureClient = nullptr; }
    if (m_audioClient) { m_audioClient->Release(); m_audioClient = nullptr; }
#else
    if (m_pulseClient) { pa_simple_free(m_pulseClient); m_pulseClient = nullptr; }
#endif
}

void Visualizer::processFFT(const float* input, int count) {
    if (!m_spectrumTarget || count < 512) return;

    std::complex<float> data[512];
    for (int i = 0; i < 512; i++) {
        float val = input[i];
        if (!std::isnan(val) && !std::isinf(val)) {
            data[i] = std::complex<float>(val * m_hannWindow[i], 0.0f);
        } else {
            data[i] = 0.0f;
        }
    }

    for (int i = 1, j = 0; i < 512; i++) {
        int bit = 512 >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) std::swap(data[i], data[j]);
    }

    for (int len = 2; len <= 512; len <<= 1) {
        float ang = 2.0f * (float)PI / len;
        std::complex<float> wlen(cosf(ang), -sinf(ang));
        for (int i = 0; i < 512; i += len) {
            std::complex<float> w(1, 0);
            for (int j = 0; j < len / 2; j++) {
                std::complex<float> u = data[i + j];
                std::complex<float> v = data[i + j + len / 2] * w;
                data[i + j] = u + v;
                data[i + j + len / 2] = u - v;
                w *= wlen;
            }
        }
    }

    // 1. 计算所有 Bin 的幅度，并寻找当前帧的最大值
    float frameMax = 0.0f;
    std::vector<float> magnitudes(m_binCount);
    
    for (int i = 0; i < m_binCount; i++) {
        // 计算复数模（幅度谱）
        float mag = std::abs(data[i]) / 256.0f;
        
        // 应用简单的频率加权：给人耳感知较弱的高频一点补偿
        // 这里的补偿非常轻微，不会改变 512 的基本结构
        float freqWeight = 1.0f + ((float)i / m_binCount) * 2.0f;
        mag *= freqWeight;

        magnitudes[i] = mag;
        if (mag > frameMax) frameMax = mag;
    }

    // 2. 自动增益控制 (AGC) - 核心准度来源
    // 追踪长期的最大振幅，动态调整增益
    m_smoothMax = m_smoothMax * 0.99f + (std::max)(frameMax, 0.01f) * 0.01f;
    // 调低目标强度：从 0.6 降至 0.22，让前端多边形缩放更克制
    float targetGain = 0.22f / m_smoothMax; 
    m_dynamicGain = m_dynamicGain * 0.95f + targetGain * 0.05f;
    
    // 限制增益范围，防止无声时底噪过大
    if (m_dynamicGain > 15.0f) m_dynamicGain = 15.0f;
    if (m_dynamicGain < 0.3f) m_dynamicGain = 0.3f;

    // 3. 应用增益、对数缩放和平滑处理
    for (int i = 0; i < m_binCount; i++) {
        float mag = magnitudes[i] * m_dynamicGain;
        
        // 调整对数缩放：减弱曲线斜率
        if (mag > 0.0f) {
            mag = log10f(1.0f + mag * 4.0f) * 0.8f; 
        }

        float current = m_spectrumTarget[i];
        
        // 改进的平滑逻辑：上升极快（捕捉瞬态），下降平滑（物理美感）
        if (mag > current) {
            m_spectrumTarget[i] = current * 0.4f + mag * 0.6f; // 更快的反应
        } else {
            m_spectrumTarget[i] = current * 0.85f + mag * 0.15f; // 更有物理感的下落
        }

        if (m_spectrumTarget[i] > 1.0f) m_spectrumTarget[i] = 1.0f;
        if (m_spectrumTarget[i] < 0.0f) m_spectrumTarget[i] = 0.0f;
    }
}

#ifndef _WIN32
// 辅助函数：获取 Linux 系统默认的监听设备名 (.monitor)
static std::string getDefaultMonitorDevice() {
    char buffer[128];
    std::string result = "";
    // 使用 popen 执行 pactl 命令
    FILE* pipe = popen("pactl get-default-sink 2>/dev/null", "r");
    if (!pipe) return "";
    if (fgets(buffer, sizeof(buffer), pipe) != NULL) {
        result = buffer;
        // 移除末尾的换行符
        size_t last = result.find_last_not_of(" \n\r\t");
        if (last != std::string::npos) {
            result = result.substr(0, last + 1);
        }
    }
    pclose(pipe);
    
    if (result.empty()) return "";
    return result + ".monitor";
}
#endif

void Visualizer::captureLoop() {
#ifdef _WIN32
    CoInitializeEx(NULL, COINIT_MULTITHREADED);

    IMMDeviceEnumerator* pEnumerator = nullptr;
    IMMDevice* pDevice = nullptr;
    CoCreateInstance(__uuidof(MMDeviceEnumerator), NULL, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&pEnumerator);
    if (!pEnumerator) return;

    pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
    if (!pDevice) { pEnumerator->Release(); return; }

    pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, NULL, (void**)&m_audioClient);
    if (!m_audioClient) { pDevice->Release(); pEnumerator->Release(); return; }

    m_audioClient->GetMixFormat(&m_pwfx);

    bool isFloat = false;
    if (m_pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
        WAVEFORMATEXTENSIBLE* pEx = (WAVEFORMATEXTENSIBLE*)m_pwfx;
        if (pEx->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT) isFloat = true;
    } else if (m_pwfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
        isFloat = true;
    }

    m_audioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK, 0, 0, m_pwfx, NULL);
    m_audioClient->GetService(__uuidof(IAudioCaptureClient), (void**)&m_captureClient);
    m_audioClient->Start();

    std::vector<float> pcmCollector;
    while (m_running) {
        UINT32 packetLength = 0;
        m_captureClient->GetNextPacketSize(&packetLength);

        while (packetLength > 0) {
            BYTE* pData;
            UINT32 numFramesAvailable;
            DWORD flags;
            m_captureClient->GetBuffer(&pData, &numFramesAvailable, &flags, NULL, NULL);

            if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT)) {
                for (UINT32 i = 0; i < numFramesAvailable; i++) {
                    float sample = 0.0f;
                    // 优化：合并所有声道，捕获更准确的能量
                    for (int ch = 0; ch < m_pwfx->nChannels; ch++) {
                        if (isFloat) {
                            sample += ((float*)pData)[i * m_pwfx->nChannels + ch];
                        } else {
                            short s = ((short*)pData)[i * m_pwfx->nChannels + ch];
                            sample += s / 32768.0f;
                        }
                    }
                    sample /= m_pwfx->nChannels;

                    pcmCollector.push_back(sample);
                    if (pcmCollector.size() >= 512) {
                        processFFT(pcmCollector.data(), 512);
                        pcmCollector.clear();
                    }
                }
            } else {
                // 如果是静默状态，推入 0 以保持平滑回落
                for (UINT32 i = 0; i < numFramesAvailable; i++) {
                    pcmCollector.push_back(0.0f);
                    if (pcmCollector.size() >= 512) {
                        processFFT(pcmCollector.data(), 512);
                        pcmCollector.clear();
                    }
                }
            }
            m_captureClient->ReleaseBuffer(numFramesAvailable);
            m_captureClient->GetNextPacketSize(&packetLength);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(m_intervalMs));
    }

    if (pEnumerator) pEnumerator->Release();
    if (pDevice) pDevice->Release();
    CoUninitialize();
#else
    // Linux Implementation - Optimized for Low Latency
    static const pa_sample_spec ss = {
        .format = PA_SAMPLE_FLOAT32LE,
        .rate = 48000, // 匹配系统采样率，减少重采样延迟
        .channels = 2
    };

    // 核心优化：显式请求低延迟缓冲区
    pa_buffer_attr attr;
    attr.maxlength = (uint32_t)-1;
    attr.tlength = (uint32_t)-1;
    attr.prebuf = (uint32_t)-1;
    attr.minreq = (uint32_t)-1;
    attr.fragsize = 512 * 2 * sizeof(float); // 强制小碎片读取

    // 自动检测监听设备
    std::string monitorName = getDefaultMonitorDevice();
    const char* devicePtr = monitorName.empty() ? NULL : monitorName.c_str();

    int error;
    m_pulseClient = pa_simple_new(NULL, "KrooveVisualizer", PA_STREAM_RECORD, 
                                  devicePtr, "Visualizer Capture", &ss, NULL, &attr, &error);

    if (!m_pulseClient) {
        fprintf(stderr, "❌ [Visualizer] PulseAudio pa_simple_new() 失败: %s (设备: %s)\n", 
                pa_strerror(error), devicePtr ? devicePtr : "default");
        return;
    }

    if (devicePtr) {
        fprintf(stdout, "✅ [Visualizer] PulseAudio 已启动 (自动捕获: %s)\n", devicePtr);
    } else {
        fprintf(stdout, "✅ [Visualizer] PulseAudio 已启动 (使用系统默认源)\n");
    }

    float buffer[512 * 2]; 
    std::vector<float> pcmCollector;

    while (m_running) {
        // pa_simple_read 是阻塞的，它会在这里等待音频硬件产生数据
        if (pa_simple_read(m_pulseClient, buffer, sizeof(buffer), &error) < 0) {
            fprintf(stderr, "pa_simple_read() failed: %s\n", pa_strerror(error));
            break;
        }

        for (int i = 0; i < 512; i++) {
            // 取左声道
            pcmCollector.push_back(buffer[i * 2]);
            if (pcmCollector.size() >= 512) {
                processFFT(pcmCollector.data(), 512);
                pcmCollector.clear();
            }
        }
        
        // 移除 Sleep！由 pa_simple_read 的阻塞机制自然控制采集节奏
    }
#endif
}

} // namespace visualizer
