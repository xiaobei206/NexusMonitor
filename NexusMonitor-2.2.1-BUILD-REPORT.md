# NexusMonitor 2.2.1 — 构建与验收报告

**报告状态：开发中 / 未发布。**  
**稳定基线：** main / 2.2.0。  
**开发分支：** feature/2.2.1-music-platform。  
**Pull Request：** [#2](https://github.com/xiaobei206/NexusMonitor/pull/2)。  
**报告更新时间：** 2026-11-07。

## 已验证的 Windows Hosted CI

### Run #162 — 成功

[GitHub Actions Run #162](https://github.com/xiaobei206/NexusMonitor/actions/runs/42353103480)

- 版本一致性检查：14/14。
- Node 主进程 / 回归测试：224/224。
- Renderer TypeScript 检查与 Vite production build：通过。
- Windows N-API WASAPI addon：通过；实际生成 native/wasapi-output/build/Release/nexus_wasapi.node。
- 编译环境：Node 24.22.2、node-gyp 13.1.0、Python 3.15.2、Visual Studio 2026 18.11。
- PawnIO 官方资源校验：通过。
- HardwareService .NET Release：通过。
- Hardware / Storage tests：通过。
- PR 工作流按设计跳过 NSIS、SHA 与 GitHub Release 发布。

Run #162 的源码 HEAD 早于随后一次性旧曲库元数据补齐提交，因此该 Run 不验证该迁移。

## 当前代码范围

统一 Music Service、歌曲/专辑/艺术家/流派/文件夹/歌单、本地元数据和封面、M3U/M3U8、本地 LRC、十段 EQ、ReplayGain、睡眠定时、Windows 普通输出 endpoint、六种 USB 副屏模式、music-only 桌面壁纸模式，以及 WASAPI Exclusive native PCM 输出路径已经写入开发分支。

WASAPI 当前数据路径为 Chromium/WebAudio decode → stereo Float32 PCM → AudioWorklet → main-process IPC → native WASAPI ring buffer。当前明确标记 bitPerfect: false；设备格式匹配只表示候选条件，绝不宣称 bit-perfect。

## 当前最新验证状态

- 当前分支 HEAD（报告生成时）：15c953f0183b51c52c6ac3e20b4a94fc86827515。
- 最新 CI：Run #169，当前排队 / 执行中；需重新读取 Actions 最终结论。
- Run #162 之后新增：2.2.0 旧曲库记录一次性补齐标签/封面并写回 JSON；只有缺少新字段时才重新读取原文件。该迁移必须由当前最新 CI 验证。

## 尚未发布 / 尚未完成

- 2.2.1 尚未合入 main，尚无安装包、Release、SHA-256 sidecar；不得使用历史版本的哈希冒充。
- 目标 Windows PC 尚未验证五寸屏扬声器实际出声、endpoint 热拔插、独占期间其他应用声音、长时间 underrun、六种 USB 模式与真实格式播放。
- 尚未完成 Gapless / Crossfade 双 Deck 与真正 decoder-to-device bit-perfect 路径。
- 导入白名单不等于每一种具体编码已验证可播放。

正式 Release 应在最新 PR CI 全绿并合入 main 后，由 main 的 Windows workflow 构建 NSIS installer、生成 SHA-256 并发布；届时在本报告补入 installer 文件名、大小、SHA-256、Release URL 和最终 Actions run。
