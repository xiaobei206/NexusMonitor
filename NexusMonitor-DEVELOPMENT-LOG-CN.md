# NexusMonitor 统一开发日志（跨版本唯一主记录）

**当前开发分支源码版本：2.2.1（PR #2；尚未合并 / 发布）**  
**记录规则：** 每个正式版本都追加到本文件；下一版不得新建第二份版本日志。按版本号和日期顺序记录功能、根因、修复、失败尝试、验证范围及未完成事项。历史测试结果不能冒充当前版本测试结果。

## 版本总览与跨版本教训

- **2.0.0**：建立 Electron + TypeScript/React/Vite 桌面端与 .NET HardwareService 架构；接入 LibreHardwareMonitor、WMI、传感器清单、功耗摘要、CPU/GPU 频率/温度选择、天气/AQI 和 Turing 3.5 英寸 USB 屏。解决 NaN/Infinity 导致 `System.Text.Json` 无法序列化 `/api/snapshot` 的问题，增加有限值过滤与 JSON 最终保护。早期 Node 测试 52 项通过；当时完整 Electron/Renderer 与 .NET 检查仍须 Windows 环境完成。
- **2.0.1**：加入 Alder Lake GT 温度实验，使用官方签名 PawnIO `IntelMCHBAR` 模块，只读 MCHBAR 温度寄存器；按 CPUID family/model 白名单限制到 Intel 0x97/0x9A，读取 MSR TjMax 并检查有效位/范围。增加 API 探测状态与稳定的合成传感器项。源码级测试 21/21；没有声称 .NET 编译或实机寄存器读取通过。
- **2.0.2**：修复 Turing 副屏刷新被主窗口当前页面控制的问题。Turing controller 常驻挂载，页面切换时仅隐藏而不卸载，确保 Canvas/帧差分发送 effect 持续运行；连接状态查询放在进入 Turing 页面时，避免启动服务竞态。串口协议与 RGB565/16×8 diff 机制未改。实际 COM3 持续刷新仍需目标机验收。
- **2.0.3**：加入物理磁盘/卷容量聚合、HUD C: 容量、网络上/下行独立参考条、统一 US AQI 颜色、Turing 本地图片/文件夹幻灯片与 fit 模式。静态图片经现有 Canvas/RGB565 单写入路径发送；新图片重置 previousFrame，之后继续差分刷新，禁止新增第二个串口写入者。继承 2.0.2 GPU 时钟与 C# 兼容性修正。环境 Node 测试 78/78；完整 Vite/.NET/COM3 未在该环境验证。
- **2.0.4**：HUD 增加原生右键菜单、四边吸附、位置固定、置顶、边缘自动隐藏/露出、同屏全屏让位和按显示器记忆位置；Turing 增加天气时钟与 27 张 480×320 WebP 背景。期间出现 Electron `getMinimumSize()` 数组与 tuple 类型差异、持久化显示器位置 `unknown` 未验证、GPU Power 0 W 误选 generic Total、QWeather 降水概率 `Math.Round` 重载二义性等问题；修复时均补充回归覆盖。天气 AQI 独立请求失败不能拖垮天气主体；NaN/Infinity 必须在传感器读入和 JSON 输出边界处理。完整历史细节见下方 2.0.4 开发记录。
- **2.0.5**：为解决主窗口关闭后 HUD/Turing 刷新生命周期与 compact HUD 展开时左右闪动，将详情面板拆成独立原生 `BrowserWindow`，打开/关闭详情不再移动或缩放紧凑 HUD。通过 Renderer IPC 报告详情窗口指针状态，由主进程真实屏幕光标位置判断跨窗口移动，避免依赖不存在的 BrowserWindow 通用 enter/leave 事件。新增 `widget-detail-window.ts` 处理多屏/负坐标工作区定位。保留 Turing 单写入者、管理员安装要求和桌面快捷方式。
- **2.0.6**：修复 pointer-cancel 分支残留的 `scheduleHide()` 未定义引用，更新旧的 `WidgetView` 单窗口结构断言以匹配分离详情窗架构。Node 回归报告 152/152；该结果来自源码转译辅助测试，不等同于完整 Electron 类型构建。
- **2.0.7**：针对 HUD 详情窗第一次左键打开出现空白框、第二次才正常的问题，识别到 `did-finish-load` 仅代表文档加载完成，不保证 Chromium 已绘制首帧。详情窗显示门槛改为 `ready-to-show`，并在 `loadURL/loadFile` 前注册事件监听。保留窗口首次绘制相关配置。Windows 实际首次点击仍须安装后验收。
- **2.0.8**：修正 `paintWhenInitiallyHidden` 的配置层级：它属于 `BrowserWindow` 顶层选项，不属于 `webPreferences`。曾发生 TS2353；不能只依靠源码转译测试验证 Electron 类型定义，必须在目标依赖下运行 `npm run test:main`。
- **2.0.9**：PowerShell 5.1 无 BOM UTF-8 脚本中的中文被按系统 ANSI 代码页解码，导致构建脚本在 ParserError 阶段失败；改为 ASCII 脚本并增加字节检查。但版本检查又因服务 API `version` 属性格式采用精确字符串匹配而误报 `serviceApi: false`。这说明发布脚本必须实际执行、覆盖源码格式变体，并且发布门禁逻辑不能只靠静态语法转译。
- **2.1.0（上一正式版本）**：将版本一致性逻辑抽成 `scripts/validate-release-version.cjs`，由发布入口与回归测试共享；容忍 C# `version` 属性空格、引号及大小写变体，但仍比较实际版本值。正式发布入口改为 `NexusMonitor-2.1.0-BUILD-RELEASE.cjs`，避免 PowerShell 5.1 的脚本解码和 ExecutionPolicy 问题。版本核验 14 项、版本回归 3 项、HUD 详情窗/定位回归 18 项报告通过；完整 Windows Electron/Renderer/.NET/NSIS 和首次点击实机验收未宣称通过。

- **2.1.1**：在用户完成 2.1.0 Windows 全套发布构建后，针对实机发现的详情大卡片首次左键展开空白、整体字号偏小和悬浮窗时间缺少秒数进行正式版本迭代。详情窗显示门槛改为 Electron `ready-to-show` 与 Renderer React commit 后双 `requestAnimationFrame` 握手双条件；详情卡片字体覆盖严格限定 `.widget-shell.detail-only`；共享悬浮窗时钟格式改为 `HH:mm:ss`。同时修正 2.1.0 中发布校验器错误拼接 release 入口文件名的问题。版本字段统一升级到 2.1.1，正式交付完整源码 ZIP，不再交付停留在旧版本号下的 FIX 补丁。当前容器的相关回归测试通过；2.1.1 Windows 全套重构建和三项实机复验尚待用户完成。


## 2.2.0（开发中，2026-11-07）

### 功能实现

- 主窗口关闭改为隐藏到系统托盘：任务栏主窗口图标消失，托盘双击/菜单恢复，托盘“退出 NexusMonitor”才结束进程。主 Renderer 不卸载，以保持唯一音频引擎和既有常驻渲染功能。
- USB 5 寸输出按已保存 `usbDisplayDisplayId` 在应用启动阶段恢复，早于 HardwareService 启动；显示器尚未枚举时保留待恢复状态，拓扑变化再尝试；不猜测其他显示器。首次使用须由用户手动确认五寸屏目标。
- 新增统一本地 MP3 播放服务与歌单数据文件：文件/文件夹导入（每次最多 5000 首）、歌曲路径/歌单持久化、启动恢复歌曲/进度/音量/播放模式但强制暂停；删除库记录不删除用户文件。
- 新增主界面音乐库页与全页面共享底部 Dock、竖向 HUD 天气块上方迷你播放器，以及 USB 五寸输出非视频模式的迷你控制层。Widget/USB 窗口只发送控制命令并订阅状态，不创建第二个音频引擎。
- 支持歌单创建、改名、删除、添加/移除歌曲、歌单内上下排序；支持播放/暂停、上一首/下一首、进度、应用独立音量、随机、列表循环和单曲循环。
- 壁纸静态/GIF 模式原有背景音在选择音乐库歌曲后让位，避免并行播放；视频输出保持独立。
- 竖向 HUD 仅在天气块上方插入播放器，时间仍留在底部；天气和其它监控块不重排。

### 2.2.0 后续核对修正

- 移除 USB 显示器设置页对“第一个非主显示器”的自动回退和自动保存。目标 ID 未枚举时要求用户明确选择，不覆盖原保存 ID，防止将其他外接屏误认为五寸屏。
- 主界面播放器 Dock 在所有主应用页面持续显示；仅独立 USB 视频输出不显示音乐控制。更新对应源码回归测试。
- 原有测试中一条针对旧 Dock 隐藏行为的断言已修正为检查独立 USB 视频输出边界；没有删除测试覆盖。

### 版本同步

应用版本升至 2.2.0，并同步 package / lockfile / VERSION / .NET 项目与 API / snapshot ServiceInfo / Renderer / 版本专属 build entry。

### 验证状态

- 所有开发修改直接提交到 GitHub 分支 `feature/2.2.0-music-and-window-lifecycle`；未在本地另开源码副本。
- GitHub Actions Windows CI Run #23：**成功**，功能代码 HEAD `e45c93bd4e8e2faf17270fdbcda382a8f66e9086`；[查看运行记录](https://github.com/xiaobei206/NexusMonitor/actions/runs/42334294679)。
- 文档/清单同步后的 Run #24：**成功**，HEAD `d6a6f6ab9ac996f0d74d688d155d07b14a2ada6c`；[查看运行记录](https://github.com/xiaobei206/NexusMonitor/actions/runs/42334605208)。版本门禁、188/188 主进程测试、Renderer/Vite、PawnIO、.NET Release 与 Storage 测试全部成功。
- 14 项版本一致性门禁通过；`npm.cmd run test:main` 188/188；Renderer TypeScript / Vite 构建通过；PawnIO 官方资源校验通过；.NET 10 Release 构建 0 warning / 0 error；`npm.cmd run test:storage` 通过。
- NSIS 安装包与正式 Release 未执行；PR 仍为 Draft、未合并 main、未发布正式版本。
- 实际 Windows PC / ESP32-P4 五寸屏 / COM3 Turing / 多屏负坐标与 DPI / MP3 实际播放：仍待实机验收；不得由 Hosted CI 代替。

## 必须记住的反复踩坑与工程规则

1. **版本交付入口必须在交付前实际运行**，不能只看源码或转译。版本字段要逐项对齐 `package.json`、`package-lock.json` 根项目、`VERSION`、Renderer/About、HardwareService API/状态、.NET Assembly/File/InformationalVersion 和发布脚本。
2. **PowerShell 5.1 编码坑**：无 BOM UTF-8 的中文 `.ps1` 可能被系统代码页误解；2.0.9 的 ASCII 方案又未解决校验逻辑假阴性。当前正式发布入口为 Node `.cjs`，后续不要重新引入版本化 `.ps1` 作为唯一发布入口。
3. **Electron 首帧不等于文档加载完成**：详情窗使用 `ready-to-show`，监听器应在 `loadURL/loadFile` 前注册；`paintWhenInitiallyHidden` 放在 BrowserWindow 顶层。
4. **源码级 Node 测试不等于完整类型检查**。`transpileModule` 只能证明语法转译，不能替代 Electron 真实类型、React 类型和 Vite 构建。
5. **测试状态按命令逐项记录**：Node 单测、`npm run test:main`、Renderer/Vite、.NET 编译、Storage tests、NSIS、Windows GUI、COM3 实机是不同级别，禁止混写成“全部通过”。
6. **Turing 串口只有一个写入者**。天气/壁纸/遥测都走既有帧发送路径，不得并行开第二个 serial writer；COM3 验收时关闭原厂 `UsbMonitor.exe`。
7. **传感器值不造假**：缺失值用 `null` / `—`，不把 NaN/Infinity 或零值哨兵伪装成有效数据；CPU Package 已包含 iGPU 子域时避免重复加总。
8. **UI 改动范围从严**：用户特别在意保留原有布局与图形元素。未获明确要求，不顺手重做横向 HUD、主界面、Turing UI、天气源设置和插件页；竖向 HUD 的专项改动不能扩散到其他页面。
9. **源码包/交接文档命名统一**：ZIP、目录、构建报告、交接文档、验收命令、清单和校验文件都带 `NexusMonitor-当前版本`。跨版本唯一开发日志例外使用稳定文件名 `NexusMonitor-DEVELOPMENT-LOG-CN.md`，每版追加，不另建日志。
10. **新对话不要猜**：先读当前版本交接说明，再读唯一开发日志、版本校验器和当前源代码；不要依赖过时 handoff、旧 build report 或模型记忆推断当前状态。

---

# NEXUSMONITOR 2.0.4 — 开发日志

**时间范围：** 以当前可追溯交付记录为准，核心开发集中在 2026-11-02 至 2026-11-03。  
**基线：** `NexusMonitor-2.0.3.zip`。  
**最终版本号：** 2.0.4（未升级版本号）。

## 一、基线继承与 2.0.4 初始修复

- 从 2.0.3 完整源码开始，保留磁盘容量聚合、C: 容量条、网络上下行独立参考条、共享 AQI 分级颜色、本地壁纸/幻灯片、Turing RGB565 单写入保护等原有功能。
- GPU 功耗处理避免 Intel iGPU 子域在 CPU Package 已包含时被二次累加。
- Alder Lake GT 温度探测将 PawnIO MCHBAR 作为必需嵌入资源；构建时缺失会明确失败，并提供官方版本校验的准备脚本。
- 增加 HUD 原生右键菜单、四边吸附、位置固定、独立置顶、自动隐藏/露出、同屏全屏让位及按显示器记忆位置。
- Turing 增加天气时钟模式，横屏 480×320、竖屏 320×480，捆绑 27 张天气背景。

## 二、fix1：Windows 主进程类型修复

用户在 Windows 执行完整构建/测试时暴露两处 TypeScript 错误：Electron `getMinimumSize()` 返回值需明确解构为二元组；`widgetDisplayPositions` 持久化设置读取必须先做对象和字段校验。修复后用户报告此前主进程测试、Renderer 构建、存储测试、.NET 构建均通过（这是早期 2.0.4 阶段，不代表后续所有补丁都已完成同一轮全量构建）。

## 三、fix2：Turing 可读性、背景时段、网卡筛选

- 放大 Turing 天气时钟物理像素字号。
- 夜间背景池剔除不应在深夜出现的黄昏素材。
- 网络接口识别物理网卡、默认路由接口，默认合计只选实际主路由实体网卡，避免 VPN/虚拟接口导致上下行速度重复或虚高。
- 增加 Windows PowerShell 网络诊断脚本；后续修正脚本为 PowerShell 5.1 兼容格式。

## 四、fix3：天气韧性、日预报与时钟版式

- AQI 独立请求失败不再连带使天气主体失效。
- 无缓存情况下天气请求失败时增加 45 秒重试与日志。
- Turing 保留 6 个未来小时、3 个未来日，跳过当前小时。
- 继续放大日期、星期和天气时钟字体，强化竖向日期区域。

## 五、fix4：网络识别与 HUD 展开行为

- WMI `PhysicalAdapter` 值使用更稳健的类型转换，并保留 Ethernet/Wi-Fi 名称启发式回退。
- 竖向 HUD 展开方向固定向左；横向贴顶时向下展开。
- 补充 pointer enter/leave 事件以配合自动隐藏逻辑。
- 天气小时显示基于 Asia/Shanghai 墙上时间，严格跳过当前小时。

## 六、fix5：竖向 HUD、天气源、太阳时段背景

- 竖向 HUD 拆成独立布局，补足硬件图标、硬件数据与天气摘要。
- 增加天气数据源：Open-Meteo（默认）、QWeather、WeatherAPI、OpenWeather。
- API Key 经 Electron `safeStorage` 加密；renderer 不取得明文 key。
- Turing 背景优先使用服务端日出/日落时间和太阳时段，再判断天气场景；把黄昏海景、暮色水面从普通阴天/深夜候选里限制出去，避免 23 点错误出现夕阳水面图。
- 对 QWeather V7、WeatherAPI 套餐和 OpenWeather One Call 3.0 权限做了功能限制说明。

## 七、fix5 热修复链：测试与 C# 兼容性

按 Windows 测试逐步修正：

- fix5.1：补齐 AQI 可选请求说明，满足现有回归约定。
- fix5.2：调整未来日列表与可选 AQI 异常处理。
- fix5.2.1：修复 `Math.Round` 重载二义性，QWeather 降水概率为整数时直接转为 `int?`。
- fix5.2.2：恢复 `D()` 数值读取入口并用于 Open-Meteo AQI/污染物解析，兼容既有源码测试约定。
- 用户随后实际确认：`.NET Debug build` 成功，`npm run test:main` 全部通过。注意这是该热修复阶段的确认；天气服务在后续日历扩展时又发生修改，仍需在最新最终源码上重新跑构建。

## 八、竖向 HUD 专项恢复与增强

用户反馈竖向 HUD 在前期重排后丢失原来重要的图形信息。后续按用户要求只改竖向 HUD：

- 恢复 C: 磁盘容量使用横条。
- 恢复网络下载、上传两条独立横条。
- AQI 文字重新调用公共分级颜色，保持与原有共享规则一致。
- 保留较大字号、左侧硬件图标及天气摘要。
- 横向 HUD、主界面、Turing 显示布局没有在该专项补丁中重做。

## 九、竖向 HUD + 小米风格中国日历

按用户明确的视觉要求实现：

- 竖向 HUD 默认展开尺寸调整为 340×900 Windows 逻辑像素，按屏幕工作区自适应。
- 天气卡补充当天最高/最低温、PM2.5、PM10；摘要区域展示 3 小时/3 天，详细面板最多展示 6 小时/6 天。
- 天气服务日预报数据长度相应增加；主界面与 Turing 仍保持各自原显示条数和布局。
- 点击竖向 HUD 日期星期打开独立日历月视图。
- 公历大字、农历/节日/节气灰色小字；周末/假日蓝色日期；补班日白色日期+右上角橙色「班」；放假日右上角蓝色「休」。
- 休/班圆标固定在格子右上角，绝对定位，不推动居中的日期数字。
- 内置 2025/2026 已公布国务院假期安排；没有官方安排的年份不生成臆测休/班；节气内置数据覆盖 2025—2027。

## 十、图灵副屏启动自动连接热修复

用户指出手动连接正常，但启动应用不会自动连接。排查后发现启动时仅刷新设备列表，没有自动调用 `connectTuring()`。最终源代码加入启动自动连接流程：

1. 等待设置加载完成和 HardwareService 就绪。
2. 优先尝试已保存串口（用户设备历史上为 COM3）。
3. 保存端口不可用时，仅回退到服务明确标记为 Turing 设备的串口。
4. 已连接不重复连接；找不到设备不阻塞主界面，保留手动连接。

该修复已合并到本交接包，但尚未收到用户在 Windows 安装该热修复后的最终验收报告。

## 十一、当前验证边界

### 用户实际确认过

- 早期 2.0.4：安装 npm 依赖后，主进程测试、Renderer 构建、存储测试、.NET 编译曾全部通过。
- fix5.2.2 阶段：用户再次确认 `.NET Debug build` 成功、`npm run test:main` 全部通过。
- 用户对最近竖向 HUD + 日历视觉方案表示满意（“完美了”），随后指出启动时 Turing 不自动连接。

### 本轮交接环境专项检查

- 竖向 HUD/日历专项测试批次：34/34 通过。
- 额外可独立运行的 Node 回归测试：120 项通过。
- Turing 自动连接专项测试：32 项通过。
- TS/TSX 源码语法转译检查通过；ZIP/文件路径在交付时检查。

这些检查并不等于目标 Windows 上完整 Vite 构建、Electron 类型构建、.NET 编译或实际 COM3 验收。

### 尚待最新源码验收

- 在最终合并源码上重新执行 `npm ci`（仅在全新工作副本）、`npm run test:main`、`npm run build:renderer`、`npm run test:storage` 和 `dotnet build`。
- 安装最新 Turing 自动连接热修复后，重新启动应用确认无需手动连接。
- 确认 Windows 右下角 HUD 的最终默认尺寸、自适应、多屏和缩放表现。
- 天气源分别验证 PM2.5/PM10/预报字段；QWeather 缺少 AQI/PM 时按「—」处理。
- 尚未创建或验收 NSIS 安装包。

## 十二、后续开发建议

1. 新功能先确定修改范围；用户特别在意不要误改横向 HUD、主界面、Turing UI。
2. 新对话先读取当前版本 `NexusMonitor-2.1.4-HANDOFF-CN.md`，再读取本文件和对应源文件/测试；本交接包只认这两份主文档，避免沿用旧补丁包/旧说明。
3. 小范围 patch，新增测试；不要用删除测试或放宽断言代替修复。
4. 任何文件修改都要区分：静态检查、单测、TypeScript 构建、Vite 构建、.NET 编译、Windows 实机验收。
5. 不要说“全部通过”，除非确实有对应命令的完整输出。
6. 没有用户明确要求，不升级版本号、不打包安装程序、不做大面积 UI 重构。

---

## 2.1.1 本轮改动与验证记录（2026-11-05；基于 2.1.0）

### 用户实机反馈

用户已在 Windows 完成 2.1.0 完整构建并安装，随后确认：悬浮窗左键第一次打开独立大卡片仍是一片空白；关闭后再次打开正常。用户同时反馈大卡片整体字号偏小，并要求悬浮窗时间显示秒数。该实机结果说明 2.1.0 中仅等待 Electron `ready-to-show` 的第一次显示门槛仍不足，不能继续把原修复视为已完成。

### 本补丁修改

- `src/main/index.ts`：新增 native-ready 与 renderer-ready 两个独立状态；详情窗仅在 `ready-to-show` 和 Renderer 握手都完成后显示。Renderer IPC 来源严格校验为当前 `widgetDetailWindow.webContents`；关闭或 renderer 崩溃时重置 readiness 状态。
- `src/preload/index.ts`、`src/renderer/vite-env.d.ts`：增加 `notifyWidgetDetailRendererReady()` preload API 与类型声明。
- `src/renderer/App.tsx`：detail-only `WidgetView` 在 React effect 中等待两次 `requestAnimationFrame` 后回报渲染就绪；时间格式增加 `second: '2-digit'`，横向/纵向紧凑 HUD 共用该格式。
- `src/renderer/styles.css`：新增 `.widget-shell.detail-only` 范围的字体可读性覆盖，避免影响紧凑 HUD 和主界面。
- `scripts/validate-release-version.cjs`：纳入用户 Windows 本地已修复的 release entrypoint 路径错误，读取 `NexusMonitor-${expected}-BUILD-RELEASE.cjs`。
- 更新相关 `tests/widget-detail-window.test.cjs`、`tests/ui-readability.test.cjs`，覆盖双就绪握手、字体范围和时钟秒数。
- 更新本交接文档和 Windows 命令文档，明确 PowerShell 必须使用 `npm.cmd`（含版本检查），禁止要求用户修改 ExecutionPolicy。

### 当前验证与边界

- `tsc -p tsconfig.test-utils.json`：通过。
- `node --test tests/version-consistency.test.cjs tests/release-config.test.cjs tests/widget-detail-window.test.cjs tests/ui-readability.test.cjs`：20/20 通过。
- `node scripts/validate-release-version.cjs`：14/14 版本检查通过。
- 尝试直接在干净容器运行全量 `node --test`：146/150 通过；4 项（api-error、logger、service-backoff、snapshot-coordinator）因当前容器没有项目依赖安装后的 `dist-electron/main/*.js` 编译产物而无法加载。不得把这次尝试写成完整 `test:main` 通过。
- 当前容器未安装项目 `node_modules`，未执行 Electron/React 完整类型检查、Vite 构建、.NET 构建或 Windows 实机验收。
- 下一步需用户在 Windows 新建 2.1.1 工作目录并安装后，运行 `node .\NexusMonitor-2.1.1-BUILD-RELEASE.cjs --validate-only` 与 `npm.cmd run test:main`、`npm.cmd run build:renderer`，再完整打包并实机确认首次左键显示不空白、字体可读、时钟显示秒数。

**正式版本策略：** 本轮已作为 `2.1.1` 正式源码迭代交付；`VERSION`、package/lock、Renderer、HardwareService、.NET 元数据和版本专属文件名均已同步升级。原始 `2.1.0` ZIP 保留不覆盖。下一轮代码迭代继续递增为 `2.1.4`（按后续实际语义版本需要调整主/次/补丁位）。



# NEXUSMONITOR 2.1.4 — USB 5 寸副屏与图灵昼夜亮度

**基线：** `NexusMonitor-2.1.1.zip`（ZIP SHA-256 与随包 SHA 文件匹配；内部 manifest 146 项全部校验通过）。
**正式版本：** 2.1.1 → 2.1.4。

## 用户需求

- 主界面「图灵副屏」下方新增独立「USB 5 寸副屏」设置页。
- 支持启动/关闭副屏，硬件监控、静态壁纸、GIF 壁纸、天气时钟和视频播放。
- 5 寸屏硬件背光控制可以后续研究，不阻塞本版页面与内容模式。
- 图灵 3.5 寸副屏昼夜自动背光先行实现，按时间配置日/夜亮度。

## 实现

- 新增 Electron `screen.getAllDisplays()` 显示器列表，持久化目标 display id；建立独立 BrowserWindow，位于目标扩展显示器、无边框并全屏输出。显示器拓扑变化时刷新列表，目标显示器拔除后关闭窗口。
- 独立 `?usb-display=1` Renderer 路由，与主应用分离。五种模式共享本机 telemetry/weather 更新；静态/GIF 图片与视频由主进程文件选择器处理。未更改 5 寸 IDD 驱动或固件，不通过第二个 USB writer。
- 新增 preload IPC 及 `Window.nexus` 类型；新增 `docs/USB_DISPLAY_CN.md`。
- 图灵昼夜自动亮度复用原有 `/api/turing/brightness`，新增纯函数 `getScheduledTuringBrightness`，默认关闭、日间 08:00/70%、夜间 20:00/25%，每 30 秒检查，连接/设定修改后立即执行；支持跨午夜窗口和 0–100 裁剪。自动模式下锁定手动滑块。Turing 页在主应用里常驻挂载，切换设置页不停止调度。
- 5 寸屏真实背光控制保留为后续课题：已知侧边按钮能逐级改变亮度，但目前尚无可靠证据证明 IDD/USB 固件暴露主机亮度命令。不用黑色蒙层冒充真实背光，也不刷未知固件。

## 回归检查

- `tsc -p tsconfig.test-utils.json`：通过。
- 自动亮度、USB 副屏页面/IPC 和 Turing lifecycle 回归测试（版本、HUD、Turing 与 USB 显示页面/IPC）：50/50 通过。
- 版本一致性校验：14/14 通过；发布入口 `--validate-only`：通过。
- 以上并不代表完整 Electron/Renderer build、Vite、.NET Release、Storage tests、NSIS 或目标 Windows 实机副屏验收通过；本轮环境没有项目 node_modules / .NET SDK，具体待用户按 2.1.4 验收命令完成。

## 已知限制

- Electron 显示器 id 变化后需在管理页重新选择目标屏。
- Windows/IDD 的 EDID 名称可能是通用或模板信息，不以显示器名称单一判断。
- 5 寸输出窗口跟随 Windows 当前逻辑分辨率，不自动修改 Windows 显示模式。
- 5 寸硬件背光命令尚未确认；图灵自动背光需要 COM 实机验收，拔插/开关屏幕也需验证。


## 2.1.4（当前，2026-11-06）

本轮针对用户实机反馈正式升级 2.1.4。核心目标是把 960×540 / 5 英寸 USB 扩展屏当作独立的大屏仪表，而不是复用桌面小字号 UI。

- 5 寸 USB 副屏输出重新设计为大字体、高对比、科技感仪表盘：CPU/GPU 环形负载仪表、温度/功耗主读数、内存与磁盘状态条、网络实时曲线、网格背景、数字时钟。字号按 960×540 近距离观看重新分级，避免 8–12px 级小字。
- 5 寸天气时钟重新设计：大时间、大温度、天气摘要、US AQI 高亮、PM2.5、PM10、今日最高/最低、降水概率和数据源。
- 图片/GIF 模式增加本地背景音乐支持：MP3/WAV/M4A/AAC/OGG/FLAC，独立音量和循环设置。
- 视频播放继续使用 Chromium 原生媒体能力，支持 MP4/M4V/WebM；MOV 取决于实际编码，不做强行转码。
- QQ 音乐不在本轮直接接入非官方音源。可研究 Windows SMTC / QQ Music 客户端控制，但官方个人桌面 OpenAPI 并不是本项目可直接依赖的稳定接口；本轮先保证本地音频播放可靠。
- 5 寸屏真实硬件背光继续暂缓；用户已确认侧边拨动键可逐级调亮度，但尚未确认 USB 控制命令。
- 图灵昼夜自动亮度继续保留，复用已有真实背光命令与单写入者模型。

### 2.1.4 验证边界

- 版本门禁 14/14：通过。
- USB 显示相关 Node 回归：已修正并计划执行。
- 当前容器无项目 node_modules，不能声称完整 Electron/Vite/.NET/NSIS 实机通过。
- 5 寸屏视觉效果、视频编解码兼容和背景音乐自动播放需在用户 Windows 实机验收。

### 后续

若用户反馈 5 寸副屏仍有字号、布局或视觉层级问题，只在 USB 输出页面继续迭代，避免影响 3.5 寸 Turing 和桌面 HUD。


## 2.1.4（2026-11-06）— JSX 构建修复与媒体竖屏显示
- 用户实机在 Renderer/Vite 构建时遇到 `App.tsx:118 TS1381`。根因是 `MiniAreaChart` 的 SVG 网格 map 表达式末尾多了一个 `}`；本版修正。
- USB 5 寸副屏图片、GIF、视频配置增加横屏/竖屏画面选项。竖屏模式让纵向素材按比例居中显示，保留原始方向，不旋转 Windows 桌面。
- 版本正式递增 2.1.3 → 2.1.4；本轮未在 Windows 环境完成完整打包，实机验收待用户构建。


## 2.1.5（2026-11-06）— 修复背景音乐音量 JSX 类型错误

### 用户反馈与根因

用户在 Windows 上构建 2.1.4 时，`npm.cmd run build:renderer` 的 TypeScript 检查报错：

```text
src/renderer/App.tsx:1224:155 - error TS2322
Property 'volume' does not exist on type 'AudioHTMLAttributes<HTMLAudioElement>'.
```

根因是把标准 HTMLMediaElement 的运行时 `volume` DOM 属性写成了 React `<audio>` JSX 属性；React DOM 类型定义不支持该属性。

### 修正

- `UsbDisplayOutput` 新增 `audioRef = useRef<HTMLAudioElement|null>(null)`。
- 新增音量归一化值，将设置页 0–100 映射到媒体元素的 0–1 区间。
- 使用 `useEffect` 在 `audioSource`、`mode` 或设置音量变化后，写入 `audioRef.current.volume`。
- `<audio>` 改为使用 `ref={audioRef}`，删除不合法的 `volume` JSX 属性。背景音乐自动播放、循环和静态/GIF 限定保持不变。
- 正式版本从 2.1.4 升级至 2.1.5；旧版本 ZIP 保留。

### 验证边界

- 已核对修正后 JSX 中不存在 `volume={...}`，媒体音量通过 `HTMLAudioElement.volume` DOM 属性设置。
- 完整 `tsc -p tsconfig.renderer.json && vite build`、Electron 构建、.NET Release、Storage tests、NSIS 及 Windows 实机播放/音量滑块验收，仍需用户在 Windows 环境执行；本次容器没有项目 `node_modules` 和 Windows 打包环境。


## 2.1.6（2026-11-06）— 修复 USB 副屏负坐标下的窗口越界

### 用户反馈

用户在 Windows「扩展这些显示器」布局中，将 2 号屏放在 1 号主屏左上方后，NexusMonitor 静态图片在主屏左上角也露出一小条，表现为副屏图片像是没有被限制在 5 寸屏范围内。

### 源码排查与修正

- 2.1.5 的 USB 输出窗口已按 `screen.Display.bounds` 创建，但在首次显示前又调用 `BrowserWindow.setFullScreen(true)`。这会再次进入 Windows/Electron 原生全屏定位流程，在负桌面坐标和混合 DPI 的多屏环境下存在窗口被重新定位/调整的风险。
- 2.1.7 移除原生 fullscreen 切换，改用无边框、不可调整大小的普通窗口直接设置目标显示器完整 bounds；关闭窗口阴影，避免边界视觉溢出。
- 新增 `src/main/usb-display-window.ts`，校验显示器几何数据，并原样保留负 `x/y`；明确 Electron 的屏幕与窗口 bounds 使用同一桌面逻辑坐标，不再对 `scaleFactor` 二次换算。
- 点击启动时若同一目标窗口已经存在，也会重新应用当前 bounds；显示器新增/移除/尺寸或位置变化时继续重新应用目标 bounds。
- 新增负坐标回归测试，覆盖副屏位于主屏左上方、左侧及无效 bounds 场景。原有图片/GIF/video 的 `cover`、`contain`、竖屏居中与媒体播放逻辑未改。
- 正式版本从 2.1.5 升级至 2.1.7；保留 2.1.5 ZIP，不提供覆盖式补丁。

### 验证边界

- 本轮需记录负坐标纯函数测试、USB 窗口源码回归、版本一致性、源码 manifest 与 ZIP 完整性结果。
- 目标 Windows 机器的实际副屏窗口定位及主屏边缘是否完全无图像泄漏，仍需安装 2.1.7 后按新的验收步骤实机确认。
- 完整 Electron/Vite/.NET/NSIS 构建是否通过，以用户在 Windows 执行时的真实输出为准；不能把本地源码测试等同于实机验收。


## 2.1.7（2026-11-06）— 修复主界面空白与悬浮窗首次展开空白

- 主窗口现在同时等待 Electron 原生首帧与 React 首次提交后的双 `requestAnimationFrame` 就绪信号，避免 `ready-to-show` 早于应用 UI 实际绘制。
- Renderer 根节点加入错误边界；发生 React 渲染异常时显示可复制的异常堆栈，不再只留下窗口背景底色。主窗口控制台消息写入应用日志。
- 读取历史设置时，对 `selectedNetworks`、`selectedDisks`、`visibleMetrics`、`metricOrder`、`shortcuts` 等数组做类型校验，避免旧配置里的 `null` 或错误类型在首次渲染中触发异常。
- 启动应用时默认创建并显示悬浮 HUD；保留原有手动隐藏、托盘和窗口操作行为。
- 2.1.7 仍需用户 Windows 环境进行完整 Renderer/Vite、Electron、.NET 与实机验收。


## 2.1.8（2026-11-06）— 修正 Electron 45 console-message 事件类型

- 修复 2.1.7 主进程 `src/main/index.ts` 中 `console-message` 事件监听器错误地把第二个参数当作 details 对象的问题。Electron 45.2.1 的类型定义采用兼容旧式位置参数：`event, level, message, line, sourceId`。
- 改为按 Electron 45 的真实事件签名记录 Renderer 控制台日志，不影响主窗口首帧门控、Error Boundary、旧设置容错、默认启动 HUD 或 USB 副屏 Bounds 行为。
- 这次错误此前阻断了 `tsc -p tsconfig.electron.json`，因此 2.1.7 的主进程完整编译没有通过；本版必须在 Electron 45.2.1 类型包下复验。


---

## 2.1.8 GitHub 仓库导入、CI 修复与正式 Windows 发布（2026-11-06）

### 仓库与源码基线

- 建立公开仓库：[xiaobei206/NexusMonitor](https://github.com/xiaobei206/NexusMonitor)。
- 将完整 2.1.8 源码树导入 `main`，初始源码导入提交：`b58fada138472b29e2ef5b1d5e67dec3b117435d`。
- 本节记录的是同一应用版本 2.1.8 的锁文件和 CI 发布流程修正；没有改变应用功能或版本号。

### CI 首轮暴露的问题及修复

1. `npm ci` 首次失败：锁文件两处 `brace-expansion` 子依赖指向不存在的 `2.1.8` tarball。实际哈希对应 `2.1.7`。修正版本和下载地址，保留原 integrity；提交 `20a2fb36a75d0aa410e86405698c871cc0100948`。
2. 下一轮依赖安装暴露 `detect-libc@2.1.3` tarball 返回 404。按锁文件中原有 integrity 对应的可用发布版本修正为 `2.1.2`；提交 `5d4c96cf00816f8376ba433b6345c5066c41cb11`。
3. 完整应用编译和测试通过后，发布检查步骤的 PowerShell 原生进程退出码残留导致步骤被错误判失败。将查询结果退出码显式保存并清零；提交 `3b5ea5f92eb2d4677f5130ac6a35995a6c30b0d8`。
4. 第一次 NSIS 打包因 electron-builder 在 CI 自动触发隐式发布、但没有配置其专用 `GH_TOKEN` 而失败。改为 `npm.cmd run package:win -- --publish never`，由后续经过验证的 `gh release create` 步骤统一上传安装包；提交 `6ff189829829b1b16802b276f5ad4784674b4d46`。

### 最终 Windows CI 结果

[最终成功运行：42239092025](https://github.com/xiaobei206/NexusMonitor/actions/runs/42239092025)

- Windows Server 2025 runner；Node 24.22.2、npm 11.19.1、.NET SDK 10.0.403。
- `npm ci`：成功安装 321 个依赖。
- 版本同步检查：14/14 通过，均为 2.1.8。
- `npm.cmd run test:main`：主进程 TypeScript 构建和 Node 回归测试步骤成功。
- `npm.cmd run build:renderer`：Renderer 类型检查和 Vite 生产构建成功。
- PawnIO 官方模块归档 SHA-256 校验成功；提取的 IntelMCHBAR 模块 SHA-256：`3f82b832d99b4aac37d2a20fdb7c9baa2a3bc0488612c9019c9484eb0e8a6eae`。
- .NET HardwareService Release 构建：0 Warning、0 Error。
- `npm.cmd run test:storage`：HardwareService 测试成功。
- Windows x64 NSIS 安装包生成成功，随后生成 SHA-256 并发布 GitHub Release。
- 最终 workflow 所有必需步骤成功；不是仅靠源码扫描或静态语法检查。

### 正式交付物

- Release：[`v2.1.8`](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.1.8)。
- 安装包：`NexusMonitor-2.1.8-Setup.exe`，159,898,662 bytes。
- 安装包 SHA-256：`ee173577851a025b95450422a9ec31c7aebcc9ec556dce9e09d31ad7299426e3`。
- 同一 Release 上传了 `.sha256` 校验文件；Actions 还保留了 30 天的 workflow artifact。

### 验证边界与记录保存

- Hosted Windows CI 已完成构建、自动化测试和安装包制作；但没有连接用户的 Turing COM3、ESP32-P4 5 寸屏或用户实际多屏桌面，不能由 CI 结果推断这些设备的实机表现已验收。
- 本次 NSIS EXE 没有代码签名证书，Windows 可能显示 SmartScreen 或未知发布者提示。
- GitHub Actions 运行页面保留完整 workflow 日志；本文件保留长期开发原因、修复和最终结论。每用户的应用运行日志、设置和设备数据不上传仓库，以免混入个人机器数据。

---

## 2026-11-07 文档一致性整理与跨对话接手入口

复核发现部分辅助文档仍标注 2.0.x，且交接文档把用户机器工作目录写得像通用路径。本轮新增根目录 `START-HERE-NEXT-GPT.md` 和 `AGENTS.md`；README 增加入口；重写安装说明，准确限定插件系统目前是 manifest 清单管理；修订 Turing、HUD、Alder Lake GT 专题的版本/历史表述；同时更新 HANDOFF、构建报告、ZIP 文件尺寸列表和 SHA-256 清单。

该提交只整理文档和交接体系，不修改应用行为、依赖或正式版本号。此前应用完整 Windows 构建与 v2.1.8 发布见 [应用 CI 42239092025](https://github.com/xiaobei206/NexusMonitor/actions/runs/42239092025)；此前文档同步基线 CI [42242756560](https://github.com/xiaobei206/NexusMonitor/actions/runs/42242756560) 已成功。本轮新提交的 workflow 结果必须另行检查，不能用旧运行结果代替。


## 2.2.1（音乐平台重构，2026-11-07 起）

### 初始目标与文档先行

- 以 `main` 的 2.2.0 合并提交 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9` 为稳定基线。
- 新建开发分支 `feature/2.2.1-music-platform`。本阶段优先提交跨对话交接与架构决策文档，避免中断后依赖聊天记录恢复上下文。
- 新增 `NexusMonitor-2.2.1-HANDOFF-CN.md` 与 `docs/MUSIC-PLATFORM-2.2.1-CN.md`，明确音乐服务唯一播放宿主、Nora / NewAmp 分工、六种 USB 输出模式、音频 endpoint 独立路由、格式实际验收与自动化 / 实机验收边界。
- 文档提交后仍未表示任何 2.2.1 应用功能已完成；版本号、源码、测试与 CI 结果必须在相应代码阶段实际变更及验证后更新。不得将 2.2.0 历史 CI 结果用作 2.2.1 通过的证据。
- 代码阶段开始前须复查现有播放器、壁纸音频、显示窗口生命周期、preload / shared types 与源码测试，然后依音乐平台设计文档按小批次实施。当前分支 HEAD 与 Actions 链接须由接手者实时核实。

### 首批代码阶段（2.2.1，2026-11-07）

- `feature/2.2.1-music-platform` 从 `main` 2.2.0 合并提交 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9` 创建；版本已升至 2.2.1，并同步 package / lockfile / `VERSION` / .NET 项目 / API / snapshot / Renderer / 构建入口。
- 新增 `src/main/music-metadata.ts`，使用本地文件解析器读取常用 tag 与内嵌封面；增加合成 MP3 / FLAC / WAV 标签测试。
- 曲库导入扩展到 MP3、WAV、FLAC、OGG、OGA、Opus、M4A、M4B、AAC；新导入歌曲存储标签字段，封面复制到应用自身数据目录，renderer 只通过 track ID 请求 artwork URL。**还没有真实格式解码测试，导入与播放要分开验收。**
- 删除静态 / GIF 壁纸的第二套 audio element，统一使用 Music Service；新增 `music-only` 六模式分支，隐藏 USB output BrowserWindow。
- 新增 `tests/music-metadata.test.cjs` 与 source-level tests；截至本条记录尚未运行 2.2.1 CI，也未创建合并 PR。不能把 2.2.0 的 188/188 与 Windows build 结果说成当前分支通过。
- 下一步：建立 Windows CI feedback loop，修复所有测试 / 编译问题；随后实施输出 endpoint 与完整曲库导航，再推进高级音频。

### 曲库 / 输出设备实现与首轮 Windows CI（2026-11-07）

- 曲库 UI 增加歌曲、专辑、艺术家、流派、文件夹、自定义歌单导航；按标签 / 文件路径分组，分组卡片显示内嵌封面，搜索能按标题 / 艺术家 / 专辑 / 流派过滤。
- 音频输出 endpoint 选择已接入：Chromium 输出选择弹窗、设备列表与 devicechange 刷新、保存设备 ID / 名称、HTMLAudioElement.setSinkId 路由、状态回报和 440 Hz 测试音。设备不可用时保留设定并提示；这不是 WASAPI Exclusive 原生实现，不宣称 bit-perfect。
- 2026-11-07 Windows CI Run #44 **成功**，HEAD `fafbe3e24c9e5127de6608bb72c9cacd3a65aaea`：版本 14/14；Node 主进程测试 195/195；Renderer TypeScript / Vite 生产构建；PawnIO 官方资源；.NET Release build 0 Warning / 0 Error；Storage Tests。PR 阶段按 workflow 设计跳过 NSIS / Release 发布。CI：<https://github.com/xiaobei206/NexusMonitor/actions/runs/42344000038>。
- Hosted CI 不证明实际 codec 文件解码、五寸屏喇叭出声、输出 endpoint 热拔插、WASAPI 独占或 USB 显示器目标机行为成功。
- 后续：继续做音频信号链高级能力与格式验证矩阵；补完成安装包 / Release 的 CI 验收，再安排目标机测试。

### 2.2.1 增强音频功能与 Run #104（2026-11-07）

- EQ / ReplayGain：新增 10-band peaking EQ（31 Hz–16 kHz、±12 dB、默认 flat、lazy AudioContext），以及 ReplayGain Track / Album tags / Peak 解析与 GainNode，Peak safety 限制正向增益；缺 Peak 时仅允许衰减。
- 本地歌词：新增 LRC parser 与同目录同名 sidecar IPC / UI，支持 BOM、毫秒 offset、多时间戳、1 MiB 文件上限；不联网、不上传。
- 播放器 sleep timer：15 / 30 / 45 / 60 / 90 分钟，到点暂停唯一的主 Renderer 音频宿主，不关闭程序或副屏。
- Playlist 文件：新增 M3U/M3U8 parser / serializer，本地相对路径 / Windows absolute path 导入为独立歌单，导出 M3U8 保留本地路径、曲名、艺术家及时长；拒绝网络 URI。
- 共享播放状态增加可见解码错误；MiniPlayer / Dock / Library 显示错误提示。
- Windows CI Run #104 **成功**，HEAD `c8d24d28d353834cc04059eb2637a46ef8d94e78`：版本门禁 14/14，Node tests **210/210**，Renderer TypeScript / Vite production build、PawnIO resource validation、.NET Release build 0 Warning / 0 Error、Storage Tests 全通过。<https://github.com/xiaobei206/NexusMonitor/actions/runs/42348842265>。
- Run #104 之后新增睡眠计时器 / M3U controls CSS 收尾提交 `b3f95d984118f74974f46dc62acde93d69a21908`，须继续运行最终 Windows CI。Run #104 是 PR CI，未构建 / 发布 2.2.1 installer。
- 当前未完成：WASAPI Exclusive native backend、bit-perfect negotiation、Gapless / Crossfade、逐格式实音解码矩阵、目标 PC 输出 endpoint / 五寸屏喇叭和六模式验收。Chromium setSinkId 不能替代 WASAPI Exclusive；Hosted CI 不能证明实机扬声器出声。

### 2.2.1 最终 CI 确认（2026-11-07）

- 最终 PR tip `3152aa5a16b4ff52d0bf026fcd5e1d962cf19f4c` 的 GitHub Actions Windows CI Run #109 **成功**：版本门禁 14/14、Node tests 210/210、Renderer TypeScript / Vite production build、PawnIO resource verification、.NET Release build 0 Warning / 0 Error、Storage Tests 全部成功。<https://github.com/xiaobei206/NexusMonitor/actions/runs/42349148127>
- 此结果覆盖 2.2.1 曲库、音频输出 routing、EQ / ReplayGain、LRC、sleep timer、M3U/M3U8、USB 六模式及最新 CSS / 文档提交。
- PR #2 仍开放，未合并；PR CI 不发布 NSIS installer / GitHub Release。真实 Windows 音频 endpoint、五寸屏扬声器、每种编码播放、USB 设备行为仍需目标机测试。
- 后续开发重点：NewAmp 双 Deck Gapless / Crossfade 设计与 WASAPI Exclusive 原生 backend 评估；不要直接把当前 Chromium setSinkId 说成独占输出或 bit-perfect。

### 2.2.1 EQ 预设与 Run #114（2026-11-07）

- 十段均衡器新增九组预设：平直、摇滚、流行、人声、古典、爵士、电子、低音增强、高音增强；默认平直，手动改频段后显示自定义曲线。
- Windows CI Run #114 **成功**，应用 HEAD `f1019858e17e2c82192e08a2c94709793ce6d1e7`：版本门禁 14/14、Node **211/211**、Renderer TypeScript / Vite、PawnIO 资源校验、.NET Release 0 Warning / 0 Error、Storage Tests 全通过。<https://github.com/xiaobei206/NexusMonitor/actions/runs/42349435741>
- PR #2 保持开放，未合并、未发布 installer。用户目标机的音频设备和副屏验收仍未执行。
- 后续音频研发重点是评估 NewAmp 的 N-API/miniaudio WASAPI exclusive 与 FFmpeg→PCM ring buffer 管线；独占路径需绕过 WebAudio EQ / ReplayGain / Crossfade，只有真实协商格式和设备播放验证通过后才能称为 bit-perfect。Gapless / Crossfade 需要双 Deck / 连续 PCM transport，不应把普通 ended 自动切歌称为 gapless。

### WASAPI Exclusive native backend 接线与 Run #162（2026-11-07）

- 新增主进程 MusicExclusiveOutput singleton 与受信任 IPC：availability / endpoint list / probe-open / start / pause / close / stats / PCM write；只接受主窗口 webContents 的命令；PCM 单块上限 64 KiB，按 stereo float32 8-byte frame 对齐。
- 新增 music-pcm-tap.worklet.js AudioWorklet：普通模式透传到 AudioContext sink；独占模式将普通 sink 输出静音，并把 1024-frame stereo Float32 PCM chunks 送至 main process native ring buffer。
- MusicPlaybackRuntime 接入 WASAPI 开关、端点、sample-rate negotiation；协商 rate 强制匹配 AudioContext.sampleRate，避免 native stream 与 renderer transport 时钟不一致。独占模式 follows play/pause/track switch；关闭 / 运行错误时关闭 native stream、解除 Worklet 静音并恢复普通 output sink。
- Native C++ pause/resume 修正：暂停时执行 IAudioClient::Stop()，恢复时才 Start()；在暂停线程清空 ring 中旧 PCM；Renderer 不再在 audio paused 时继续转发静音块。Native status 每秒读取，UI 展示 format / rate / bufferedBytes / underruns；设备运行错误会 fallback 普通输出。
- 格式标签继续增强：Ogg Vorbis identification / OpusHead / MP4 mp4a / ALAC sample entry 读取 channel / sample-rate；WASAPI 协商能分辨未知声道，不会把“声道未知”随意标为已直通。
- 2.2.0 曲库首启迁移：若旧轨道 record 缺少 2.2.1 channels / ReplayGain / format / artworkPath 等字段，才读取一次本地原文件，补充 metadata / artwork，保留 playlist、currentTrack、volume、currentTime 后回写 music-library.json；后续启动不重复扫文件。该迁移在 Run #162 之后新增，需 Run #164 验证。
- 2026-11-07 Run #162 成功：14/14 version gates；Node tests 224/224；Renderer TypeScript + Vite production build；PawnIO resource validation；.NET Release；Storage Tests 全部成功。
- Run #162 原生编译日志确认为成功：Node 24.22.2、node-gyp 13.1.0、Python 3.15.2、Visual Studio 2026 18.11；gyp 结束 ok，成功生成 native/wasapi-output/build/Release/nexus_wasapi.node。<https://github.com/xiaobei206/NexusMonitor/actions/runs/42353103480>
- Run #162 PR CI 按设计跳过 NSIS / Release。该 hosted build 不验证真实音频端点能否开独占、扬声器是否出声或真实文件 decoder 能力；目标 Windows PC 实机验收待做。
- 当前最新 HEAD 在本记录更新前为 35e4d5e12829e116d8e2a36966436dbbddc90379，对应 Run #164；必须查看 Run #164 的最终状态，确认旧库一次性迁移和其后测试均通过。随后文档更新会触发另一次 CI。
- bit-perfect 边界：目前传输路径依旧是 Chromium/WebAudio decode → Float32 PCM → WASAPI native; status/UI 固定 bitPerfect:false。设备支持源 sample-rate/depth 只能称为 format-match candidate；不宣传 bit-perfect。
- 下阶段：先把最新 CI 绿灯跑完整；接着合并 PR #2 由 main workflow 产出 2.2.1 installer + SHA sidecar，再请用户在本机核实 5 寸屏端点与六模式。Gapless / Crossfade 双 Deck 后续开发，不把 ended 后自动切歌称为 gapless。


## 2.2.1 正式发布收口（2026-11-07）

- 用户偏好明确为个人项目直接在 `main` 开发；不再为常规功能迭代创建功能分支或 PR。PR #2 已合并；历史分支 `feature/2.2.1-music-platform` 在合并时的文件树 SHA 与 main 一致，但仍作为历史 ref 留存，不作为新工作入口。
- 正式应用代码提交：`9de1e9db2f700fa69326792b990cef4a57a56d1d`；`VERSION=2.2.1`。
- Windows CI Run #175 成功：[workflow run](https://github.com/xiaobei206/NexusMonitor/actions/runs/42354102069)。版本门禁 14/14；Node 主进程测试 225/225（0 failed）；Renderer TypeScript / Vite、WASAPI N-API addon、PawnIO 官方资源校验、.NET Release、Storage Tests、NSIS 安装包、SHA-256、GitHub Release 与 workflow artifact 均成功。
- 正式 Release：[v2.2.1](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.1)。安装包 `NexusMonitor-2.2.1-Setup.exe`，160,009,308 bytes；SHA-256 `1fafefc129308aaa72664699d2796c2818c5237bae6092b7c3b56a7b06351596`。未配置代码签名证书，因此安装包未签名。
- MSVC 日志中存在非致命的 `NOMINMAX` 重定义、C++20 参数被覆盖为 C++17；Node 也报告 `DEP0190` shell 参数弃用提示。它们没有导致 CI 失败，可在下一正式版本中单独清理。
- 2.2.1 不宣称完成 Gapless / Crossfade 双 Deck、native decoder-to-device bit-perfect、全部 codec profile 实际播放矩阵。WASAPI 当前为 Chromium/WebAudio Float32 PCM → native WASAPI，`bitPerfect:false`。
- 真实 Windows 目标机仍需验证五寸屏扬声器、应用/系统 endpoint 分流、热插拔、WASAPI 独占下其他程序音频、长时间 underrun、支持格式真实文件播放、六种 USB 模式、桌面壁纸不被遮挡、睡眠 / 唤醒与 COM3 Turing 长期稳定性。Hosted CI 不替代这些实机验收。


## 2.2.2（WASAPI mono / WAVEFORMATEX 兼容与 USB 动作文案，2026-11-07）

### 用户反馈与目标

- P4 Mono UAC Direct v62 在 2.2.1 下报错：`No supported stereo exclusive PCM format was reported`。2.2.1 只探测双声道 `WAVEFORMATEXTENSIBLE`，不能据此判断单声道 endpoint 完全不支持独占。
- USB 五寸副屏 `music-only` 模式的主按钮文案过长，改为「应用模式」；其它可视副屏模式保持「启动副屏」。

### 本轮实现

- native WASAPI 同时探测单声道 / 双声道 PCM。
- 每个格式组合同时尝试传统 `WAVEFORMATEX` 和 `WAVEFORMATEXTENSIBLE`。
- Probe 额外读取 Windows shared mix format 的声道数与采样率，并返回候选数量、两种结构的命中数量与 HRESULT 诊断。
- 实际 `IAudioClient::Initialize` 也有 classic `WAVEFORMATEX` 回退，避免只在探测时宣称支持、实际打开仍失败。
- Stereo endpoint 优先；只有无可用 stereo 候选时才选择 mono。
- Renderer 保持 stereo Float32 PCM transport；native 输出按最终协商声道数配置格式、channel mask、block alignment、ring-buffer frame size，并对 mono endpoint 执行 `(L+R)/2`。
- WASAPI 状态显示实际 mono/stereo；发生 channel downmix 时不宣称 bit-perfect。
- 新增 mono format chooser 与 native source regression；新增 USB music-only 按钮文案回归。

### 版本与验证

- 正式版本递增至 2.2.2；同步 VERSION、package / lockfile、HardwareService assembly/API/snapshot、Renderer 版本字段、版本化 build/release 入口和版本校验门禁。
- 本节的 Hosted Windows CI / 安装包结果在本轮构建完成后追加。用户目标机的真实 P4 扬声器输出、Windows 系统其它应用音频隔离、热插拔与长时间稳定性不能由 Hosted CI 推断。


### 2.2.2 最终 Windows CI 与正式发布收口（2026-11-07）

- 个人仓库默认开发方式确认为直接在 `main` 工作，不再创建功能分支或 PR。
- 应用代码提交：`99e76745ae978ae3e0dd8dc9eaefa6785dadb022`；`VERSION=2.2.2`。
- 第一次 Run #177 发现 TypeScript 模板字面量转义错误（TS1127/TS1134），修正为普通字符串拼接后继续。
- Run #178 又暴露 3 个旧源码回归合同与格式写法不一致、以及 App.tsx 版本同步覆盖按钮修改的问题；恢复项目惯用源码格式、调整测试 matcher，并再次修正实际按钮文案。
- **最终 Run #179 全部成功：** [Windows CI](https://github.com/xiaobei206/NexusMonitor/actions/runs/42357228488)。版本门禁 14/14；Node 主进程 234/234（0 failed / 0 cancelled / 0 skipped）；Renderer TypeScript + Vite；Windows N-API WASAPI native addon；PawnIO 官方资源 SHA 验证；.NET Release；Hardware / Storage Tests；NSIS x64；SHA-256；GitHub Release 与 workflow artifact 均成功。
- 正式 Release：[v2.2.2](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.2)。安装包 `NexusMonitor-2.2.2-Setup.exe`，160,011,997 bytes；SHA-256 `4622fae70bc5a0b9770ab90c40c8de964b6f5f0f0f442b33fc829e54d4b2bc03`。无代码签名证书，安装包未签名。
- 非 bit-perfect 约束不变：Renderer stereo Float32 -> native mono downmix 时明确发生 channel conversion；当前整个 WASAPI 路径继续标记 bitPerfect=false。
- P4 Mono UAC Direct v62 的实际扬声器出声、系统其它应用音频隔离、端点拔插、默认设备变化、独占期间系统声音与长时间 underrun 仍需用户 Windows 目标机实测。真实文件 codec / seek 矩阵与六模式 / 桌面壁纸 / 睡眠唤醒 / COM3 长时间运行也不能由 Hosted CI 推断。



### 2.2.3 — P4 实机反馈与自动歌词（2026-11-07，CI 待验证）

- 用户实测 2.2.2：P4 Mono UAC Direct v62 能打开 WASAPI endpoint（mono/S16/48 kHz），但开启后无声；关闭独占后未及时恢复，后来声音回到 Windows 默认设备。此反馈证明 2.2.2 仅完成 endpoint open 不能算实际播放验收。
- PCM tap 新增独立 `muteOutput` 状态。开始独占时仍把 PCM 送给 native，但共享音频继续可听；只有 native `acceptedBytes > 0` 且 `framesRendered > 0` 后才静音共享输出。
- 如果正在播放且打开后 2.5 秒仍无已接受 PCM / 已渲染帧，则关闭 WASAPI、取消 tap 独占状态并恢复普通 AudioContext/output sink/HTMLAudioElement 播放。
- 独占关闭、open 失败、native runtime error 都走统一恢复逻辑；状态文字区分 endpoint opened 与 PCM stream confirmed。
- 自动歌词：优先读取同名本地 LRC；否则通过 LRCLIB 查询 metadata-only signature/search。优先同步 LRC，纯文本歌词以可滚动静态文本显示；未命中/离线/超时/429 不影响播放。内存缓存命中 24h、未命中 10min、最多 300 首。只发送曲名/艺术家/专辑/时长，不发送路径或音频。
- 新增 provider mocked-fetch tests 与 PCM tap fallback/source tests。
- 本轮正式版本递增为 2.2.3；最终 CI / Release 结果需在运行后追加。实机出声仍必须由用户验收。
