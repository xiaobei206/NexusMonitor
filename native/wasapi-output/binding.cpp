#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propsys.h>
#include <ksmedia.h>
#include <node_api.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "propsys.lib")
#pragma comment(lib, "uuid.lib")

namespace {

template <typename T>
void Release(T*& value) {
  if (value != nullptr) {
    value->Release();
    value = nullptr;
  }
}

struct ComScope {
  HRESULT result;
  bool shouldUninitialize;
  ComScope() : result(CoInitializeEx(nullptr, COINIT_MULTITHREADED)),
               shouldUninitialize(SUCCEEDED(result)) {}
  ~ComScope() {
    if (shouldUninitialize) CoUninitialize();
  }
  bool usable() const { return SUCCEEDED(result) || result == RPC_E_CHANGED_MODE; }
};

std::wstring Utf8ToWide(const std::string& value) {
  if (value.empty()) return {};
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.c_str(),
                                       static_cast<int>(value.size()), nullptr, 0);
  if (size <= 0) return {};
  std::wstring result(static_cast<size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.c_str(),
                      static_cast<int>(value.size()), result.data(), size);
  return result;
}

std::string WideToUtf8(const wchar_t* value) {
  if (value == nullptr || *value == L'\0') return {};
  const int size = WideCharToMultiByte(CP_UTF8, 0, value, -1, nullptr, 0, nullptr, nullptr);
  if (size <= 1) return {};
  std::string result(static_cast<size_t>(size), '\0');
  WideCharToMultiByte(CP_UTF8, 0, value, -1, result.data(), size, nullptr, nullptr);
  result.resize(static_cast<size_t>(size - 1));
  return result;
}

std::string HresultMessage(const char* operation, HRESULT result) {
  char code[16] = {};
  sprintf_s(code, "0x%08lx", static_cast<unsigned long>(result));
  return std::string(operation) + " failed (" + code + ")";
}

enum class SampleFormat { S16, S24, S32, F32, Invalid };

SampleFormat ParseFormat(const std::string& value) {
  if (value == "s16") return SampleFormat::S16;
  if (value == "s24") return SampleFormat::S24;
  if (value == "s32") return SampleFormat::S32;
  if (value == "f32") return SampleFormat::F32;
  return SampleFormat::Invalid;
}

const char* FormatName(SampleFormat value) {
  switch (value) {
    case SampleFormat::S16: return "s16";
    case SampleFormat::S24: return "s24";
    case SampleFormat::S32: return "s32";
    case SampleFormat::F32: return "f32";
    default: return "unknown";
  }
}

uint32_t BytesPerSample(SampleFormat value) {
  switch (value) {
    case SampleFormat::S16: return 2;
    case SampleFormat::S24: return 3;
    case SampleFormat::S32:
    case SampleFormat::F32: return 4;
    default: return 0;
  }
}

WAVEFORMATEXTENSIBLE MakeWaveFormat(uint32_t sampleRate, SampleFormat format) {
  WAVEFORMATEXTENSIBLE value{};
  const uint16_t bits = format == SampleFormat::S16 ? 16 :
                        format == SampleFormat::S24 ? 24 : 32;
  value.Format.wFormatTag = WAVE_FORMAT_EXTENSIBLE;
  value.Format.nChannels = 2;
  value.Format.nSamplesPerSec = sampleRate;
  value.Format.wBitsPerSample = bits;
  value.Format.nBlockAlign = static_cast<WORD>(2 * BytesPerSample(format));
  value.Format.nAvgBytesPerSec = sampleRate * value.Format.nBlockAlign;
  value.Format.cbSize = sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX);
  value.Samples.wValidBitsPerSample = bits;
  value.dwChannelMask = SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT;
  value.SubFormat = format == SampleFormat::F32 ? KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
                                                 : KSDATAFORMAT_SUBTYPE_PCM;
  return value;
}

bool GetEnumerator(IMMDeviceEnumerator** output, std::string* error) {
  const HRESULT result = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                          __uuidof(IMMDeviceEnumerator),
                                          reinterpret_cast<void**>(output));
  if (FAILED(result)) {
    if (error) *error = HresultMessage("Create MMDeviceEnumerator", result);
    return false;
  }
  return true;
}

bool GetDevice(IMMDeviceEnumerator* enumerator, const std::string& id,
               IMMDevice** output, std::string* error) {
  HRESULT result = E_FAIL;
  if (id.empty()) {
    result = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, output);
  } else {
    const std::wstring wideId = Utf8ToWide(id);
    if (wideId.empty()) {
      if (error) *error = "Invalid UTF-8 Windows audio endpoint identifier.";
      return false;
    }
    result = enumerator->GetDevice(wideId.c_str(), output);
  }
  if (FAILED(result)) {
    if (error) *error = HresultMessage("Resolve audio endpoint", result);
    return false;
  }
  return true;
}

std::string GetFriendlyName(IMMDevice* device) {
  IPropertyStore* store = nullptr;
  if (FAILED(device->OpenPropertyStore(STGM_READ, &store))) return "Windows audio output";
  PROPVARIANT value;
  PropVariantInit(&value);
  std::string result = "Windows audio output";
  if (SUCCEEDED(store->GetValue(PKEY_Device_FriendlyName, &value)) && value.vt == VT_LPWSTR) {
    const std::string name = WideToUtf8(value.pwszVal);
    if (!name.empty()) result = name;
  }
  PropVariantClear(&value);
  Release(store);
  return result;
}

bool IsFormatSupported(IAudioClient* client, uint32_t sampleRate, SampleFormat format) {
  WAVEFORMATEXTENSIBLE wave = MakeWaveFormat(sampleRate, format);
  return client->IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE,
                                   reinterpret_cast<WAVEFORMATEX*>(&wave), nullptr) == S_OK;
}

napi_value JsString(napi_env env, const std::string& value) {
  napi_value result;
  napi_create_string_utf8(env, value.c_str(), value.size(), &result);
  return result;
}

napi_value JsNumber(napi_env env, double value) {
  napi_value result;
  napi_create_double(env, value, &result);
  return result;
}

napi_value JsBoolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

void SetString(napi_env env, napi_value object, const char* key, const std::string& value) {
  napi_set_named_property(env, object, key, JsString(env, value));
}
void SetNumber(napi_env env, napi_value object, const char* key, double value) {
  napi_set_named_property(env, object, key, JsNumber(env, value));
}
void SetBoolean(napi_env env, napi_value object, const char* key, bool value) {
  napi_set_named_property(env, object, key, JsBoolean(env, value));
}

void Throw(napi_env env, const std::string& message) {
  napi_throw_error(env, nullptr, message.c_str());
}

std::string GetStringProperty(napi_env env, napi_value object, const char* key,
                              const std::string& fallback = {}) {
  napi_value value;
  if (napi_get_named_property(env, object, key, &value) != napi_ok) return fallback;
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_string) return fallback;
  size_t length = 0;
  napi_get_value_string_utf8(env, value, nullptr, 0, &length);
  std::string result(length + 1, '\0');
  napi_get_value_string_utf8(env, value, result.data(), result.size(), &length);
  result.resize(length);
  return result;
}

uint32_t GetUintProperty(napi_env env, napi_value object, const char* key, uint32_t fallback) {
  napi_value value;
  if (napi_get_named_property(env, object, key, &value) != napi_ok) return fallback;
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_number) return fallback;
  double number = 0;
  if (napi_get_value_double(env, value, &number) != napi_ok || !std::isfinite(number) ||
      number < 1 || number > 768000) return fallback;
  return static_cast<uint32_t>(number);
}

class ByteRing {
 public:
  void Allocate(size_t capacity) {
    buffer_.assign(capacity, 0);
    readPosition_.store(0, std::memory_order_relaxed);
    writePosition_.store(0, std::memory_order_relaxed);
  }

  size_t Write(const uint8_t* source, size_t length) {
    if (buffer_.empty() || source == nullptr || length == 0) return 0;
    const uint64_t write = writePosition_.load(std::memory_order_relaxed);
    const uint64_t read = readPosition_.load(std::memory_order_acquire);
    const size_t used = static_cast<size_t>(write - read);
    const size_t available = used >= buffer_.size() ? 0 : buffer_.size() - used;
    const size_t accepted = std::min(length, available);
    const size_t offset = static_cast<size_t>(write % buffer_.size());
    const size_t first = std::min(accepted, buffer_.size() - offset);
    if (first) std::memcpy(buffer_.data() + offset, source, first);
    if (accepted > first) std::memcpy(buffer_.data(), source + first, accepted - first);
    writePosition_.store(write + accepted, std::memory_order_release);
    return accepted;
  }

  size_t Read(uint8_t* destination, size_t length) {
    if (buffer_.empty() || destination == nullptr || length == 0) return 0;
    const uint64_t read = readPosition_.load(std::memory_order_relaxed);
    const uint64_t write = writePosition_.load(std::memory_order_acquire);
    const size_t available = static_cast<size_t>(write - read);
    const size_t count = std::min(length, available);
    const size_t offset = static_cast<size_t>(read % buffer_.size());
    const size_t first = std::min(count, buffer_.size() - offset);
    if (first) std::memcpy(destination, buffer_.data() + offset, first);
    if (count > first) std::memcpy(destination + first, buffer_.data(), count - first);
    readPosition_.store(read + count, std::memory_order_release);
    return count;
  }

  void Clear() {
    const uint64_t write = writePosition_.load(std::memory_order_acquire);
    readPosition_.store(write, std::memory_order_release);
  }

  size_t Available() const {
    const uint64_t read = readPosition_.load(std::memory_order_acquire);
    const uint64_t write = writePosition_.load(std::memory_order_acquire);
    return static_cast<size_t>(write - read);
  }

 private:
  std::vector<uint8_t> buffer_;
  std::atomic<uint64_t> readPosition_{0};
  std::atomic<uint64_t> writePosition_{0};
};

struct Engine {
  std::mutex mutex;
  std::condition_variable readyCondition;
  std::thread worker;
  ByteRing ring;
  HANDLE audioEvent = nullptr;
  HANDLE controlEvent = nullptr;
  bool openReady = false;
  std::string openError;
  std::string deviceName;
  std::string runtimeError;
  std::string deviceId;
  uint32_t sampleRate = 48000;
  uint32_t bytesPerSample = 4;
  uint32_t bytesPerFrame = 8;
  SampleFormat format = SampleFormat::F32;
  std::atomic<bool> closing{false};
  std::atomic<bool> startRequested{false};
  std::atomic<bool> running{false};
  std::atomic<uint64_t> underruns{0};
  std::atomic<uint64_t> framesRendered{0};
  std::atomic<uint64_t> acceptedBytes{0};
};

Engine g_engine;

void SetOpenResult(Engine* engine, const std::string& error, const std::string& name) {
  {
    std::lock_guard<std::mutex> lock(engine->mutex);
    engine->openError = error;
    engine->deviceName = name;
    engine->openReady = true;
  }
  engine->readyCondition.notify_all();
}

void AudioWorker(Engine* engine) {
  ComScope com;
  if (!com.usable()) {
    SetOpenResult(engine, HresultMessage("CoInitializeEx", com.result), {});
    return;
  }

  IMMDeviceEnumerator* enumerator = nullptr;
  IMMDevice* device = nullptr;
  IAudioClient* audioClient = nullptr;
  IAudioRenderClient* renderClient = nullptr;
  std::string error;
  std::string deviceName;

  if (!GetEnumerator(&enumerator, &error) ||
      !GetDevice(enumerator, engine->deviceId, &device, &error)) {
    SetOpenResult(engine, error, {});
    Release(device);
    Release(enumerator);
    return;
  }
  deviceName = GetFriendlyName(device);
  HRESULT hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                                reinterpret_cast<void**>(&audioClient));
  if (FAILED(hr)) {
    SetOpenResult(engine, HresultMessage("Activate IAudioClient", hr), deviceName);
    Release(audioClient); Release(device); Release(enumerator);
    return;
  }

  REFERENCE_TIME defaultPeriod = 0, minimumPeriod = 0;
  hr = audioClient->GetDevicePeriod(&defaultPeriod, &minimumPeriod);
  if (FAILED(hr)) {
    SetOpenResult(engine, HresultMessage("GetDevicePeriod", hr), deviceName);
    Release(audioClient); Release(device); Release(enumerator);
    return;
  }
  REFERENCE_TIME period = minimumPeriod > 0 ? minimumPeriod : defaultPeriod;
  if (period <= 0) period = 100000;
  // WASAPI event-driven exclusive streams require buffer duration and
  // periodicity to match. If the endpoint needs alignment, the retry below
  // uses the exact aligned frame count returned by GetBufferSize().
  REFERENCE_TIME duration = period;
  WAVEFORMATEXTENSIBLE wave = MakeWaveFormat(engine->sampleRate, engine->format);
  const DWORD flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_NOPERSIST;
  hr = audioClient->Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE, flags, duration, period,
                               reinterpret_cast<WAVEFORMATEX*>(&wave), nullptr);
  if (hr == AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED) {
    UINT32 alignedFrames = 0;
    HRESULT sizeResult = audioClient->GetBufferSize(&alignedFrames);
    if (SUCCEEDED(sizeResult) && alignedFrames > 0) {
      duration = static_cast<REFERENCE_TIME>(
          (static_cast<uint64_t>(alignedFrames) * 10000000ull) / engine->sampleRate);
      audioClient->Release();
      audioClient = nullptr;
      hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                            reinterpret_cast<void**>(&audioClient));
      if (SUCCEEDED(hr)) {
        hr = audioClient->Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE, flags, duration, duration,
                                     reinterpret_cast<WAVEFORMATEX*>(&wave), nullptr);
      }
    }
  }
  if (FAILED(hr)) {
    SetOpenResult(engine, HresultMessage("IAudioClient::Initialize exclusive", hr), deviceName);
    Release(audioClient); Release(device); Release(enumerator);
    return;
  }
  hr = audioClient->SetEventHandle(engine->audioEvent);
  if (FAILED(hr)) {
    SetOpenResult(engine, HresultMessage("SetEventHandle", hr), deviceName);
    audioClient->Stop();
    Release(audioClient); Release(device); Release(enumerator);
    return;
  }
  UINT32 bufferFrames = 0;
  hr = audioClient->GetBufferSize(&bufferFrames);
  if (FAILED(hr) || bufferFrames == 0) {
    SetOpenResult(engine, FAILED(hr) ? HresultMessage("GetBufferSize", hr) : "WASAPI returned an empty buffer", deviceName);
    audioClient->Stop();
    Release(audioClient); Release(device); Release(enumerator);
    return;
  }
  hr = audioClient->GetService(__uuidof(IAudioRenderClient),
                               reinterpret_cast<void**>(&renderClient));
  if (FAILED(hr)) {
    SetOpenResult(engine, HresultMessage("GetService IAudioRenderClient", hr), deviceName);
    audioClient->Stop();
    Release(renderClient); Release(audioClient); Release(device); Release(enumerator);
    return;
  }

  SetOpenResult(engine, {}, deviceName);
  while (!engine->closing.load(std::memory_order_acquire)) {
    if (!engine->startRequested.load(std::memory_order_acquire)) {
      if (engine->running.load(std::memory_order_acquire)) {
        hr = audioClient->Stop();
        if (FAILED(hr)) {
          std::lock_guard<std::mutex> lock(engine->mutex);
          engine->runtimeError = HresultMessage("IAudioClient::Stop", hr);
          engine->running.store(false, std::memory_order_release);
          break;
        }
        engine->running.store(false, std::memory_order_release);
        // Discard pre-pause PCM so resume starts at the renderer's current position.
        engine->ring.Clear();
      }
      WaitForSingleObject(engine->controlEvent, 100);
      continue;
    }
    if (!engine->running.load(std::memory_order_acquire)) {
      hr = audioClient->Start();
      if (FAILED(hr)) {
        std::lock_guard<std::mutex> lock(engine->mutex);
        engine->runtimeError = HresultMessage("IAudioClient::Start", hr);
        engine->startRequested.store(false, std::memory_order_release);
        break;
      }
      engine->running.store(true, std::memory_order_release);
    }

    HANDLE handles[2] = {engine->controlEvent, engine->audioEvent};
    const DWORD wait = WaitForMultipleObjects(2, handles, FALSE, 1000);
    if (wait == WAIT_OBJECT_0) continue;
    if (wait != WAIT_OBJECT_0 + 1) continue;
    if (engine->closing.load(std::memory_order_acquire) ||
        !engine->startRequested.load(std::memory_order_acquire)) continue;

    UINT32 paddingFrames = 0;
    hr = audioClient->GetCurrentPadding(&paddingFrames);
    if (FAILED(hr)) {
      std::lock_guard<std::mutex> lock(engine->mutex);
      engine->runtimeError = HresultMessage("GetCurrentPadding", hr);
      engine->startRequested.store(false, std::memory_order_release);
      continue;
    }
    if (paddingFrames >= bufferFrames) continue;
    const UINT32 framesToWrite = bufferFrames - paddingFrames;
    BYTE* output = nullptr;
    hr = renderClient->GetBuffer(framesToWrite, &output);
    if (FAILED(hr) || output == nullptr) {
      std::lock_guard<std::mutex> lock(engine->mutex);
      engine->runtimeError = HresultMessage("IAudioRenderClient::GetBuffer", hr);
      engine->startRequested.store(false, std::memory_order_release);
      continue;
    }
    const size_t requested = static_cast<size_t>(framesToWrite) * engine->bytesPerFrame;
    const size_t read = engine->ring.Read(output, requested);
    if (read < requested) {
      std::memset(output + read, 0, requested - read);
      if (engine->framesRendered.load(std::memory_order_relaxed) > 0) {
        engine->underruns.fetch_add(1, std::memory_order_relaxed);
      }
    }
    renderClient->ReleaseBuffer(framesToWrite, 0);
    engine->framesRendered.fetch_add(framesToWrite, std::memory_order_relaxed);
  }

  if (engine->running.load(std::memory_order_acquire)) audioClient->Stop();
  engine->running.store(false, std::memory_order_release);
  Release(renderClient);
  Release(audioClient);
  Release(device);
  Release(enumerator);
}

void CloseEngine() {
  g_engine.closing.store(true, std::memory_order_release);
  if (g_engine.controlEvent) SetEvent(g_engine.controlEvent);
  if (g_engine.worker.joinable()) g_engine.worker.join();
  if (g_engine.audioEvent) { CloseHandle(g_engine.audioEvent); g_engine.audioEvent = nullptr; }
  if (g_engine.controlEvent) { CloseHandle(g_engine.controlEvent); g_engine.controlEvent = nullptr; }
  g_engine.ring.Clear();
  g_engine.openReady = false;
  g_engine.openError.clear();
  g_engine.runtimeError.clear();
  g_engine.deviceName.clear();
  g_engine.deviceId.clear();
  g_engine.closing.store(false, std::memory_order_release);
  g_engine.startRequested.store(false, std::memory_order_release);
  g_engine.running.store(false, std::memory_order_release);
  g_engine.underruns.store(0, std::memory_order_relaxed);
  g_engine.framesRendered.store(0, std::memory_order_relaxed);
  g_engine.acceptedBytes.store(0, std::memory_order_relaxed);
}

napi_value ListDevices(napi_env env, napi_callback_info info) {
  ComScope com;
  if (!com.usable()) { Throw(env, HresultMessage("CoInitializeEx", com.result)); return nullptr; }
  IMMDeviceEnumerator* enumerator = nullptr;
  std::string error;
  if (!GetEnumerator(&enumerator, &error)) { Throw(env, error); return nullptr; }
  IMMDeviceCollection* collection = nullptr;
  HRESULT hr = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection);
  if (FAILED(hr)) { Throw(env, HresultMessage("EnumAudioEndpoints", hr)); Release(enumerator); return nullptr; }

  IMMDevice* defaultDevice = nullptr;
  std::string defaultId;
  if (SUCCEEDED(enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &defaultDevice)) && defaultDevice) {
    LPWSTR id = nullptr;
    if (SUCCEEDED(defaultDevice->GetId(&id)) && id) { defaultId = WideToUtf8(id); CoTaskMemFree(id); }
  }
  Release(defaultDevice);

  UINT count = 0;
  collection->GetCount(&count);
  napi_value array;
  napi_create_array_with_length(env, count, &array);
  for (UINT index = 0; index < count; ++index) {
    IMMDevice* device = nullptr;
    if (FAILED(collection->Item(index, &device)) || !device) continue;
    LPWSTR id = nullptr;
    std::string idText;
    if (SUCCEEDED(device->GetId(&id)) && id) { idText = WideToUtf8(id); CoTaskMemFree(id); }
    napi_value item;
    napi_create_object(env, &item);
    SetString(env, item, "id", idText);
    SetString(env, item, "name", GetFriendlyName(device));
    SetBoolean(env, item, "isDefault", !defaultId.empty() && idText == defaultId);
    napi_set_element(env, array, index, item);
    Release(device);
  }
  Release(collection);
  Release(enumerator);
  return array;
}

napi_value ProbeDevice(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::string deviceId;
  if (argc > 0) {
    napi_valuetype type;
    if (napi_typeof(env, argv[0], &type) == napi_ok && type == napi_string) {
      size_t length = 0;
      napi_get_value_string_utf8(env, argv[0], nullptr, 0, &length);
      deviceId.resize(length + 1);
      napi_get_value_string_utf8(env, argv[0], deviceId.data(), deviceId.size(), &length);
      deviceId.resize(length);
    }
  }
  ComScope com;
  if (!com.usable()) { Throw(env, HresultMessage("CoInitializeEx", com.result)); return nullptr; }
  IMMDeviceEnumerator* enumerator = nullptr;
  std::string error;
  if (!GetEnumerator(&enumerator, &error)) { Throw(env, error); return nullptr; }
  IMMDevice* device = nullptr;
  if (!GetDevice(enumerator, deviceId, &device, &error)) { Throw(env, error); Release(enumerator); return nullptr; }
  IAudioClient* client = nullptr;
  HRESULT hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                                reinterpret_cast<void**>(&client));
  if (FAILED(hr)) {
    Throw(env, HresultMessage("Activate IAudioClient", hr));
    Release(device); Release(enumerator); return nullptr;
  }
  napi_value result, formats;
  napi_create_object(env, &result);
  napi_create_array(env, &formats);
  SetString(env, result, "name", GetFriendlyName(device));
  const uint32_t rates[] = {44100, 48000, 88200, 96000, 176400, 192000};
  const SampleFormat candidates[] = {SampleFormat::S16, SampleFormat::S24, SampleFormat::S32, SampleFormat::F32};
  uint32_t index = 0;
  for (uint32_t rate : rates) {
    for (SampleFormat format : candidates) {
      if (!IsFormatSupported(client, rate, format)) continue;
      napi_value item;
      napi_create_object(env, &item);
      SetString(env, item, "format", FormatName(format));
      SetNumber(env, item, "channels", 2);
      SetNumber(env, item, "sampleRate", rate);
      napi_set_element(env, formats, index++, item);
    }
  }
  napi_set_named_property(env, result, "formats", formats);
  Release(client); Release(device); Release(enumerator);
  return result;
}

napi_value Open(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) { Throw(env, "open(options) requires an options object"); return nullptr; }
  napi_valuetype type;
  napi_typeof(env, argv[0], &type);
  if (type != napi_object) { Throw(env, "open(options) requires an options object"); return nullptr; }
  const std::string deviceId = GetStringProperty(env, argv[0], "deviceId");
  const std::string formatName = GetStringProperty(env, argv[0], "format", "f32");
  const SampleFormat format = ParseFormat(formatName);
  const uint32_t rate = GetUintProperty(env, argv[0], "sampleRate", 48000);
  if (format == SampleFormat::Invalid) { Throw(env, "Unsupported WASAPI PCM format."); return nullptr; }
  CloseEngine();
  g_engine.deviceId = deviceId;
  g_engine.sampleRate = rate;
  g_engine.format = format;
  g_engine.bytesPerSample = BytesPerSample(format);
  g_engine.bytesPerFrame = g_engine.bytesPerSample * 2;
  const size_t capacity = std::max<size_t>(65536, static_cast<size_t>(rate) * g_engine.bytesPerFrame * 2);
  g_engine.ring.Allocate(capacity);
  g_engine.audioEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  g_engine.controlEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!g_engine.audioEvent || !g_engine.controlEvent) {
    CloseEngine();
    Throw(env, "CreateEvent for WASAPI failed.");
    return nullptr;
  }
  g_engine.openReady = false;
  g_engine.openError.clear();
  g_engine.runtimeError.clear();
  g_engine.closing.store(false);
  g_engine.startRequested.store(false);
  g_engine.running.store(false);
  try {
    g_engine.worker = std::thread(AudioWorker, &g_engine);
  } catch (const std::exception& error) {
    CloseEngine();
    Throw(env, std::string("Could not start WASAPI worker: ") + error.what());
    return nullptr;
  }
  // Opening the endpoint happens on the dedicated COM worker. Return
  // immediately so Electron's main process never waits on device activation.
  napi_value result;
  napi_create_object(env, &result);
  SetBoolean(env, result, "pending", true);
  SetString(env, result, "format", FormatName(format));
  SetNumber(env, result, "sampleRate", rate);
  SetNumber(env, result, "channels", 2);
  SetNumber(env, result, "bytesPerFrame", g_engine.bytesPerFrame);
  return result;
}

napi_value Start(napi_env env, napi_callback_info info) {
  if (!g_engine.worker.joinable()) { Throw(env, "No WASAPI endpoint is open."); return nullptr; }
  g_engine.startRequested.store(true, std::memory_order_release);
  SetEvent(g_engine.controlEvent);
  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

napi_value Stop(napi_env env, napi_callback_info info) {
  g_engine.startRequested.store(false, std::memory_order_release);
  if (g_engine.controlEvent) SetEvent(g_engine.controlEvent);
  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

float ReadFloat(const uint8_t* source) {
  float value = 0;
  std::memcpy(&value, source, sizeof(float));
  if (!std::isfinite(value)) return 0.0f;
  return std::max(-1.0f, std::min(1.0f, value));
}

napi_value Write(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) { Throw(env, "write(buffer) requires a Buffer of interleaved float32 PCM."); return nullptr; }
  void* data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, argv[0], &data, &length) != napi_ok || data == nullptr) {
    Throw(env, "write(buffer) requires a Node Buffer.");
    return nullptr;
  }
  if (length % 8 != 0) { Throw(env, "float32 stereo PCM buffer must be frame-aligned."); return nullptr; }
  const auto* input = static_cast<const uint8_t*>(data);
  std::vector<uint8_t> converted;
  const size_t frames = length / 8;
  if (g_engine.format == SampleFormat::F32) {
    converted.assign(input, input + length);
  } else {
    converted.resize(frames * g_engine.bytesPerFrame);
    const size_t samples = frames * 2;
    for (size_t index = 0; index < samples; ++index) {
      const float value = ReadFloat(input + index * sizeof(float));
      uint8_t* destination = converted.data() + index * g_engine.bytesPerSample;
      if (g_engine.format == SampleFormat::S16) {
        const int32_t sample = value <= -1.0f ? -32768 : static_cast<int32_t>(std::lrint(value * 32767.0f));
        const int16_t packed = static_cast<int16_t>(sample);
        std::memcpy(destination, &packed, sizeof(packed));
      } else if (g_engine.format == SampleFormat::S24) {
        const int32_t sample = value <= -1.0f ? -8388608 : static_cast<int32_t>(std::llround(value * 8388607.0));
        destination[0] = static_cast<uint8_t>(sample & 0xff);
        destination[1] = static_cast<uint8_t>((sample >> 8) & 0xff);
        destination[2] = static_cast<uint8_t>((sample >> 16) & 0xff);
      } else if (g_engine.format == SampleFormat::S32) {
        const int64_t wide = value <= -1.0f ? -2147483648ll : static_cast<int64_t>(std::llround(static_cast<double>(value) * 2147483647.0));
        const int32_t packed = static_cast<int32_t>(wide);
        std::memcpy(destination, &packed, sizeof(packed));
      }
    }
  }
  const size_t accepted = g_engine.ring.Write(converted.data(), converted.size());
  g_engine.acceptedBytes.fetch_add(accepted, std::memory_order_relaxed);
  napi_value result;
  napi_create_double(env, static_cast<double>(accepted / g_engine.bytesPerFrame), &result);
  return result;
}

napi_value Clear(napi_env env, napi_callback_info info) {
  g_engine.ring.Clear();
  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

napi_value Stats(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_object(env, &result);
  std::string openError, deviceName;
  bool ready = false;
  {
    std::lock_guard<std::mutex> lock(g_engine.mutex);
    ready = g_engine.openReady;
    openError = g_engine.openError;
    deviceName = g_engine.deviceName;
  }
  SetBoolean(env, result, "open", g_engine.worker.joinable());
  SetBoolean(env, result, "ready", ready);
  SetString(env, result, "openError", openError);
  SetString(env, result, "deviceName", deviceName);
  SetString(env, result, "format", FormatName(g_engine.format));
  SetNumber(env, result, "sampleRate", g_engine.sampleRate);
  SetBoolean(env, result, "running", g_engine.running.load(std::memory_order_acquire));
  SetNumber(env, result, "bufferedBytes", static_cast<double>(g_engine.ring.Available()));
  SetNumber(env, result, "underruns", static_cast<double>(g_engine.underruns.load()));
  SetNumber(env, result, "framesRendered", static_cast<double>(g_engine.framesRendered.load()));
  SetNumber(env, result, "acceptedBytes", static_cast<double>(g_engine.acceptedBytes.load()));
  std::string error;
  {
    std::lock_guard<std::mutex> lock(g_engine.mutex);
    error = g_engine.runtimeError;
  }
  SetString(env, result, "error", error);
  return result;
}

napi_value Close(napi_env env, napi_callback_info info) {
  CloseEngine();
  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"listDevices", nullptr, ListDevices, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"probeDevice", nullptr, ProbeDevice, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"open", nullptr, Open, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stop", nullptr, Stop, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"write", nullptr, Write, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"clear", nullptr, Clear, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stats", nullptr, Stats, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"close", nullptr, Close, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
