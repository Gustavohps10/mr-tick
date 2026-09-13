#include <iostream>
#include <windows.h>
#include <string>
#include <filesystem>
#include <thread>

namespace fs = std::filesystem;

int main(int argc, char* argv[]) {
    // Altera o título da janelinha do console nativo
    SetConsoleTitleA("Mr. Tick Updater");
    
    if (argc < 5) {
        std::cerr << "Uso: updater.exe <PID> <TargetDir> <ExtractDir> <ExePath>\n";
        Sleep(3000);
        return 1;
    }

    DWORD pid = std::stoul(argv[1]);
    fs::path targetDir = argv[2];
    fs::path extractDir = argv[3];
    std::string exePath = argv[4];

    std::cout << "====================================\n";
    std::cout << "        Mr. Tick - Atualizador      \n";
    std::cout << "====================================\n\n";

    std::cout << "Aguardando o encerramento do aplicativo (PID: " << pid << ")...\n";

    // Aguarda o processo principal morrer
    HANDLE hProcess = OpenProcess(SYNCHRONIZE, FALSE, pid);
    if (hProcess != NULL) {
        WaitForSingleObject(hProcess, 15000); // Espera ate 15 segs
        CloseHandle(hProcess);
    }
    
    // Margem de seguranca para o Windows liberar os arquivos
    Sleep(1000);

    std::cout << "\nAplicando atualizacao...\n";

    bool success = false;
    for (int i = 0; i < 10; ++i) {
        try {
            fs::copy(extractDir, targetDir, fs::copy_options::recursive | fs::copy_options::overwrite_existing);
            success = true;
            break;
        } catch (const fs::filesystem_error& e) {
            std::cout << "Arquivo em uso, tentando novamente em 1s... (" << i+1 << "/10)\n";
            Sleep(1000);
        }
    }

    if (!success) {
        std::cerr << "\n[ERRO] Falha ao aplicar atualizacao. Verifique se o app fechou corretamente.\n";
        system("pause");
        return 1;
    }

    std::cout << "Limpando arquivos temporarios...\n";
    try {
        fs::remove_all(extractDir);
    } catch (...) {}

    std::cout << "Reiniciando o Mr. Tick...\n";
    
    // Inicia o app atualizado
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    if (CreateProcessA(exePath.c_str(), NULL, NULL, NULL, FALSE, 0, NULL, targetDir.string().c_str(), &si, &pi)) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }

    return 0;
}
