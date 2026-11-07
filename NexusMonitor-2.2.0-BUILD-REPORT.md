# NexusMonitor 2.2.0 — 开发与构建报告

**版本：** 2.2.0  
**状态：** GitHub Draft PR #1；最新 Windows CI 已通过；尚未合并 `main`，尚未发布正式 Release。  
**基线：** main / 2.1.8，起始提交 `5105bbaa88f68e1ff1a9b15210c8beca30ab6773`。  
**分支：** `feature/2.2.0-music-and-window-lifecycle`。  
**功能代码修正验证提交（Run #23）：** `e45c93bd4e8e2faf17270fdbcda382a8f66e9086`。  
**最新完整 PR 验证（Run #24）：** PR 文档同步 HEAD `d6a6f6ab9ac996f0d74d688d155d07b14a2ada6c`，全部 CI 步骤成功。

## 本轮实现内容

1. 主窗口关闭时隐藏到系统托盘并移除任务栏项；托盘打开/双击恢复主窗口，托盘退出执行真正退出。主 Renderer 保持存活。
2. Electron 启动阶段按持久化的显示器 ID 恢复 USB 5 英寸输出窗，早于 HardwareService 初始化；显示器尚未枚举时等待拓扑变化后重试。
3. 新增统一 MP3 音乐服务，主进程保存曲库和歌单，主 Renderer 持有唯一音频元素；Widget / USB 输出窗口只作为共享控制端。
4. 主界面新增音乐库页与底部播放 Dock；支持 MP3 多选导入、文件夹扫描（每次最多 5000 首）、搜索、歌单创建/重命名/删除、歌曲添加/移除/上下排序，播放/暂停、上一首/下一首、进度、应用音量、随机及单曲/列表循环。
5. 主界面所有页面共享播放器 Dock；独立 USB 五寸输出窗口的 monitor/static/GIF/weather-clock 模式显示迷你控制层，video 模式不显示。
6. 竖向 HUD 仅在天气模块上方插入迷你播放器。天气、时间（保持底部）、其它监控模块不重排、不重构；横向 HUD 与 detail-only 详情窗不加播放器。
7. 启动恢复曲目、歌单、进度、音量和播放模式，但播放状态强制暂停；不自动发声。音乐文件只记录原路径，不复制或删除原文件。
8. 壁纸静态/GIF 模式原有背景音在音乐库选择歌曲后让位，避免双路播放；视频输出保持独立。

## 变更文件组

- Main / IPC：`src/main/index.ts`、`src/preload/index.ts`。
- Shared / Renderer：`src/shared/types.ts`、`src/renderer/App.tsx`、`src/renderer/music-player.tsx`、`src/renderer/music-player.css`、`src/renderer/main.tsx`、`src/renderer/vite-env.d.ts`。
- Tests：`tests/music-player-source.test.cjs`。
- Version：`VERSION`、`package.json`、`package-lock.json`、HardwareService project/API/snapshot version、`NexusMonitor-2.2.0-BUILD-RELEASE.cjs`。
- Docs / handoff：本文件、`NexusMonitor-2.2.0-HANDOFF-CN.md`、`NexusMonitor-DEVELOPMENT-LOG-CN.md`、`START-HERE-NEXT-GPT.md`、`README.md` 及 USB/HUD/版本说明专题。

## 自动化验证

| 检查 | 结果 |
|---|---|
| GitHub Windows CI Run #23（功能代码修正） | **通过** |
| 14 项版本一致性门禁 | **通过** |
| `npm.cmd run test:main` | **通过，188/188** |
| `npm.cmd run build:renderer` | **通过** |
| PawnIO 官方资源校验 | **通过** |
| .NET 10 Release build | **通过，0 warning / 0 error** |
| `npm.cmd run test:storage` | **通过** |
| NSIS 安装包 / Release 发布 | PR 阶段跳过，未打包、未发布 |

CI：<https://github.com/xiaobei206/NexusMonitor/actions/runs/42334294679>  
Run #23 功能代码 HEAD：`e45c93bd4e8e2faf17270fdbcda382a8f66e9086`。  
Run #24 文档同步 HEAD：`d6a6f6ab9ac996f0d74d688d155d07b14a2ada6c`；[查看运行记录](https://github.com/xiaobei206/NexusMonitor/actions/runs/42334605208)。

### 本轮交接修正

- USB 五寸屏设置页不再把“第一个外接显示器”自动写成目标。保存的显示器 ID 暂时不可用时提示重新选择，避免将其他外接屏误认为五寸屏。
- 主界面 Dock 在所有主应用页面持续显示；只有独立 USB 视频输出页排除音乐控制。相应旧断言已更新为正确的输出边界测试。
- 两项修正均已进入 Run #23 并通过回归测试。

## 尚未完成的实机验收

- 五寸 USB 屏冷启动时及时显示、USB 驱动枚举延迟、热插拔重连、负坐标/混合 DPI/分辨率变化。**首次使用必须由用户在设置页确认目标显示器；不会猜测五寸屏。**
- 竖向 HUD 玩家弹卡交互、按钮触摸目标、长标题截断、窄屏布局和不影响天气/时间/其他模块。
- 主窗口关闭至托盘后播放不中断；重新打开；单曲循环/列表循环/随机边界；系统睡眠恢复；音量实际输出。
- USB monitor / static / GIF / weather-clock 控件显示，video 页不出现播放器；壁纸原有背景音与 Music Service 不发生双响。
- COM3 Turing 长时间刷新与原有功能无回归。

Hosted CI 只能验证 Windows Runner 上的软件构建和自动测试，不代表以上目标 PC / USB 屏 /扬声器的实机验收通过。
