#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE

#include <windows.h>
#include <commctrl.h>
#include <shellapi.h>
#include <filesystem>
#include <string>
#include <thread>
#include <chrono>

#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(linker,"\"/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\"")

namespace fs = std::filesystem;

// Control IDs
constexpr int IDC_STATIC_ICON    = 101;
constexpr int IDC_STATIC_TITLE   = 102;
constexpr int IDC_STATIC_STATUS  = 103;
constexpr int IDC_PROGRESS_BAR   = 104;

// Custom Window Messages
constexpr UINT WM_APP_PROGRESS   = WM_APP + 1;
constexpr UINT WM_APP_FINISHED   = WM_APP + 2;
constexpr UINT WM_APP_ERROR      = WM_APP + 3;

// Global UI Handles
HWND g_hWnd = NULL;
HWND g_hIconCtrl = NULL;
HWND g_hTitleCtrl = NULL;
HWND g_hStatusCtrl = NULL;
HWND g_hProgressCtrl = NULL;
HFONT g_hFontTitle = NULL;
HFONT g_hFontStatus = NULL;
HBRUSH g_hBgBrush = NULL;

LRESULT CALLBACK WndProc(HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {
    case WM_CREATE: {
        HINSTANCE hInstance = ((LPCREATESTRUCT)lParam)->hInstance;

        // Background brush
        g_hBgBrush = CreateSolidBrush(RGB(248, 249, 250)); // Clean, modern light background

        // Fonts: Segoe UI
        g_hFontTitle = CreateFontW(
            18, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE,
            DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
            CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI"
        );
        g_hFontStatus = CreateFontW(
            15, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
            DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
            CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI"
        );

        // Load application icon (resource ID 1 defined in updater.rc)
        HICON hAppIcon = (HICON)LoadImageW(
            hInstance, MAKEINTRESOURCEW(1), IMAGE_ICON, 32, 32, LR_DEFAULTCOLOR | LR_SHARED
        );
        if (!hAppIcon) {
            hAppIcon = LoadIconW(NULL, IDI_APPLICATION);
        }

        SendMessageW(hWnd, WM_SETICON, ICON_BIG, (LPARAM)hAppIcon);
        SendMessageW(hWnd, WM_SETICON, ICON_SMALL, (LPARAM)hAppIcon);

        // 1. Icon Control (32x32 at x: 24, y: 22)
        g_hIconCtrl = CreateWindowExW(
            0, L"STATIC", NULL,
            WS_CHILD | WS_VISIBLE | SS_ICON,
            24, 22, 32, 32,
            hWnd, (HMENU)(INT_PTR)IDC_STATIC_ICON, hInstance, NULL
        );
        SendMessageW(g_hIconCtrl, STM_SETICON, (WPARAM)hAppIcon, 0);

        // 2. Title Label (x: 70, y: 20)
        g_hTitleCtrl = CreateWindowExW(
            0, L"STATIC", L"Updating Mr. Tick",
            WS_CHILD | WS_VISIBLE | SS_LEFT,
            70, 20, 360, 22,
            hWnd, (HMENU)(INT_PTR)IDC_STATIC_TITLE, hInstance, NULL
        );
        SendMessageW(g_hTitleCtrl, WM_SETFONT, (WPARAM)g_hFontTitle, TRUE);

        // 3. Status Label (x: 70, y: 44)
        g_hStatusCtrl = CreateWindowExW(
            0, L"STATIC", L"Starting updater...",
            WS_CHILD | WS_VISIBLE | SS_LEFT,
            70, 44, 360, 20,
            hWnd, (HMENU)(INT_PTR)IDC_STATIC_STATUS, hInstance, NULL
        );
        SendMessageW(g_hStatusCtrl, WM_SETFONT, (WPARAM)g_hFontStatus, TRUE);

        // 4. Progress Bar (x: 24, y: 80, width: 406, height: 20)
        g_hProgressCtrl = CreateWindowExW(
            0, PROGRESS_CLASSW, NULL,
            WS_CHILD | WS_VISIBLE | PBS_SMOOTH,
            24, 80, 406, 20,
            hWnd, (HMENU)(INT_PTR)IDC_PROGRESS_BAR, hInstance, NULL
        );
        SendMessageW(g_hProgressCtrl, PBM_SETRANGE32, 0, 100);
        SendMessageW(g_hProgressCtrl, PBM_SETPOS, 0, 0);

        return 0;
    }

    case WM_CTLCOLORSTATIC: {
        HDC hdcStatic = (HDC)wParam;
        SetTextColor(hdcStatic, RGB(30, 30, 30));
        SetBkMode(hdcStatic, TRANSPARENT);
        return (LRESULT)g_hBgBrush;
    }

    case WM_ERASEBKGND: {
        HDC hdc = (HDC)wParam;
        RECT rc;
        GetClientRect(hWnd, &rc);
        FillRect(hdc, &rc, g_hBgBrush);
        return 1;
    }

    case WM_APP_PROGRESS: {
        int percent = (int)wParam;
        wchar_t* pText = (wchar_t*)lParam;
        if (g_hProgressCtrl) {
            SendMessageW(g_hProgressCtrl, PBM_SETPOS, (WPARAM)percent, 0);
        }
        if (pText && g_hStatusCtrl) {
            SetWindowTextW(g_hStatusCtrl, pText);
            delete[] pText;
        }
        return 0;
    }

    case WM_APP_FINISHED: {
        DestroyWindow(hWnd);
        return 0;
    }

    case WM_APP_ERROR: {
        wchar_t* pErr = (wchar_t*)lParam;
        MessageBoxW(hWnd, pErr ? pErr : L"Unknown update error.", L"Mr. Tick - Error", MB_OK | MB_ICONERROR);
        if (pErr) delete[] pErr;
        DestroyWindow(hWnd);
        return 0;
    }

    case WM_DESTROY: {
        if (g_hFontTitle) DeleteObject(g_hFontTitle);
        if (g_hFontStatus) DeleteObject(g_hFontStatus);
        if (g_hBgBrush) DeleteObject(g_hBgBrush);
        PostQuitMessage(0);
        return 0;
    }

    default:
        return DefWindowProcW(hWnd, uMsg, wParam, lParam);
    }
}

void RunUpdateWorker(DWORD pid, fs::path targetDir, fs::path extractDir, std::wstring exePath) {
    auto reportProgress = [](int percent, const std::wstring& msg) {
        wchar_t* buffer = new wchar_t[msg.length() + 1];
        wcscpy_s(buffer, msg.length() + 1, msg.c_str());
        PostMessageW(g_hWnd, WM_APP_PROGRESS, (WPARAM)percent, (LPARAM)buffer);
    };

    auto animateTo = [&reportProgress](int startPercent, int endPercent, const std::wstring& msg, int durationMs) {
        constexpr int steps = 15;
        int delay = durationMs / steps;
        for (int i = 1; i <= steps; ++i) {
            int current = startPercent + (endPercent - startPercent) * i / steps;
            reportProgress(current, msg);
            std::this_thread::sleep_for(std::chrono::milliseconds(delay));
        }
    };

    // 1. Stage: Wait for main process to exit (~600ms)
    reportProgress(5, L"Waiting for Mr. Tick to close...");
    HANDLE hProcess = OpenProcess(SYNCHRONIZE, FALSE, pid);
    if (hProcess != NULL) {
        WaitForSingleObject(hProcess, 15000);
        CloseHandle(hProcess);
    }
    animateTo(5, 25, L"Waiting for Mr. Tick to close...", 500);
    std::this_thread::sleep_for(std::chrono::milliseconds(200));

    // 2. Stage: Copy new files with retries (~1000ms)
    reportProgress(25, L"Installing new version...");
    bool success = false;
    for (int retry = 0; retry < 10; ++retry) {
        try {
            fs::copy(extractDir, targetDir, fs::copy_options::recursive | fs::copy_options::overwrite_existing);
            success = true;
            break;
        } catch (const fs::filesystem_error&) {
            std::this_thread::sleep_for(std::chrono::milliseconds(800));
        }
    }

    if (!success) {
        std::wstring err = L"Could not overwrite installation files. Please ensure the application is completely closed.";
        wchar_t* buffer = new wchar_t[err.length() + 1];
        wcscpy_s(buffer, err.length() + 1, err.c_str());
        PostMessageW(g_hWnd, WM_APP_ERROR, 0, (LPARAM)buffer);
        return;
    }

    animateTo(25, 75, L"Installing new version...", 1000);

    // 3. Stage: Cleanup temporary files (~400ms)
    animateTo(75, 90, L"Cleaning up temporary files...", 400);
    try {
        fs::remove_all(extractDir);
    } catch (...) {}

    // 4. Stage: Restart application (~400ms)
    animateTo(90, 100, L"Restarting Mr. Tick...", 400);
    std::this_thread::sleep_for(std::chrono::milliseconds(250));

    // Launch the updated process
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    if (CreateProcessW(exePath.c_str(), NULL, NULL, NULL, FALSE, 0, NULL, targetDir.c_str(), &si, &pi)) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }

    PostMessageW(g_hWnd, WM_APP_FINISHED, 0, 0);
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE /*hPrevInstance*/, PWSTR /*pCmdLine*/, int /*nCmdShow*/) {
    // Initialize Common Controls
    INITCOMMONCONTROLSEX icex = { sizeof(INITCOMMONCONTROLSEX) };
    icex.dwICC = ICC_PROGRESS_CLASS | ICC_STANDARD_CLASSES;
    InitCommonControlsEx(&icex);

    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv || argc < 5) {
        MessageBoxW(NULL, L"Usage: updater.exe <PID> <TargetDir> <ExtractDir> <ExePath>", L"Mr. Tick - Portable Updater", MB_OK | MB_ICONWARNING);
        if (argv) LocalFree(argv);
        return 1;
    }

    DWORD pid = std::stoul(argv[1]);
    fs::path targetDir = argv[2];
    fs::path extractDir = argv[3];
    std::wstring exePath = argv[4];
    LocalFree(argv);

    // Register Win32 window class
    WNDCLASSEXW wc = { sizeof(WNDCLASSEXW) };
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wc.lpszClassName = L"MrTickPortableUpdaterWindow";

    if (!RegisterClassExW(&wc)) {
        return 1;
    }

    // Window size and screen centering
    int winWidth = 460;
    int winHeight = 150;
    int screenWidth = GetSystemMetrics(SM_CXSCREEN);
    int screenHeight = GetSystemMetrics(SM_CYSCREEN);
    int posX = (screenWidth - winWidth) / 2;
    int posY = (screenHeight - winHeight) / 2;

    g_hWnd = CreateWindowExW(
        WS_EX_TOPMOST,
        wc.lpszClassName,
        L"Mr. Tick - Portable Updater",
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
        posX, posY, winWidth, winHeight,
        NULL, NULL, hInstance, NULL
    );

    if (!g_hWnd) {
        return 1;
    }

    ShowWindow(g_hWnd, SW_SHOWNORMAL);
    UpdateWindow(g_hWnd);

    // Executa o trabalho em uma thread de background
    std::thread worker(RunUpdateWorker, pid, targetDir, extractDir, exePath);

    // Loop de mensagens Win32
    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    if (worker.joinable()) {
        worker.join();
    }

    return 0;
}

// Fallback entry point se o linker invocar WinMain ao invés de wWinMain
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR /*lpCmdLine*/, int nCmdShow) {
    return wWinMain(hInstance, hPrevInstance, GetCommandLineW(), nCmdShow);
}

// Entry point padrão C para compatibilidade com node-gyp / MSVC LIBCMT
int main(int /*argc*/, char* /*argv*/[]) {
    HWND hConsole = GetConsoleWindow();
    if (hConsole) {
        ShowWindow(hConsole, SW_HIDE);
    }
    return wWinMain(GetModuleHandleW(NULL), NULL, GetCommandLineW(), SW_SHOWNORMAL);
}
