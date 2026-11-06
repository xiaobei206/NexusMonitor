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
