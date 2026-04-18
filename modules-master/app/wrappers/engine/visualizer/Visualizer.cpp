#include "Visualizer.h"
#ifdef _WIN32
#include <audioclientactivationparams.h>
#else
#include <unistd.h>
#include <cstdio>
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

    static std::complex<float> data[512];
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

    for (int i = 0; i < m_binCount; i++) {
        float mag = std::abs(data[i]) / 256.0f; 
        float current = m_spectrumTarget[i];
        
        // 恢复最基础的平滑，防止视觉闪烁
        if (mag > current) m_spectrumTarget[i] = current * 0.7f + mag * 0.3f;
        else m_spectrumTarget[i] = current * 0.95f + mag * 0.05f;

        if (m_spectrumTarget[i] > 1.0f) m_spectrumTarget[i] = 1.0f;
    }
}

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
                    if (isFloat) {
                        sample = ((float*)pData)[i * m_pwfx->nChannels];
                    } else {
                        short s = ((short*)pData)[i * m_pwfx->nChannels];
                        sample = s / 32768.0f;
                    }

                    pcmCollector.push_back(sample);
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

    int error;
    m_pulseClient = pa_simple_new(NULL, "KrooveVisualizer", PA_STREAM_RECORD, 
                                  NULL, "Visualizer Capture", &ss, NULL, &attr, &error);

    if (!m_pulseClient) {
        fprintf(stderr, "❌ [Visualizer] PulseAudio pa_simple_new() 失败: %s\n", pa_strerror(error));
        return;
    }

    fprintf(stdout, "✅ [Visualizer] PulseAudio 已启动 (低延迟模式, 48kHz)\n");

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
