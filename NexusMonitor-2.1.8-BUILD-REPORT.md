# Build Report — NexusMonitor 2.1.8

## 修复范围

- `src/main/index.ts`：将 `console-message` 监听参数修正为 Electron 45.2.1 的位置参数 `(event, level, message, line, sourceId)`。2.1.7 将第二个参数（number）误当成 details 对象，导致 4 个 TS2339。
- 保留 2.1.7 的主窗口首帧门控、Renderer Error Boundary、旧设置容错、默认启动 HUD，以及 2.1.6 USB 副屏负坐标定位。
- 新增 `tests/electron-console-message-signature.test.cjs`，防止未来再次把 Electron 45 的事件签名改成新版 details-object 形式。

## 本轮已执行检查

- `NexusMonitor-2.1.8-BUILD-RELEASE.cjs --validate-only`：14/14 版本一致性检查通过。
- `tests/electron-console-message-signature.test.cjs`、`tests/version-consistency.test.cjs`：4/4 通过。
- `tsconfig.test-utils.json`：使用容器全局 TypeScript 5.8.3 编译通过。
- 24 个非声明 TS/TSX/MTS/CTS 源文件 transpile 语法检查：0 diagnostics。
- `node --test`：172 项中 168 项通过；4 项未能加载 `dist-electron/main/{api-error,logger,service-backoff,snapshot-coordinator}.js`，因为当前容器没有执行 Electron 主进程构建。它们不是通过项。
- 使用 `npm ci --ignore-scripts` 尝试拉取完整依赖时容器网络请求超时；因此未声称 `tsc -p tsconfig.electron.json`、Renderer/Vite、.NET Release、NSIS 或 Windows 实机验收通过。

## Windows 必须执行

用户 Windows 环境运行 `npm.cmd ci --include=dev --no-audit --no-fund` 后执行版本验证和正式构建脚本。首先确认 `tsc -p tsconfig.electron.json` 不再报告 `src/main/index.ts` 第 733 行的 TS2339，再继续 Renderer、.NET、存储测试和 NSIS。


---

## GitHub Actions Windows 2025 最终验证补充（2026-11-06）

本节记录完整 Windows CI 的实际结果，**覆盖本报告初稿中“Windows 必须执行”部分的未验证状态**。初稿描述的是容器内当时无法安装 Windows/.NET 依赖的情况，不代表后续远程 Windows 构建结果。

成功运行：[Actions run 42239092025](https://github.com/xiaobei206/NexusMonitor/actions/runs/42239092025)  
验证提交：`6ff189829829b1b16802b276f5ad4784674b4d46`

| 检查项 | 结果 |
|---|---|
| Windows Server 2025 / Node 24.22.2 / .NET SDK 10.0.403 | 通过 |
| `npm ci`（321 个依赖） | 通过 |
| 14 项版本一致性 | 14/14 通过，均为 2.1.8 |
| `npm.cmd run test:main` | 通过 |
| `npm.cmd run build:renderer` | 通过 |
| 官方 PawnIO 模块 SHA-256 校验 | 通过 |
| HardwareService Release 编译 | 通过，0 Warning / 0 Error |
| `npm.cmd run test:storage` | 通过 |
| NSIS x64 安装包生成 | 通过 |
| 安装包 SHA-256 文件生成 | 通过 |
| GitHub Release / workflow artifact 上传 | 通过 |

### 发布产物

- Release：[`v2.1.8`](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.1.8)
- 文件：`NexusMonitor-2.1.8-Setup.exe`
- 大小：159,898,662 bytes
- SHA-256：`ee173577851a025b95450422a9ec31c7aebcc9ec556dce9e09d31ad7299426e3`
- 未配置代码签名证书；安装包未签名。

### 未由 CI 覆盖的验收

COM3 Turing 3.5 英寸屏持续刷新、ESP32-P4 5 英寸 USB 显示器边界、多屏负坐标、首次真实 GUI 冷启动/HUD 展开、设备拔插与长期运行，必须在用户实际 Windows 机器和硬件上验证。CI 通过不等于这些实机项目已通过。

---

## 文档交接入口同步（2026-11-07）

新增根目录 `START-HERE-NEXT-GPT.md` 与 `AGENTS.md`，并将安装、插件清单、Turing 天气时钟、HUD 与 Alder Lake GT 专题文档对照当前源码整理。该整理不修改应用代码或 v2.1.8 安装包，也不改变本报告已有的应用构建结论。

新接手者从 [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md) 开始；后续验证以当前 workflow 和最新 Actions 为准。此次文档提交触发的新 CI 需要单独检查。
