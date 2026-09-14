{
  "targets": [
    {
      "target_name": "window_overlay",
      "sources": [ "src/main/native/window_overlay.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
    },
    {
      "target_name": "updater",
      "type": "executable",
      "sources": [
        "src/main/native/updater.cpp",
        "src/main/native/updater.rc"
      ],
      "libraries": [
        "-lcomctl32.lib",
        "-luser32.lib",
        "-lgdi32.lib",
        "-lshell32.lib"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": ["/std:c++17", "/EHsc"]
        },
        "VCLinkerTool": {
          "SubSystem": "2"
        }
      }
    }
  ]
}