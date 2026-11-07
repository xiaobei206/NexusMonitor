# NexusMonitor — 新接手 GPT 请先看这里

**当前工作版本：2.2.2。唯一开发基线：GitHub `main`。**

用户偏好个人项目直接在 `main` 开发。不要自行建立功能分支或 PR，除非用户明确提出。每次接手都重新读取 main HEAD、VERSION、Actions 和 Release，不能依赖旧对话状态。

## 本轮 2.2.2 目标

1. 修正 WASAPI 独占输出探测：同时探测 mono/stereo PCM 和传统 `WAVEFORMATEX` / `WAVEFORMATEXTENSIBLE`。
2. 立体声组合优先；设备只接受单声道时，将 Renderer stereo Float32 PCM 在 native 输出边界下混为 mono。
3. 统一声道协商、WASAPI format、channel mask、block alignment、native ring frame length 和 PCM packing。
4. 无兼容格式时显示探测组合数、格式结构命中数、Windows shared mix format 和 HRESULT，避免错误声称设备完全不支持。
5. USB 五寸副屏 `music-only` 模式动作按钮简化为 **「应用模式」**，其它模式继续显示「启动副屏」。

## 分支与提交规则

- 直接开发 `main`，不创建 feature branch，不建 PR。
- 正式应用行为修改递增版本号，2.2.2 是当前目标；禁止 FIX/FIX1，不覆盖已发布版本。
- 文档先行；每次大改补回归测试；每次 push 后查看对应 Windows CI。
- 如果 CI 自动发布 installer / SHA / GitHub Release，必须以实际 Release 资产为准，不能虚构 hash。
- 用户明确要求直改 main；不要重新引入分支流程。

## 2.2.2 关键源码

| 路径 | 用途 |
|---|---|
| `native/wasapi-output/binding.cpp` | WASAPI 设备格式探测、独占初始化、native PCM ring、单声道下混 |
| `src/main/music-exclusive-format.ts` | 设备声道 / 采样率 / 位深协商 |
| `src/main/music-exclusive-output.ts` | 主进程探测诊断、打开参数、状态与 IPC |
| `src/renderer/music-player.tsx` | Renderer stereo PCM tap 与 WASAPI 状态 |
| `src/renderer/App.tsx` | USB 副屏动作按钮和版本显示 |
| `tests/music-exclusive-format.test.cjs` | mono/stereo format chooser 回归 |
| `tests/music-wasapi-mono-source.test.cjs` | native WASAPI 探测 / downmix 结构回归 |
| `tests/usb-display-page.test.cjs` | music-only 按钮短文案回归 |

## 2.2.2 能力边界

- Stereo endpoint 仍然优先；只有探测不到可用 stereo 组合时才选择 mono。
- mono endpoint 的 stereo-to-mono 下混意味着声道数发生变化，bit-perfect 必须为 false。
- 当前 Renderer 输入仍为 WebAudio stereo Float32；此版本不实现 native decoder-to-device，也不宣称 bit-perfect。
- `WAVEFORMATEX` / `WAVEFORMATEXTENSIBLE` 的 `IsFormatSupported` 和实际 `Initialize` 均要处理，不能仅在探测阶段加候选、打开时仍只用一种格式。
- Hosted CI 不代替用户电脑实测 USB P4 喇叭真实出声、系统其它程序音频隔离、热插拔、长期 underrun。
- 尚未包含 Gapless/Crossfade 双 Deck。
- music-only 的按钮文字是 `应用模式`；状态说明可以继续明确 Windows 壁纸不被覆盖、Music Service 继续运行。

## Windows 验证命令

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
node .\scripts\validate-release-version.cjs
npm.cmd run test:main
npm.cmd run build:renderer
npm.cmd run build:wasapi
dotnet build .\HardwareService\HardwareService.csproj -c Release
npm.cmd run test:storage
```

发布入口为 `NexusMonitor-2.2.2-BUILD-RELEASE.cjs`。PowerShell 使用 `npm.cmd` / `npx.cmd`，不要把 ExecutionPolicy 修改当默认方案。
