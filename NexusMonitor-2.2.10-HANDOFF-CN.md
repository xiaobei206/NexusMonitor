# NexusMonitor 2.2.10 — USB 视频独立音频交接

**基线：** NexusMonitor 2.2.9 正式 Release  
**工作基线：** GitHub `main`  
**状态：** 此版本由 Windows CI 负责打包和创建 Release；最终运行号与安装包校验值须核对实际 Actions / Release 资产。

## 用户确认的行为

- 视频音量、静音和音频输出设备均独立于 Music Service。
- 视频不再被强制静音；视频与曲库音乐可以同时播放。
- 两路声音重叠时，显示非阻塞提示；视频先开始时询问是否暂停音乐，音乐后开始时询问是否静音视频。
- “继续同时播放/保留两路声音”只关闭提示；忽略提示或提示自动消失均不改变播放状态。
- 只有用户点击相应动作，才暂停音乐或静音视频；不会自动降音量、暂停视频或重设输出设备。
- 选择的非默认设备无法应用时，在副屏显示错误并暂时静音视频，防止音频落到未经确认的系统默认设备。

## 实现位置

- `src/shared/types.ts`：独立视频音频设置字段。
- `src/renderer/App.tsx`：USB 5 寸副屏设置页、视频输出 Renderer 的音量/静音/输出设备绑定、媒体播放与并行音源提醒。
- `src/renderer/styles.css`：视频音频设置与提醒层样式。
- `tests/usb-display-video-audio.test.cjs`：源合同回归测试。
- `NexusMonitor-DEVELOPMENT-LOG-CN.md`：跨版本累计开发日志。
- `NexusMonitor-2.2.10-BUILD-RELEASE.cjs`：正式构建入口。

## 构建验证

Windows clone 根目录执行：

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
node .\scripts\validate-release-version.cjs
npm.cmd run test:main
npm.cmd run build:renderer
npm.cmd run build:wasapi
dotnet build .\HardwareService\HardwareService.csproj -c Release
npm.cmd run test:storage
```

正式安装包由 `.github/workflows/windows-ci.yml` 在 Windows Runner 上构建并发布。CI 成功不等于目标 PC 音频实测通过。

## 目标机验收清单

1. 选择有音轨的本地 MP4/M4V/WebM，验证五寸屏自动播放、有声音、循环播放、暂停和进度控制。
2. 在主界面将视频音量调至 10%、音乐调至 70%，确认两者互不改变；视频静音不会暂停音乐。
3. 分别选择系统默认设备、五寸屏扬声器和耳机；拔掉所选设备时确认视频不会悄悄从另一输出设备出声。
4. 视频播放时启动音乐，确认提醒非阻塞；忽略/等待提醒后两路继续；选择“静音视频”只影响视频。
5. 音乐播放时进入视频模式，确认提示提供“暂停音乐”；忽略后两路继续。
6. 在视频原生控制条调节音量/静音，再回设置页确认值同步。
7. 关闭主面板到托盘、恢复主面板、切换六种副屏模式与重启应用，检查原有音乐服务及显示生命周期没有回归。

## 发布记录

- Windows Actions / GitHub Release：待实际流水线运行后填写。
- 安装包大小与 SHA-256：以真实 Release 资产为准。
- 5 寸屏扬声器、耳机和设备热插拔：待目标 PC 实测。
