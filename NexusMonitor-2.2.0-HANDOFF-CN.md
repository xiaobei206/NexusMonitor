# NexusMonitor 2.2.0 — 当前开发交接说明

**状态：** 2.2.0 开发分支；尚未合并到 `main`，尚未发布安装包。  
**基线：** `main` 的 2.1.8 文档同步提交 `5105bbaa88f68e1ff1a9b15210c8beca30ab6773`。  
**开发分支：** `feature/2.2.0-music-and-window-lifecycle`。  
**当前版本真值：** 根目录 `VERSION`，必须每次重新读取 GitHub 当前分支 HEAD 和 Actions。

## 2.2.0 本轮目标和实现边界

### 1. 系统托盘生命周期

- 主窗口 X/关闭操作只隐藏窗口，并调用 `setSkipTaskbar(true)`，任务栏不再保留主窗口图标。
- 系统托盘提供“打开主面板”“显示悬浮导航”“退出 NexusMonitor”；双击托盘恢复主面板。
- 真正退出通过托盘“退出 NexusMonitor”；隐藏主窗口不销毁 Renderer。
- 主 Renderer 因此继续承载单一音频引擎和原有常驻 Turing Canvas/帧刷新逻辑。托盘退出时才真正清理服务与窗口。
- 实机必须验证 Windows 任务栏重建、通知区域图标、再次打开和退出行为。

### 2. USB 五寸副屏启动恢复

- Electron 启动时先加载本地设置，再按保存的 `usbDisplayDisplayId` 创建输出窗；不等待 HardwareService 完成。
- 只恢复用户保存的显示器 ID，不盲目把任何非主屏认作五寸屏。
- 若 ID 对应显示器暂未枚举，保留待恢复状态；收到 display-added / topology change 后再尝试。
- 显示器移除时关闭输出窗并等待同一 ID 重新出现。用户手动关闭副屏会取消自动恢复待命。
- 现有窗口 bounds/DPI/负坐标计算继续复用 `usb-display-window.ts`。
- 显示内容仍由设置里的 `usbDisplayMode` 恢复。首次使用需在「设备输出 → USB 5 寸副屏」确认目标屏并启动一次，使目标 ID 留存。

### 3. 全局本地 MP3 播放器

- 播放状态和歌单由 Electron 主进程维护，文件路径/歌单保存在 `%APPDATA%\\NexusMonitor\\music-library.json`；不复制原始 MP3。
- 唯一 HTMLAudioElement 位于长期存活的主 Renderer；HUD、USB 输出窗只发送控制命令和订阅状态，不各自创建音频引擎。
- 启动恢复当前歌曲、进度、音量、循环和随机设置，但 `isPlaying` 每次启动强制为 false，不自动发声。
- 第一阶段仅接入 MP3：多选导入、文件夹扫描（最多 5000 首）、搜索、歌单创建/重命名/删除、向歌单添加/移除歌曲、歌单内上下排序、播放队列、播放/暂停、前后切歌、进度、独立音量、随机、关闭/列表/单曲循环。
- 删除音乐库记录或从歌单移除不会删除用户原始音频文件。路径不存在会提示文件缺失。
- 主界面音乐库有完整的歌单/歌曲页面和底部控制条；所有主界面非视频页面共享这条控制条。
- 竖向 HUD 仅在现有天气块之前插入迷你播放器；天气、时钟、CPU/GPU/内存/磁盘/网络/功耗等 JSX、布局、样式和交互不做重构；横向 HUD 和 detail-only 详情窗不加播放器。
- 五寸 USB 输出的 monitor、static、gif、weather-clock 模式显示小型控制层；video 模式不显示。若壁纸模式配置了旧的背景音，当音乐库已有选中歌曲时，旧背景音会暂停让位，防止双路音频。
- 应用内音量，不修改 Windows 系统音量。视频模块保持独立。
- 首轮不引入 Nora/NewAmp/Lokal 整体依赖；它们只作为设计/能力参考，不复制其账户、网络音乐和下载服务。

## 主源码阅读顺序

1. `src/main/index.ts`：主窗口、Tray、USB 窗口生命周期、music state/store/IPC、服务启动。
2. `src/shared/types.ts`：`AppPage`、`MusicState`、`MusicCommand` 等共享类型。
3. `src/preload/index.ts` 与 `src/renderer/vite-env.d.ts`：受控 IPC API 和 Renderer 类型声明。
4. `src/renderer/music-player.tsx`：唯一音频运行时、主界面音乐库、Dock、HUD 迷你播放器。
5. `src/renderer/music-player.css`：播放器局部样式和 USB 输出浮层样式。
6. `src/renderer/App.tsx`：主页面路由、HUD 天气前精确插入点、USB 输出模式。
7. `src/renderer/main.tsx`：全局样式入口。
8. `tests/music-player-source.test.cjs`、版本测试、其他 `tests/`。
9. `scripts/validate-release-version.cjs`、本版本 `NexusMonitor-2.2.0-BUILD-RELEASE.cjs`、Windows CI workflow。

## 关键安全/回归约束

- 不要把音乐引擎放进 WidgetView 或 USB 输出 Renderer；否则会形成多音源/切换窗口停播。
- 不要更改现有 video output 的播放器行为；视频模式不挂 MusicMiniPlayer 和主界面音乐控制 Dock。
- 不要重排、重构或修改垂直 HUD 的天气、时钟或其他监控块；播放器只是在天气 JSX 前插入。
- 不要在 USB display ID 缺失或暂时未枚举时猜测副屏。首次必须由用户在设置页确认；已保存 ID 暂时不可用时提示重新选择，不自动改写为其它外接屏。
- 不允许自动续播；所有新进程启动都要保持暂停。
- 不复制、重编码或删除用户 MP3 文件。不得把用户实际音乐目录、运行数据或日志提交仓库。
- 增加行为必须补测试；版本门禁 14 项全部匹配。
- 主窗口隐藏后必须继续持有一个音频元素；托盘“退出”才真正结束。
- GitHub Actions 只能验证 Windows Hosted Runner 的构建，不能代替目标 PC/USB 屏/扬声器实测。

## Windows 验证命令

在用户 Windows 机器的 GitHub clone 根目录执行（PowerShell 使用 `npm.cmd`）：

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
node .\\scripts\\validate-release-version.cjs
npm.cmd run test:main
npm.cmd run build:renderer
dotnet build .\\HardwareService\\HardwareService.csproj -c Release
npm.cmd run test:storage
```

PawnIO 官方模块缺失时先运行 `scripts/fetch-mchbar-module.ps1`。不要用空文件或不明来源二进制替代。

## 2.2.0 必须实机验收

1. 主窗口关闭后任务栏图标消失、Tray 保留；双击托盘恢复；退出菜单完整退出。
2. 主窗口隐藏期间播放不中断；恢复窗口后播放位置/状态正确。
3. 多首 MP3 导入、文件夹导入、歌单创建/改名/删除、添加/移除、手动排序、搜索、丢失文件处理。
4. 顺序/随机/列表循环/单曲循环边界、前后切歌、进度、暂停恢复、音量和重启状态恢复。
5. 竖屏 HUD：播放器位于天气上面；天气上方数据、时钟底部和其余模块外观/交互与 2.1.8 一致；横屏 HUD 无新增播放器。
6. 主界面与 HUD/USB 输出同步切歌、音量和播放状态；点击控制按钮不展开卡片，点击歌曲区域展开，点击外部关闭。
7. 五寸屏冷启动时在服务初始化期间就出现；检查 saved display ID 延迟枚举、热插拔、负坐标、混合 DPI、横竖/不同分辨率。
8. USB monitor/static/GIF/weather-clock 显示迷你控制层，video 不显示；壁纸已有背景音与音乐库切换不会双响。
9. COM3 Turing 与 ESP32-P4 五寸屏长时间运行、睡眠恢复及拔插复连。

目前未由实际用户硬件确认的事项，必须保留为 pending，不能因 CI 通过而标记验收通过。
