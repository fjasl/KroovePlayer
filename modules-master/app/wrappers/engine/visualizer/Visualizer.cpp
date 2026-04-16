#include "Visualizer.h"
#include <audioclientactivationparams.h>
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
    if (m_captureClient) { m_captureClient->Release(); m_captureClient = nullptr; }
    if (m_audioClient) { m_audioClient->Release(); m_audioClient = nullptr; }
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
        Sleep(m_intervalMs);
    }

    if (pEnumerator) pEnumerator->Release();
    if (pDevice) pDevice->Release();
    CoUninitialize();
}

} // namespace visualizer
