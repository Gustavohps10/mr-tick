#include <windows.h>
#include <delayimp.h>
#include <string.h>

static FARPROC WINAPI load_exe_hook(unsigned int event, DelayLoadInfo* info) {
  if (event != dliNotePreLoadLibrary)
    return NULL;

  if (_stricmp(info->szDll, "node.exe") != 0)
    return NULL;

  return (FARPROC) GetModuleHandle(NULL);
}

extern "C" PfnDliHook __pfnDliNotifyHook2 = load_exe_hook;
