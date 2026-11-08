# NexusMonitor 2.2.8 — 快进 / 循环期间音源生命周期修复交接

**源码版本：** 2.2.8  
**工作分支：** `main`  
**CI / 正式 Release：** 提交后待 GitHub Actions 实际验证，本文件目前不代表构建成功。

## 本版目标

用户报告：手动快进并等待循环数次后，出现“播放失败：The element has no supported sources”。

目前没有目标机运行日志，不能声称已在用户机器复现同一调用栈。源码检查发现，旧实现没有在切换曲目时同步暂停并清理旧媒体源；主进程的 seek/resume 指令也会直接针对媒体元素即时调用 play()，即使 Chromium 仍在 seek 或元素已经切换到空/旧 source。将这些路径收紧，避免把媒体源切换竞态误判为文件格式不支持。

## 修改内容

- 播放宿主记录当前曲目 ID、当前媒体 URL 与 source generation。过期的 track URL Promise、seeked 回调和播放请求不能覆盖当前曲目。
- 曲目变化时先使旧播放请求失效、暂停并卸载旧 src，再查询并加载新文件；切换期间不将旧 audio 的 paused 状态反写为正式播放状态。
- 所有 play() 调用先验证当前 track、src 与 currentSrc。空来源 / 旧曲目的播放请求直接忽略，不显示误导性的“不支持来源”错误。
- seek/resume 给曲尾留 50ms 安全余量，等 seeked 事件后再恢复播放，降低立即触发 ended 与重启交叠的风险。
- 错误事件必须属于当前曲目与来源才进入 MusicState，仍保留真正解码失败 / 不支持编码的提示。
- 新增音乐源码回归合同，保护 active-source guard、过期 source generation 与 seeked 重启路径。

## 约束

- 仍只有主 Renderer 中一个 HTMLAudioElement；HUD 和 USB 屏继续只发送控制命令。
- 不修改视频播放、WASAPI native backend、音频格式支持列表或输出端点路由。
- GitHub Actions 与类型构建通过不等于目标 PC 的真实音乐文件和声卡验收。实际循环、快速拖动进度条、单曲循环与列表循环仍需在 Windows 上验证。
