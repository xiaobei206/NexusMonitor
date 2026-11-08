# NexusMonitor 2.2.8 — Windows 构建与发布报告

**结果：** Release 和完整 Windows CI 均成功。  
**Workflow：** https://github.com/xiaobei206/NexusMonitor/actions/runs/42496538449  
**Release：** https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.8  
**基线提交：** cb28997c4305865aaf759a9adb733ad5601af9d1

## 发布制品

| 项目 | 结果 |
|---|---|
| 文件名 | NexusMonitor-2.2.8-Setup.exe |
| 大小 | 160,023,946 bytes |
| SHA-256 | 4324a9411b992bd9d148f7f0c405dddbe21e8dc608ebf7d33c6127b5e7abc485 |
| 安装包 | https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.8/NexusMonitor-2.2.8-Setup.exe |
| 校验文件 | https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.8/NexusMonitor-2.2.8-Setup.exe.sha256 |

以上大小和 SHA-256 来自已上传 Release asset 的 GitHub 元数据；构建中也成功生成并上传了独立的 .sha256 校验文件。

## 修改摘要

本版针对手动快进后循环数次出现 The element has no supported sources 的报告，加入活动曲目/source generation 防护、切曲时清理旧媒体源、seeked 后恢复播放，以及 repeat seek-resume 期间的播放意图保护；新增回归合同。

## CI 结果

Run #209 的所有必要步骤通过：版本一致性、主进程与音乐回归测试、Renderer TypeScript/Vite、原生 WASAPI、PawnIO 模块资源、.NET HardwareService、硬件/存储测试、NSIS 打包、SHA-256、GitHub Release 发布及 workflow artifact 上传。

- Run #207 曾因旧测试断言没有随 if 分支形态更新而失败；新增的快进/循环测试本身通过。
- Run #208 随后因继续提交防护修复而被 cancel-in-progress 取消。
- Run #209 是覆盖最终提交的最终成功验证。

## 验收范围与限制

CI 不等于目标 PC 的实际音频使用测试。用户仍需在真实曲库上测试快速拖动进度条、单曲循环、多曲列表循环、切歌、暂停恢复及 EQ / ReplayGain / WASAPI 组合。未宣称已经完成这些目标机实测。
