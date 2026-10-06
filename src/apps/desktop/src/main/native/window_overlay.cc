#include <napi.h>
#include <windows.h>
#include <string>

static WNDPROC ElectronOriginalWndProc = nullptr;
static HWND g_OverlayHwnd = nullptr;
static HWINEVENTHOOK g_EventHook = nullptr;
static HHOOK g_KeyboardHook = nullptr;
static Napi::ThreadSafeFunction g_KeyCallback;
static bool g_InterceptKeyboard = false;

// Converte wstring (UTF-16) para string (UTF-8) com fidelidade completa a caracteres acentuados
std::string Utf16ToUtf8(const std::wstring& wstr) {
    if (wstr.empty()) return "";
    int utf8Length = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), NULL, 0, NULL, NULL);
    if (utf8Length <= 0) return "";
    std::string utf8(utf8Length, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), &utf8[0], utf8Length, NULL, NULL);
    return utf8;
}

void ReassertTopmost(HWND hwnd) {
    if (hwnd && IsWindow(hwnd)) {
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                     SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
    }
}

VOID CALLBACK WinEventProc(
    HWINEVENTHOOK hWinEventHook,
    DWORD event,
    HWND hwnd,
    LONG idObject,
    LONG idChild,
    DWORD dwEventThread,
    DWORD dwmsEventTime
) {
    if (event == EVENT_SYSTEM_FOREGROUND && g_OverlayHwnd) {
        if (hwnd != g_OverlayHwnd) {
            ReassertTopmost(g_OverlayHwnd);
        }
    }
}

// Verifica se a tecla é tecla de controle do sistema ou atalho essencial do SO
bool IsSystemKeyOrShortcut(DWORD vkCode) {
    // Tecla Windows (esquerda e direita)
    if (vkCode == VK_LWIN || vkCode == VK_RWIN || vkCode == VK_APPS ||
        vkCode == VK_CANCEL || vkCode == VK_SNAPSHOT) {
        return true;
    }

    // Atalhos do SO com tecla ALT (ex: Alt+Tab, Alt+Esc, Alt+Space, Alt+F4)
    bool altDown = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
    if (altDown) {
        if (vkCode == VK_TAB || vkCode == VK_ESCAPE || vkCode == VK_SPACE ||
            vkCode == VK_F4 || vkCode == VK_MENU) {
            return true;
        }
    }

    // Tecla ESC isolada ou atalhos do SO com Ctrl
    bool ctrlDown = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
    if (ctrlDown && (vkCode == VK_ESCAPE || vkCode == VK_CONTROL)) {
        return true;
    }

    // Teclas modificadoras puras (não devem ser consumidas sozinhas)
    if (vkCode == VK_SHIFT || vkCode == VK_LSHIFT || vkCode == VK_RSHIFT ||
        vkCode == VK_CONTROL || vkCode == VK_LCONTROL || vkCode == VK_RCONTROL ||
        vkCode == VK_MENU || vkCode == VK_LMENU || vkCode == VK_RMENU) {
        return true;
    }

    return false;
}

// Hook de Teclado Global de Baixo Nível com escopo estrito
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION && g_InterceptKeyboard) {
        KBDLLHOOKSTRUCT* pKbd = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);

        if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN) {
            DWORD vkCode = pKbd->vkCode;

            // Se for atalho do sistema ou tecla essencial, NÃO engole e deixa passar adiante
            if (IsSystemKeyOrShortcut(vkCode)) {
                return CallNextHookEx(g_KeyboardHook, nCode, wParam, lParam);
            }

            // Converte o código virtual para caractere
            BYTE keyboardState[256];
            GetKeyboardState(keyboardState);

            // Ajusta o estado das teclas modificadoras no momento do hook
            keyboardState[VK_SHIFT] = (GetAsyncKeyState(VK_SHIFT) & 0x8000) ? 0x80 : 0;
            keyboardState[VK_CONTROL] = (GetAsyncKeyState(VK_CONTROL) & 0x8000) ? 0x80 : 0;
            keyboardState[VK_MENU] = (GetAsyncKeyState(VK_MENU) & 0x8000) ? 0x80 : 0;
            keyboardState[VK_CAPITAL] = (GetKeyState(VK_CAPITAL) & 0x0001) ? 0x01 : 0;

            WCHAR unicodeChar[4] = {0};
            int result = ToUnicode(vkCode, pKbd->scanCode, keyboardState, unicodeChar, 2, 0);

            std::wstring charStr = (result > 0) ? std::wstring(unicodeChar, result) : L"";

            // Dispara para o processo do Node/Electron via ThreadSafeFunction
            if (g_KeyCallback) {
                std::string utf8Char = Utf16ToUtf8(charStr);
                auto callback = [vkCode, utf8Char](Napi::Env env, Napi::Function jsCallback) {
                    Napi::Object obj = Napi::Object::New(env);
                    obj.Set("vkCode", Napi::Number::New(env, vkCode));
                    obj.Set("key", Napi::String::New(env, utf8Char));
                    jsCallback.Call({ obj });
                };
                g_KeyCallback.NonBlockingCall(callback);
            }

            // Retorna 1 para engolir apenas a tecla capturada da aplicação
            return 1;
        } else if (wParam == WM_KEYUP || wParam == WM_SYSKEYUP) {
            DWORD vkCode = pKbd->vkCode;
            if (IsSystemKeyOrShortcut(vkCode)) {
                return CallNextHookEx(g_KeyboardHook, nCode, wParam, lParam);
            }
            return 1;
        }
    }
    return CallNextHookEx(g_KeyboardHook, nCode, wParam, lParam);
}

LRESULT CALLBACK MrTickCustomWndProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {
        case WM_MOUSEACTIVATE:
            return MA_NOACTIVATE;

        case WM_WINDOWPOSCHANGING: {
            WINDOWPOS* pWinPos = reinterpret_cast<WINDOWPOS*>(lParam);
            pWinPos->flags |= SWP_NOACTIVATE;
            break;
        }
    }
    if (ElectronOriginalWndProc) {
        return CallWindowProc(ElectronOriginalWndProc, hwnd, uMsg, wParam, lParam);
    }
    return DefWindowProc(hwnd, uMsg, wParam, lParam);
}

void InternalRemoveOverlayStyles(HWND hwnd) {
    if (hwnd && IsWindow(hwnd)) {
        if (ElectronOriginalWndProc) {
            SetWindowLongPtr(hwnd, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(ElectronOriginalWndProc));
            ElectronOriginalWndProc = nullptr;
        }
    } else {
        ElectronOriginalWndProc = nullptr;
    }
    if (g_OverlayHwnd == hwnd) {
        g_OverlayHwnd = nullptr;
    }
}

void InternalCleanupHooks() {
    if (g_KeyboardHook) {
        UnhookWindowsHookEx(g_KeyboardHook);
        g_KeyboardHook = nullptr;
    }
    if (g_EventHook) {
        UnhookWinEvent(g_EventHook);
        g_EventHook = nullptr;
    }
    g_InterceptKeyboard = false;
}

Napi::Value ApplyOverlayStyles(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Buffer HWND esperado").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Buffer<void*> buffer = info[0].As<Napi::Buffer<void*>>();
    HWND hwnd = *reinterpret_cast<HWND*>(buffer.Data());

    if (!hwnd || !IsWindow(hwnd)) {
        return Napi::Boolean::New(env, false);
    }

    // Se já havia uma janela anterior, restaura seu WndProc para evitar conflito
    if (g_OverlayHwnd && g_OverlayHwnd != hwnd) {
        InternalRemoveOverlayStyles(g_OverlayHwnd);
    }

    g_OverlayHwnd = hwnd;

    LONG_PTR styles = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
    styles |= (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST);
    SetWindowLongPtr(hwnd, GWL_EXSTYLE, styles);

    ReassertTopmost(hwnd);

    // Subclass seguro com gravação do WndProc anterior
    if (!ElectronOriginalWndProc) {
        ElectronOriginalWndProc = reinterpret_cast<WNDPROC>(
            SetWindowLongPtr(hwnd, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(MrTickCustomWndProc))
        );
    }

    if (!g_EventHook) {
        g_EventHook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            NULL,
            WinEventProc,
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
        );
    }

    if (!g_KeyboardHook) {
        g_KeyboardHook = SetWindowsHookEx(
            WH_KEYBOARD_LL,
            LowLevelKeyboardProc,
            GetModuleHandle(NULL),
            0
        );
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value RemoveOverlayStyles(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        if (g_OverlayHwnd) {
            InternalRemoveOverlayStyles(g_OverlayHwnd);
        }
        return env.Null();
    }

    Napi::Buffer<void*> buffer = info[0].As<Napi::Buffer<void*>>();
    HWND hwnd = *reinterpret_cast<HWND*>(buffer.Data());
    InternalRemoveOverlayStyles(hwnd);
    return env.Null();
}

Napi::Value CleanupOverlay(const Napi::CallbackInfo& info) {
    if (g_OverlayHwnd) {
        InternalRemoveOverlayStyles(g_OverlayHwnd);
    }
    InternalCleanupHooks();
    return info.Env().Null();
}

Napi::Value IsKeyboardInterceptionActive(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), g_InterceptKeyboard);
}

Napi::Value SetKeyEventListener(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() > 0 && info[0].IsFunction()) {
        g_KeyCallback = Napi::ThreadSafeFunction::New(
            env,
            info[0].As<Napi::Function>(),
            "KeyEventListener",
            0,
            1
        );
    }
    return env.Null();
}

Napi::Value StartKeyboardInterception(const Napi::CallbackInfo& info) {
    g_InterceptKeyboard = true;
    return info.Env().Null();
}

Napi::Value StopKeyboardInterception(const Napi::CallbackInfo& info) {
    g_InterceptKeyboard = false;
    return info.Env().Null();
}

Napi::Value ForceTopmost(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (g_OverlayHwnd) {
        ReassertTopmost(g_OverlayHwnd);
    }
    return env.Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "applyOverlayStyles"), Napi::Function::New(env, ApplyOverlayStyles));
    exports.Set(Napi::String::New(env, "removeOverlayStyles"), Napi::Function::New(env, RemoveOverlayStyles));
    exports.Set(Napi::String::New(env, "cleanupOverlay"), Napi::Function::New(env, CleanupOverlay));
    exports.Set(Napi::String::New(env, "isKeyboardInterceptionActive"), Napi::Function::New(env, IsKeyboardInterceptionActive));
    exports.Set(Napi::String::New(env, "setKeyEventListener"), Napi::Function::New(env, SetKeyEventListener));
    exports.Set(Napi::String::New(env, "startKeyboardInterception"), Napi::Function::New(env, StartKeyboardInterception));
    exports.Set(Napi::String::New(env, "stopKeyboardInterception"), Napi::Function::New(env, StopKeyboardInterception));
    exports.Set(Napi::String::New(env, "forceTopmost"), Napi::Function::New(env, ForceTopmost));
    return exports;
}

NODE_API_MODULE(window_overlay, Init)