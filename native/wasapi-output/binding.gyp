{
  "targets": [
    {
      "target_name": "nexus_wasapi",
      "sources": ["binding.cpp"],
      "defines": ["NAPI_VERSION=8", "WIN32_LEAN_AND_MEAN", "NOMINMAX"],
      "libraries": ["ole32.lib", "propsys.lib", "uuid.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": ["/std:c++17"],
          "ExceptionHandling": 1
        }
      },
      "win_delay_load_hook": "true"
    }
  ]
}
