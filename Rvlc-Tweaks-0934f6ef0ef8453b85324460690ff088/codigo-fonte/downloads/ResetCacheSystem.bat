@echo off
setlocal EnableExtensions

title Limpeza - DiagTrack / PcaSvc / SysMain
color 0A

:: ============================================================
:: LIMPEZA DE DADOS / RASTROS DO WINDOWS
:: Não desativa os serviços.
:: Execute este arquivo como Administrador.
:: ============================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Execute este arquivo como Administrador.
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   LIMPEZA DIAGTRACK / PCASVC / SYSMAIN
echo ==========================================
echo.

echo [1/6] Limpando logs de diagnostico...

for %%L in (
    "Microsoft-Windows-DiagTrack/Operational"
    "Microsoft-Windows-Application-Experience/Program-Telemetry"
    "Microsoft-Windows-Application-Experience/Program-Compatibility-Assistant"
    "Microsoft-Windows-Application-Experience/Program-Inventory"
) do (
    wevtutil cl %%L >nul 2>&1
)

echo [OK]

echo.
echo [2/6] Limpando relatorios de problemas do Windows...

del /f /s /q "%ProgramData%\Microsoft\Windows\WER\ReportArchive\*" >nul 2>&1
del /f /s /q "%ProgramData%\Microsoft\Windows\WER\ReportQueue\*" >nul 2>&1
del /f /s /q "%ProgramData%\Microsoft\Windows\WER\Temp\*" >nul 2>&1
del /f /s /q "%LocalAppData%\Microsoft\Windows\WER\ReportArchive\*" >nul 2>&1
del /f /s /q "%LocalAppData%\Microsoft\Windows\WER\ReportQueue\*" >nul 2>&1
del /f /s /q "%LocalAppData%\Microsoft\Windows\WER\Temp\*" >nul 2>&1

echo [OK]

echo.
echo [3/6] Limpando dados temporarios de diagnostico...

del /f /s /q "%ProgramData%\Microsoft\Diagnosis\*" >nul 2>&1
del /f /s /q "%ProgramData%\Microsoft\Diagnosis\EventTranscript\*" >nul 2>&1

echo [OK]

echo.
echo [4/6] Limpando Prefetch utilizado pelo Windows/SysMain...

del /f /q "%SystemRoot%\Prefetch\*.pf" >nul 2>&1
del /f /q "%SystemRoot%\Prefetch\*.tmp" >nul 2>&1

echo [OK]

echo.
echo [5/6] Limpando temporarios do sistema...

del /f /s /q "%SystemRoot%\Temp\*" >nul 2>&1
del /f /s /q "%TEMP%\*" >nul 2>&1

echo [OK]

echo.
echo [6/6] Limpando cache temporario do usuario...

del /f /s /q "%LocalAppData%\Temp\*" >nul 2>&1

echo [OK]

echo.
echo ==========================================
echo             LIMPEZA CONCLUIDA
echo ==========================================
echo.
echo Os servicos continuam configurados e ativos.
echo Alguns arquivos serao recriados automaticamente
echo pelo Windows conforme os servicos forem utilizados.
echo.

pause
endlocal