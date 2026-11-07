# NexusMonitor 插件清单约定（2.1.8）

## 当前实现

当前版本只实现基于 manifest 的本地扩展清单管理：发现/导入 `plugin.json`、显示元数据、管理启用状态。**不会执行任意第三方 JavaScript**，也不会将 Node.js、任意文件系统、进程或任意 IPC 暴露给插件。可执行沙箱和第三方硬件 Provider SDK 属于未来方向，并非当前已实现功能。

插件目录位于用户 NexusMonitor 配置目录下的 `plugins` 子目录。校验、加载和启停细节以当前主进程、preload、Renderer 代码与测试为准。

## 实际 Manifest 样例

`plugins/example-theme/plugin.json`：

```json
{
  "id": "example-theme-pack",
  "name": "Example Theme Pack",
  "version": "1.0.0",
  "description": "A manifest-only example showing how a NexusMonitor extension is declared.",
  "author": "NexusMonitor",
  "type": "theme-pack",
  "minAppVersion": "2.0.0",
  "capabilities": ["theme.tokens", "theme.layout"],
  "entry": null
}
```

`id` 应稳定且唯一，使用小写字母、数字、点和连字符；名称、版本、描述、作者、类型、最低应用版本、能力与 entry 是清单元数据。声明主题能力不代表当前已实现主题 Provider，也不能注入 CSS/JavaScript。不得因清单含有 provider/entry 字段就执行对应代码。

未来可单独设计受 schema 校验的 sensor-provider、声明式只读 dashboard-widget、受控 theme-pack 和 output-adapter。相应实现与测试合并前，均属规划，不能写成已可用 API。
