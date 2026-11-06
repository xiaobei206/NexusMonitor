# NexusMonitor Plugin Contract (2.0)

The current 2.0 preview implements local manifest discovery, import, and enable/disable state. It deliberately does not execute arbitrary third-party JavaScript.

A manifest is a UTF-8 JSON file named `plugin.json`:

```json
{
  "id": "vendor.extension-id",
  "name": "Example extension",
  "version": "1.0.0",
  "description": "What the extension adds",
  "author": "Vendor",
  "type": "theme-pack",
  "minAppVersion": "2.0.0",
  "capabilities": ["theme.tokens", "theme.layout"],
  "entry": null
}
```

Rules:
- `id` must match `^[a-z0-9][a-z0-9.-]{1,63}$`.
- `name` and `version` are required strings.
- A plugin is inert metadata unless a future trusted provider adapter explicitly supports its declared type.
- No plugin receives Node.js, filesystem, process, or arbitrary IPC access from the renderer.

Planned provider contracts:
- `sensor-provider`: out-of-process JSON source, schema-validated by the hardware host.
- `dashboard-widget`: declarative read-only cards and supported metric bindings.
- `theme-pack`: CSS tokens, layouts, fonts and image resources.
- `output-adapter`: controlled output to Turing LCD or other supported displays.
