#define _WIN32_WINNT 0x0601
#include <windows.h>
#include <iostream>
#include <string>
#include <vector>
#include <sstream>

#ifndef MOUSEEVENTF_VIRTUALDESK
#define MOUSEEVENTF_VIRTUALDESK 0x4000
#endif

#ifndef PROCESSOR_ARCHITECTURE_ARM64
#define PROCESSOR_ARCHITECTURE_ARM64 12
#endif

#ifndef DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
DECLARE_HANDLE(DPI_AWARENESS_CONTEXT);
#define DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 ((DPI_AWARENESS_CONTEXT)-4)
#endif

#ifndef MDT_EFFECTIVE_DPI
typedef enum MONITOR_DPI_TYPE {
    MDT_EFFECTIVE_DPI = 0,
    MDT_ANGULAR_DPI = 1,
    MDT_RAW_DPI = 2,
    MDT_DEFAULT = MDT_EFFECTIVE_DPI
} MONITOR_DPI_TYPE;
#endif

typedef UINT (WINAPI *GetDpiForWindowFn)(HWND hwnd);
typedef HRESULT (WINAPI *GetDpiForMonitorFn)(HMONITOR hmonitor, MONITOR_DPI_TYPE dpiType, UINT *dpiX, UINT *dpiY);
typedef BOOL (WINAPI *SetProcessDpiAwarenessContextFn)(DPI_AWARENESS_CONTEXT value);
typedef BOOL (WINAPI *SetProcessDPIAwareFn)(void);

static GetDpiForWindowFn pfnGetDpiForWindow = nullptr;
static GetDpiForMonitorFn pfnGetDpiForMonitor = nullptr;
static SetProcessDpiAwarenessContextFn pfnSetProcessDpiAwarenessContext = nullptr;
static SetProcessDPIAwareFn pfnSetProcessDPIAware = nullptr;

struct NativeEventRecord {
    std::string type;
    int x;
    int y;
    int screenX;
    int screenY;
    DWORD timestamp;
    DWORD vkCode;
    bool ctrl;
    bool alt;
    bool shift;
};

static CRITICAL_SECTION g_EventsLock;
static std::vector<NativeEventRecord> g_ReceivedEvents;
static HWND g_TestHwnd = nullptr;
static volatile bool g_Running = true;
static DWORD g_MessageThreadId = 0;
static HANDLE g_ThreadReadyEvent = NULL;

#define WM_USER_CREATE_WINDOW (WM_USER + 101)
#define WM_USER_DESTROY_WINDOW (WM_USER + 102)

struct CreateWindowParams {
    int x;
    int y;
    int width;
    int height;
    std::string title;
    bool show;
    HANDLE hDoneEvent;
};

void InitDpiApis() {
    InitializeCriticalSection(&g_EventsLock);
    g_ThreadReadyEvent = CreateEvent(NULL, FALSE, FALSE, NULL);

    HMODULE hUser32 = GetModuleHandleA("user32.dll");
    if (hUser32) {
        pfnGetDpiForWindow = (GetDpiForWindowFn)GetProcAddress(hUser32, "GetDpiForWindow");
        pfnSetProcessDpiAwarenessContext = (SetProcessDpiAwarenessContextFn)GetProcAddress(hUser32, "SetProcessDpiAwarenessContext");
        pfnSetProcessDPIAware = (SetProcessDPIAwareFn)GetProcAddress(hUser32, "SetProcessDPIAware");
    }
    HMODULE hShcore = LoadLibraryA("shcore.dll");
    if (hShcore) {
        pfnGetDpiForMonitor = (GetDpiForMonitorFn)GetProcAddress(hShcore, "GetDpiForMonitor");
    }

    if (pfnSetProcessDpiAwarenessContext) {
        pfnSetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    } else if (pfnSetProcessDPIAware) {
        pfnSetProcessDPIAware();
    }
}

UINT GetWindowDpi(HWND hwnd) {
    if (pfnGetDpiForWindow && hwnd && IsWindow(hwnd)) {
        return pfnGetDpiForWindow(hwnd);
    }
    HDC hdc = GetDC(hwnd);
    if (hdc) {
        UINT dpi = (UINT)GetDeviceCaps(hdc, LOGPIXELSX);
        ReleaseDC(hwnd, hdc);
        return dpi;
    }
    return 96;
}

UINT GetMonitorDpi(HMONITOR hMon) {
    if (pfnGetDpiForMonitor && hMon) {
        UINT dpiX = 96, dpiY = 96;
        if (SUCCEEDED(pfnGetDpiForMonitor(hMon, MDT_EFFECTIVE_DPI, &dpiX, &dpiY))) {
            return dpiX;
        }
    }
    return 96;
}

void RecordEvent(const std::string& type, int x, int y, DWORD vk = 0) {
    POINT pt = { x, y };
    if (g_TestHwnd && IsWindow(g_TestHwnd)) {
        ClientToScreen(g_TestHwnd, &pt);
    }

    NativeEventRecord ev;
    ev.type = type;
    ev.x = x;
    ev.y = y;
    ev.screenX = pt.x;
    ev.screenY = pt.y;
    ev.timestamp = GetTickCount();
    ev.vkCode = vk;
    ev.ctrl = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
    ev.alt = (GetKeyState(VK_MENU) & 0x8000) != 0;
    ev.shift = (GetKeyState(VK_SHIFT) & 0x8000) != 0;

    EnterCriticalSection(&g_EventsLock);
    g_ReceivedEvents.push_back(ev);
    LeaveCriticalSection(&g_EventsLock);
}

static std::vector<DWORD> g_AllMsgCodes;

LRESULT CALLBACK TestWndProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    EnterCriticalSection(&g_EventsLock);
    g_AllMsgCodes.push_back((DWORD)uMsg);
    LeaveCriticalSection(&g_EventsLock);

    switch (uMsg) {
        case WM_LBUTTONDOWN:
            RecordEvent("lbuttondown", (short)LOWORD(lParam), (short)HIWORD(lParam));
            return 0;
        case WM_LBUTTONUP:
            RecordEvent("lbuttonup", (short)LOWORD(lParam), (short)HIWORD(lParam));
            return 0;
        case WM_RBUTTONDOWN:
            RecordEvent("rbuttondown", (short)LOWORD(lParam), (short)HIWORD(lParam));
            return 0;
        case WM_RBUTTONUP:
            RecordEvent("rbuttonup", (short)LOWORD(lParam), (short)HIWORD(lParam));
            return 0;
        case WM_MOUSEMOVE:
            RecordEvent("mousemove", (short)LOWORD(lParam), (short)HIWORD(lParam));
            return 0;
        case WM_KEYDOWN:
            RecordEvent("keydown", 0, 0, (DWORD)wParam);
            return 0;
        case WM_KEYUP:
            RecordEvent("keyup", 0, 0, (DWORD)wParam);
            return 0;
        case WM_SYSKEYDOWN:
            RecordEvent("syskeydown", 0, 0, (DWORD)wParam);
            return 0;
        case WM_SYSKEYUP:
            RecordEvent("syskeyup", 0, 0, (DWORD)wParam);
            return 0;
        case WM_SETFOCUS:
            RecordEvent("setfocus", 0, 0);
            return 0;
        case WM_KILLFOCUS:
            RecordEvent("killfocus", 0, 0);
            return 0;
        case WM_MOUSEACTIVATE:
            RecordEvent("mouseactivate", 0, 0);
            return MA_ACTIVATE;
        case WM_NCHITTEST:
            return HTCLIENT;
        case WM_ACTIVATE:
            RecordEvent((LOWORD(wParam) != WA_INACTIVE) ? "activate" : "deactivate", 0, 0);
            return 0;
        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC hdc = BeginPaint(hwnd, &ps);
            HBRUSH brush = CreateSolidBrush(RGB(40, 44, 52));
            FillRect(hdc, &ps.rcPaint, brush);
            DeleteObject(brush);

            SetBkMode(hdc, TRANSPARENT);
            SetTextColor(hdc, RGB(220, 220, 220));
            RECT rc;
            GetClientRect(hwnd, &rc);
            DrawTextA(hdc, "Mr. Tick Native Test Harness Window (Background Target)", -1, &rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

            EndPaint(hwnd, &ps);
            return 0;
        }
        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcA(hwnd, uMsg, wParam, lParam);
}

void AttachToInputDesktop() {
    HDESK hInput = OpenInputDesktop(0, FALSE, MAXIMUM_ALLOWED);
    if (hInput) {
        SetThreadDesktop(hInput);
        CloseDesktop(hInput);
    }
}

DWORD WINAPI MessageLoopThread(LPVOID lpParam) {
    AttachToInputDesktop();

    WNDCLASSEXA wc = {0};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = TestWndProc;
    wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = "MrTickTestBackgroundWindowClass";
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    RegisterClassExA(&wc);

    g_MessageThreadId = GetCurrentThreadId();

    // Cria a fila de mensagens da thread antes de sinalizar
    MSG msg;
    PeekMessageA(&msg, NULL, WM_USER, WM_USER, PM_NOREMOVE);
    SetEvent(g_ThreadReadyEvent);

    while (g_Running && GetMessageA(&msg, NULL, 0, 0) > 0) {
        if (msg.message == WM_USER_CREATE_WINDOW) {
            CreateWindowParams* p = (CreateWindowParams*)msg.lParam;
            if (g_TestHwnd && IsWindow(g_TestHwnd)) {
                DestroyWindow(g_TestHwnd);
                g_TestHwnd = nullptr;
            }

            g_TestHwnd = CreateWindowExA(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
                "MrTickTestBackgroundWindowClass",
                p->title.c_str(),
                WS_POPUP | WS_VISIBLE,
                p->x, p->y, p->width, p->height,
                NULL, NULL, GetModuleHandle(NULL), NULL
            );

            if (g_TestHwnd && p->show) {
                SetWindowPos(g_TestHwnd, HWND_TOPMOST, p->x, p->y, p->width, p->height, SWP_SHOWWINDOW);
                ShowWindow(g_TestHwnd, SW_SHOW);
                UpdateWindow(g_TestHwnd);
            }
            SetEvent(p->hDoneEvent);
            continue;
        } else if (msg.message == WM_USER_DESTROY_WINDOW) {
            if (g_TestHwnd && IsWindow(g_TestHwnd)) {
                DestroyWindow(g_TestHwnd);
                g_TestHwnd = nullptr;
            }
            HANDLE hDone = (HANDLE)msg.lParam;
            if (hDone) SetEvent(hDone);
            continue;
        }

        TranslateMessage(&msg);
        DispatchMessageA(&msg);
    }
    return 0;
}

// Helpers JSON simples
std::string EscapeJson(const std::string& s) {
    std::ostringstream o;
    for (char c : s) {
        if (c == '"') o << "\\\"";
        else if (c == '\\') o << "\\\\";
        else if (c == '\b') o << "\\b";
        else if (c == '\f') o << "\\f";
        else if (c == '\n') o << "\\n";
        else if (c == '\r') o << "\\r";
        else if (c == '\t') o << "\\t";
        else if ((unsigned char)c < 0x20) {
            char buf[8];
            snprintf(buf, sizeof(buf), "\\u%04x", (unsigned char)c);
            o << buf;
        } else {
            o << c;
        }
    }
    return o.str();
}

std::string ExtractJsonString(const std::string& json, const std::string& key) {
    std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return "";
    pos = json.find(':', pos);
    if (pos == std::string::npos) return "";
    pos = json.find('"', pos);
    if (pos == std::string::npos) return "";
    size_t endPos = json.find('"', pos + 1);
    if (endPos == std::string::npos) return "";
    return json.substr(pos + 1, endPos - pos - 1);
}

int ExtractJsonInt(const std::string& json, const std::string& key, int defaultVal = 0) {
    std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return defaultVal;
    pos = json.find(':', pos);
    if (pos == std::string::npos) return defaultVal;
    while (pos < json.size() && (json[pos] == ':' || json[pos] == ' ' || json[pos] == '\t')) pos++;
    size_t endPos = pos;
    if (endPos < json.size() && (json[endPos] == '-' || json[endPos] == '+')) endPos++;
    while (endPos < json.size() && json[endPos] >= '0' && json[endPos] <= '9') endPos++;
    if (endPos == pos) return defaultVal;
    try {
        return std::stoi(json.substr(pos, endPos - pos));
    } catch (...) {
        return defaultVal;
    }
}

int64_t ExtractJsonInt64(const std::string& json, const std::string& key, int64_t defaultVal = 0) {
    std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return defaultVal;
    pos = json.find(':', pos);
    if (pos == std::string::npos) return defaultVal;
    while (pos < json.size() && (json[pos] == ':' || json[pos] == ' ' || json[pos] == '\t')) pos++;
    size_t endPos = pos;
    if (endPos < json.size() && (json[endPos] == '-' || json[endPos] == '+')) endPos++;
    while (endPos < json.size() && json[endPos] >= '0' && json[endPos] <= '9') endPos++;
    if (endPos == pos) return defaultVal;
    try {
        return std::stoll(json.substr(pos, endPos - pos));
    } catch (...) {
        return defaultVal;
    }
}

bool ExtractJsonBool(const std::string& json, const std::string& key, bool defaultVal = false) {
    std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return defaultVal;
    pos = json.find(':', pos);
    if (pos == std::string::npos) return defaultVal;
    std::string rest = json.substr(pos);
    if (rest.find("true") != std::string::npos && rest.find("true") < rest.find(',')) return true;
    if (rest.find("false") != std::string::npos && rest.find("false") < rest.find(',')) return false;
    return defaultVal;
}

void SendSynthesizedMouseMove(int screenX, int screenY) {
    SetCursorPos(screenX, screenY);

    int vLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int vTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int vWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int vHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    if (vWidth <= 0) vWidth = GetSystemMetrics(SM_CXSCREEN);
    if (vHeight <= 0) vHeight = GetSystemMetrics(SM_CYSCREEN);

    double normX = (double)(screenX - vLeft) * 65535.0 / (double)(vWidth - 1);
    double normY = (double)(screenY - vTop) * 65535.0 / (double)(vHeight - 1);

    INPUT input;
    memset(&input, 0, sizeof(input));
    input.type = INPUT_MOUSE;
    input.mi.dx = (LONG)normX;
    input.mi.dy = (LONG)normY;
    input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
    SendInput(1, &input, sizeof(INPUT));
}

UINT SendSynthesizedMouseButton(const std::string& button, bool down, int screenX, int screenY) {
    SetCursorPos(screenX, screenY);

    int vLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int vTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int vWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int vHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);
    if (vWidth <= 0) vWidth = GetSystemMetrics(SM_CXSCREEN);
    if (vHeight <= 0) vHeight = GetSystemMetrics(SM_CYSCREEN);

    double normX = (double)(screenX - vLeft) * 65535.0 / (double)(vWidth - 1);
    double normY = (double)(screenY - vTop) * 65535.0 / (double)(vHeight - 1);

    INPUT input;
    memset(&input, 0, sizeof(input));
    input.type = INPUT_MOUSE;
    input.mi.dx = (LONG)normX;
    input.mi.dy = (LONG)normY;
    DWORD flag = 0;
    if (button == "right") {
        flag = down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
    } else if (button == "middle") {
        flag = down ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
    } else {
        flag = down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
    }
    input.mi.dwFlags = flag | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
    UINT sent = SendInput(1, &input, sizeof(INPUT));
    return sent;
}

struct MonitorInfoCollect {
    HMONITOR hMon;
    RECT rcMonitor;
    RECT rcWork;
    bool isPrimary;
    UINT dpi;
};

static std::vector<MonitorInfoCollect> g_Monitors;

BOOL CALLBACK MonitorEnumProc(HMONITOR hMonitor, HDC hdcMonitor, LPRECT lprcMonitor, LPARAM dwData) {
    MONITORINFOEXA mi;
    mi.cbSize = sizeof(mi);
    if (GetMonitorInfoA(hMonitor, &mi)) {
        MonitorInfoCollect mic;
        mic.hMon = hMonitor;
        mic.rcMonitor = mi.rcMonitor;
        mic.rcWork = mi.rcWork;
        mic.isPrimary = (mi.dwFlags & MONITORINFOF_PRIMARY) != 0;
        mic.dpi = GetMonitorDpi(hMonitor);
        g_Monitors.push_back(mic);
    }
    return TRUE;
}

int main(int argc, char* argv[]) {
    AttachToInputDesktop();
    // Inicializa suporte a DPI e eventos
    InitDpiApis();

    HANDLE hThread = CreateThread(NULL, 0, MessageLoopThread, NULL, 0, NULL);
    if (hThread) {
        CloseHandle(hThread);
    }

    // Aguarda a thread de mensagens estar pronta para receber PostThreadMessage
    WaitForSingleObject(g_ThreadReadyEvent, 2000);
    CloseHandle(g_ThreadReadyEvent);

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;

        std::string cmd = ExtractJsonString(line, "cmd");
        if (cmd == "ping") {
            std::cout << "{\"status\":\"ok\",\"response\":\"pong\"}" << std::endl;
        } else if (cmd == "create_window") {
            CreateWindowParams params;
            params.x = ExtractJsonInt(line, "x", 100);
            params.y = ExtractJsonInt(line, "y", 100);
            params.width = ExtractJsonInt(line, "width", 800);
            params.height = ExtractJsonInt(line, "height", 600);
            params.title = ExtractJsonString(line, "title");
            if (params.title.empty()) params.title = "Mr. Tick Test Background Window";
            params.show = ExtractJsonBool(line, "show", true);
            params.hDoneEvent = CreateEvent(NULL, FALSE, FALSE, NULL);

            PostThreadMessageA(g_MessageThreadId, WM_USER_CREATE_WINDOW, 0, (LPARAM)&params);
            WaitForSingleObject(params.hDoneEvent, 3000);
            CloseHandle(params.hDoneEvent);

            if (g_TestHwnd && IsWindow(g_TestHwnd)) {
                std::cout << "{\"status\":\"ok\",\"hwnd\":" << (uintptr_t)g_TestHwnd
                          << ",\"dpi\":" << GetWindowDpi(g_TestHwnd) << "}" << std::endl;
            } else {
                std::cout << "{\"status\":\"error\",\"message\":\"Failed to create test window\"}" << std::endl;
            }
        } else if (cmd == "set_window_pos") {
            uintptr_t targetHwndInt = (uintptr_t)ExtractJsonInt64(line, "hwnd", (int64_t)(uintptr_t)g_TestHwnd);
            HWND targetHwnd = (HWND)targetHwndInt;
            if (!targetHwnd || !IsWindow(targetHwnd)) targetHwnd = g_TestHwnd;

            if (targetHwnd && IsWindow(targetHwnd)) {
                int x = ExtractJsonInt(line, "x", 0);
                int y = ExtractJsonInt(line, "y", 0);
                int w = ExtractJsonInt(line, "width", 0);
                int h = ExtractJsonInt(line, "height", 0);
                std::string zOrder = ExtractJsonString(line, "zOrder");

                HWND insertAfter = HWND_TOP;
                UINT uFlags = SWP_NOACTIVATE;
                if (zOrder == "bottom") insertAfter = HWND_BOTTOM;
                else if (zOrder == "top") insertAfter = HWND_TOP;
                else if (zOrder == "topmost") insertAfter = HWND_TOPMOST;
                else if (zOrder == "notopmost") insertAfter = HWND_NOTOPMOST;
                else if (zOrder == "behind_hwnd") {
                    uintptr_t behind = (uintptr_t)ExtractJsonInt64(line, "targetHwnd", 0);
                    if (behind && IsWindow((HWND)behind)) {
                        insertAfter = (HWND)behind;
                    }
                }

                if (w <= 0 || h <= 0) uFlags |= SWP_NOSIZE;
                SetWindowPos(targetHwnd, insertAfter, x, y, w, h, uFlags);
                std::cout << "{\"status\":\"ok\"}" << std::endl;
            } else {
                std::cout << "{\"status\":\"error\",\"message\":\"Window not found\"}" << std::endl;
            }
        } else if (cmd == "bring_to_front") {
            if (g_TestHwnd && IsWindow(g_TestHwnd)) {
                SetWindowPos(g_TestHwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
                SetForegroundWindow(g_TestHwnd);
                std::cout << "{\"status\":\"ok\"}" << std::endl;
            } else {
                std::cout << "{\"status\":\"error\",\"message\":\"Window not found\"}" << std::endl;
            }
        } else if (cmd == "clear_events") {
            EnterCriticalSection(&g_EventsLock);
            g_ReceivedEvents.clear();
            g_AllMsgCodes.clear();
            LeaveCriticalSection(&g_EventsLock);
            std::cout << "{\"status\":\"ok\"}" << std::endl;
        } else if (cmd == "get_events") {
            EnterCriticalSection(&g_EventsLock);
            std::ostringstream out;
            out << "{\"status\":\"ok\",\"count\":" << g_ReceivedEvents.size() << ",\"allMsgCount\":" << g_AllMsgCodes.size() << ",\"allMsgs\":[";
            for (size_t i = 0; i < g_AllMsgCodes.size(); ++i) {
                if (i > 0) out << ",";
                out << g_AllMsgCodes[i];
            }
            out << "],\"events\":[";
            for (size_t i = 0; i < g_ReceivedEvents.size(); ++i) {
                const auto& ev = g_ReceivedEvents[i];
                if (i > 0) out << ",";
                out << "{"
                    << "\"type\":\"" << ev.type << "\","
                    << "\"x\":" << ev.x << ","
                    << "\"y\":" << ev.y << ","
                    << "\"screenX\":" << ev.screenX << ","
                    << "\"screenY\":" << ev.screenY << ","
                    << "\"timestamp\":" << ev.timestamp << ","
                    << "\"vkCode\":" << ev.vkCode << ","
                    << "\"ctrl\":" << (ev.ctrl ? "true" : "false") << ","
                    << "\"alt\":" << (ev.alt ? "true" : "false") << ","
                    << "\"shift\":" << (ev.shift ? "true" : "false")
                    << "}";
            }
            out << "]}";
            LeaveCriticalSection(&g_EventsLock);
            std::cout << out.str() << std::endl;
        } else if (cmd == "get_foreground_window") {
            HWND fg = GetForegroundWindow();
            char title[256] = {0};
            char className[256] = {0};
            if (fg) {
                GetWindowTextA(fg, title, sizeof(title));
                GetClassNameA(fg, className, sizeof(className));
            }
            std::cout << "{\"status\":\"ok\","
                      << "\"hwnd\":" << (uintptr_t)fg << ","
                      << "\"title\":\"" << EscapeJson(title) << "\","
                      << "\"className\":\"" << EscapeJson(className) << "\","
                      << "\"isTestWindow\":" << ((fg == g_TestHwnd) ? "true" : "false")
                      << "}" << std::endl;
        } else if (cmd == "get_window_rect") {
            uintptr_t hwndInt = (uintptr_t)ExtractJsonInt64(line, "hwnd", (int64_t)(uintptr_t)g_TestHwnd);
            HWND h = (HWND)hwndInt;
            if (h && IsWindow(h)) {
                RECT rc;
                GetWindowRect(h, &rc);
                std::cout << "{\"status\":\"ok\","
                          << "\"left\":" << rc.left << ","
                          << "\"top\":" << rc.top << ","
                          << "\"right\":" << rc.right << ","
                          << "\"bottom\":" << rc.bottom << ","
                          << "\"width\":" << (rc.right - rc.left) << ","
                          << "\"height\":" << (rc.bottom - rc.top) << ","
                          << "\"dpi\":" << GetWindowDpi(h)
                          << "}" << std::endl;
            } else {
                std::cout << "{\"status\":\"error\",\"message\":\"Window not found\"}" << std::endl;
            }
        } else if (cmd == "find_window") {
            std::string title = ExtractJsonString(line, "title");
            std::string className = ExtractJsonString(line, "className");
            HWND found = FindWindowA(
                className.empty() ? NULL : className.c_str(),
                title.empty() ? NULL : title.c_str()
            );
            if (found) {
                char actualTitle[256] = {0};
                GetWindowTextA(found, actualTitle, sizeof(actualTitle));
                RECT rc;
                GetWindowRect(found, &rc);
                std::cout << "{\"status\":\"ok\","
                          << "\"hwnd\":" << (uintptr_t)found << ","
                          << "\"title\":\"" << EscapeJson(actualTitle) << "\","
                          << "\"left\":" << rc.left << ",\"top\":" << rc.top << ","
                          << "\"width\":" << (rc.right - rc.left) << ",\"height\":" << (rc.bottom - rc.top)
                          << "}" << std::endl;
            } else {
                std::cout << "{\"status\":\"not_found\"}" << std::endl;
            }
        } else if (cmd == "get_system_info") {
            g_Monitors.clear();
            EnumDisplayMonitors(NULL, NULL, MonitorEnumProc, 0);

            SYSTEM_INFO si;
            GetNativeSystemInfo(&si);
            std::string arch = "unknown";
            if (si.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64) arch = "x64";
            else if (si.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_INTEL) arch = "x86";
            else if (si.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_ARM64) arch = "arm64";

            std::ostringstream out;
            out << "{\"status\":\"ok\",\"os\":\"Windows\",\"arch\":\"" << arch << "\","
                << "\"virtualScreen\":{"
                << "\"left\":" << GetSystemMetrics(SM_XVIRTUALSCREEN) << ","
                << "\"top\":" << GetSystemMetrics(SM_YVIRTUALSCREEN) << ","
                << "\"width\":" << GetSystemMetrics(SM_CXVIRTUALSCREEN) << ","
                << "\"height\":" << GetSystemMetrics(SM_CYVIRTUALSCREEN)
                << "},"
                << "\"monitors\":[";
            for (size_t i = 0; i < g_Monitors.size(); ++i) {
                const auto& m = g_Monitors[i];
                if (i > 0) out << ",";
                out << "{"
                    << "\"hMon\":" << (uintptr_t)m.hMon << ","
                    << "\"isPrimary\":" << (m.isPrimary ? "true" : "false") << ","
                    << "\"dpi\":" << m.dpi << ","
                    << "\"left\":" << m.rcMonitor.left << ","
                    << "\"top\":" << m.rcMonitor.top << ","
                    << "\"right\":" << m.rcMonitor.right << ","
                    << "\"bottom\":" << m.rcMonitor.bottom << ","
                    << "\"workLeft\":" << m.rcWork.left << ","
                    << "\"workTop\":" << m.rcWork.top << ","
                    << "\"workRight\":" << m.rcWork.right << ","
                    << "\"workBottom\":" << m.rcWork.bottom
                    << "}";
            }
            out << "]}";
            std::cout << out.str() << std::endl;
        } else if (cmd == "send_mouse_input") {
            std::string action = ExtractJsonString(line, "action");
            int x = ExtractJsonInt(line, "x", 0);
            int y = ExtractJsonInt(line, "y", 0);
            std::string button = ExtractJsonString(line, "button");
            if (button.empty()) button = "left";

            UINT sDown = 0, sUp = 0;
            DWORD errDown = 0, errUp = 0;

            if (action == "move") {
                SendSynthesizedMouseMove(x, y);
            } else if (action == "down") {
                SendSynthesizedMouseMove(x, y);
                Sleep(20);
                sDown = SendSynthesizedMouseButton(button, true, x, y);
                if (sDown == 0) errDown = GetLastError();
            } else if (action == "up") {
                SendSynthesizedMouseMove(x, y);
                Sleep(20);
                sUp = SendSynthesizedMouseButton(button, false, x, y);
                if (sUp == 0) errUp = GetLastError();
            } else if (action == "click") {
                SendSynthesizedMouseMove(x, y);
                Sleep(25);
                sDown = SendSynthesizedMouseButton(button, true, x, y);
                if (sDown == 0) errDown = GetLastError();
                Sleep(30);
                sUp = SendSynthesizedMouseButton(button, false, x, y);
                if (sUp == 0) errUp = GetLastError();
            } else if (action == "drag") {
                int toX = ExtractJsonInt(line, "toX", x);
                int toY = ExtractJsonInt(line, "toY", y);
                int steps = ExtractJsonInt(line, "steps", 10);
                if (steps <= 0) steps = 1;
                int delayMs = ExtractJsonInt(line, "delayMs", 10);

                SendSynthesizedMouseMove(x, y);
                Sleep(25);
                SendSynthesizedMouseButton(button, true, x, y);
                Sleep(25);

                for (int s = 1; s <= steps; ++s) {
                    int curX = x + (toX - x) * s / steps;
                    int curY = y + (toY - y) * s / steps;
                    SendSynthesizedMouseMove(curX, curY);
                    Sleep(delayMs);
                }

                Sleep(25);
                SendSynthesizedMouseButton(button, false, toX, toY);
            }
            Sleep(40);
            POINT curPt = {0, 0};
            GetCursorPos(&curPt);
            HWND winUnder = WindowFromPoint(curPt);
            std::cout << "{\"status\":\"ok\",\"sDown\":" << sDown << ",\"errDown\":" << errDown << ",\"sUp\":" << sUp << ",\"errUp\":" << errUp
                      << ",\"curPtX\":" << curPt.x << ",\"curPtY\":" << curPt.y
                      << ",\"winUnder\":" << (uintptr_t)winUnder
                      << ",\"isTestHwndUnder\":" << ((winUnder == g_TestHwnd) ? "true" : "false")
                      << "}" << std::endl;
        } else if (cmd == "get_window_at_point") {
            int x = ExtractJsonInt(line, "x", 0);
            int y = ExtractJsonInt(line, "y", 0);
            POINT pt = { x, y };
            HWND atPt = WindowFromPoint(pt);
            char title[256] = {0};
            char className[256] = {0};
            if (atPt) {
                GetWindowTextA(atPt, title, sizeof(title));
                GetClassNameA(atPt, className, sizeof(className));
            }
            std::cout << "{\"status\":\"ok\","
                      << "\"hwnd\":" << (uintptr_t)atPt << ","
                      << "\"title\":\"" << EscapeJson(title) << "\","
                      << "\"className\":\"" << EscapeJson(className) << "\","
                      << "\"isTestWindow\":" << ((atPt == g_TestHwnd) ? "true" : "false")
                      << "}" << std::endl;
        } else if (cmd == "send_key_input") {
            int vk = ExtractJsonInt(line, "vkCode", 0);
            bool down = ExtractJsonBool(line, "down", true);
            bool up = ExtractJsonBool(line, "up", true);

            if (down) {
                INPUT inp;
                memset(&inp, 0, sizeof(inp));
                inp.type = INPUT_KEYBOARD;
                inp.ki.wVk = (WORD)vk;
                SendInput(1, &inp, sizeof(INPUT));
            }
            if (down && up) {
                Sleep(20);
            }
            if (up) {
                INPUT inp;
                memset(&inp, 0, sizeof(inp));
                inp.type = INPUT_KEYBOARD;
                inp.ki.wVk = (WORD)vk;
                inp.ki.dwFlags = KEYEVENTF_KEYUP;
                SendInput(1, &inp, sizeof(INPUT));
            }
            std::cout << "{\"status\":\"ok\"}" << std::endl;
        } else if (cmd == "send_alt_tab") {
            INPUT inps[4];
            memset(inps, 0, sizeof(inps));
            // Alt down
            inps[0].type = INPUT_KEYBOARD;
            inps[0].ki.wVk = VK_MENU;
            // Tab down
            inps[1].type = INPUT_KEYBOARD;
            inps[1].ki.wVk = VK_TAB;
            // Tab up
            inps[2].type = INPUT_KEYBOARD;
            inps[2].ki.wVk = VK_TAB;
            inps[2].ki.dwFlags = KEYEVENTF_KEYUP;
            // Alt up
            inps[3].type = INPUT_KEYBOARD;
            inps[3].ki.wVk = VK_MENU;
            inps[3].ki.dwFlags = KEYEVENTF_KEYUP;

            SendInput(4, inps, sizeof(INPUT));
            Sleep(50);
            std::cout << "{\"status\":\"ok\"}" << std::endl;
        } else if (cmd == "exit") {
            break;
        } else {
            std::cout << "{\"status\":\"unknown_cmd\",\"cmd\":\"" << EscapeJson(cmd) << "\"}" << std::endl;
        }
        std::cout.flush();
    }

    // Cleanup seguro
    g_Running = false;
    if (g_MessageThreadId) {
        PostThreadMessageA(g_MessageThreadId, WM_QUIT, 0, 0);
    }
    DeleteCriticalSection(&g_EventsLock);
    return 0;
}
