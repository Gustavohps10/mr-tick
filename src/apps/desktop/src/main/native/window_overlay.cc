#include <napi.h>
#include <windows.h>

static WNDPROC ElectronOriginalWndProc = nullptr;
static HWND g_OverlayHwnd = nullptr;
static HWINEVENTHOOK g_EventHook = nullptr;
static HHOOK g_KeyboardHook = nullptr;
static Napi::ThreadSafeFunction g_KeyCallback;
static bool g_InterceptKeyboard = false;

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

// Hook de Teclado Global de Baixo Nível
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION && g_InterceptKeyboard) {
        KBDLLHOOKSTRUCT* pKbd = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);

        if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN) {
            DWORD vkCode = pKbd->vkCode;

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
                auto callback = [vkCode, charStr](Napi::Env env, Napi::Function jsCallback) {
                    Napi::Object obj = Napi::Object::New(env);
                    obj.Set("vkCode", Napi::Number::New(env, vkCode));
                    std::string utf8Char(charStr.begin(), charStr.end());
                    obj.Set("key", Napi::String::New(env, utf8Char));
                    jsCallback.Call({ obj });
                };
                g_KeyCallback.NonBlockingCall(callback);
            }

            // Retorna 1 para engolir a tecla e não enviar para o app de fundo
            return 1;
        } else if (wParam == WM_KEYUP || wParam == WM_SYSKEYUP) {
            // Também consome o keyup para não desincronizar o estado de teclas na janela de trás
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
    return CallWindowProc(ElectronOriginalWndProc, hwnd, uMsg, wParam, lParam);
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

    g_OverlayHwnd = hwnd;

    LONG_PTR styles = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
    styles |= (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST);
    SetWindowLongPtr(hwnd, GWL_EXSTYLE, styles);

    ReassertTopmost(hwnd);

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
    exports.Set(Napi::String::New(env, "setKeyEventListener"), Napi::Function::New(env, SetKeyEventListener));
    exports.Set(Napi::String::New(env, "startKeyboardInterception"), Napi::Function::New(env, StartKeyboardInterception));
    exports.Set(Napi::String::New(env, "stopKeyboardInterception"), Napi::Function::New(env, StopKeyboardInterception));
    exports.Set(Napi::String::New(env, "forceTopmost"), Napi::Function::New(env, ForceTopmost));
    return exports;
}

NODE_API_MODULE(window_overlay, Init)