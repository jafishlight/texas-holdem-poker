@echo off
echo ====================================
echo     德州扑克局域网联机游戏
echo ====================================
echo.

:: 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未检测到Node.js，请先安装Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo 检测到Node.js版本:
node --version
echo.

:: 检查是否已安装依赖
if not exist "node_modules" (
    echo 正在安装依赖包...
    npm install
    if %errorlevel% neq 0 (
        echo 错误: 依赖安装失败
        pause
        exit /b 1
    )
    echo 依赖安装完成!
    echo.
)

:: 获取本机IP地址
echo 正在获取本机IP地址...
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    for /f "tokens=1" %%j in ("%%i") do (
        set LOCAL_IP=%%j
        goto :found_ip
    )
)
:found_ip

echo.
echo ====================================
echo 服务器启动信息:
echo ====================================
echo 本机访问地址: http://localhost:3000
if defined LOCAL_IP (
    echo 局域网访问地址: http://%LOCAL_IP%:3000
)
echo HTTP端口: 3000
echo UDP广播端口: 8889
echo ====================================
echo.
echo 提示:
echo 1. 确保防火墙允许Node.js访问网络
echo 2. 局域网内其他设备使用局域网访问地址
echo 3. 按Ctrl+C可停止服务器
echo.
echo 正在启动服务器...
echo.

:: 启动服务器
npm start

echo.
echo 服务器已停止
pause