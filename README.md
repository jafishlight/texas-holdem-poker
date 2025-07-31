# 🃏 Texas Hold'em Poker Game

一个基于 Node.js 和 WebSocket 的多人在线德州扑克游戏，支持实时对战和本地网络发现。

## 功能特性

### 🎮 游戏核心功能
- **标准德州扑克规则**：严格遵循国际德州扑克规则
- **完整牌型支持**：皇家同花顺、同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌
- **多人对战**：支持2-10人同时游戏
- **四轮下注**：Pre-flop、Flop、Turn、River完整流程
- **丰富操作**：弃牌、过牌、跟注、加注、全下等操作

### 🌐 网络功能
- **局域网联机**：通过WebSocket实现实时通信
- **房间系统**：创建/加入房间，6位数字房间号
- **玩家管理**：房主权限、踢人、准备状态管理
- **断线重连**：支持网络中断后重新连接
- **房间发现**：UDP广播搜索局域网内可用房间

### 🎨 界面特性
- **现代化UI**：简洁直观的游戏界面
- **响应式设计**：适配PC端主流浏览器
- **动画效果**：发牌、下注等动画效果
- **音效支持**：背景音乐和操作音效
- **主题切换**：多种卡牌主题可选

### 📊 附加功能
- **游戏记录**：完整的牌局历史记录
- **自定义设置**：音效、动画速度等个性化设置
- **AI机器人**：支持添加AI玩家进行练习
- **实时统计**：筹码变化、胜率统计

## 技术架构

### 后端技术栈
- **Node.js**：服务器运行环境
- **Express**：Web框架
- **Socket.IO**：WebSocket实时通信
- **UDP**：局域网设备发现

### 前端技术栈
- **HTML5**：页面结构
- **CSS3**：样式和动画
- **JavaScript ES6+**：游戏逻辑
- **Socket.IO Client**：客户端通信

## 安装部署

### 环境要求
- Node.js 14.0 或更高版本
- npm 6.0 或更高版本
- 支持WebSocket的现代浏览器

### 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd poker
```

2. **安装依赖**
```bash
npm install
```

3. **启动服务器**
```bash
# 生产环境
npm start

# 开发环境（自动重启）
npm run dev
```

4. **访问游戏**
- 打开浏览器访问：`http://localhost:3000`
- 局域网内其他设备访问：`http://[服务器IP]:3000`

### 端口配置

默认端口配置：
- **HTTP服务器**：3000
- **UDP广播**：8889

修改端口：
```bash
# 设置环境变量
set PORT=8080
npm start

# 或在启动时指定
PORT=8080 npm start
```

### 防火墙设置

**Windows防火墙**：
1. 打开Windows防火墙设置
2. 点击"允许应用通过防火墙"
3. 添加Node.js应用
4. 确保勾选"专用网络"和"公用网络"

**手动添加端口规则**：
```bash
# 允许TCP 3000端口
netsh advfirewall firewall add rule name="Poker HTTP" dir=in action=allow protocol=TCP localport=3000

# 允许UDP 8889端口
netsh advfirewall firewall add rule name="Poker UDP" dir=in action=allow protocol=UDP localport=8889
```

## 使用指南

### 创建房间
1. 点击"创建房间"
2. 填写玩家昵称和房间名称
3. 设置游戏参数：
   - 初始筹码：500-5000
   - 小盲注：5-50
   - 最大玩家数：2-10
4. 点击"创建房间"获得6位房间号

### 加入房间
1. 点击"加入房间"
2. 输入玩家昵称
3. 输入6位房间号
4. 点击"加入房间"

### 搜索房间
1. 点击"搜索房间"
2. 系统自动搜索局域网内可用房间
3. 点击房间列表中的房间直接加入

### 游戏流程
1. **准备阶段**：所有玩家点击"准备"按钮
2. **开始游戏**：房主点击"开始游戏"
3. **下注轮次**：
   - Pre-flop：发底牌后第一轮下注
   - Flop：发3张公共牌后下注
   - Turn：发第4张公共牌后下注
   - River：发第5张公共牌后下注
4. **摊牌**：比较牌型大小，分配奖池

### 操作说明
- **弃牌**：放弃当前手牌
- **过牌**：不下注，将决定权交给下一位玩家
- **跟注**：跟上当前最高下注额
- **加注**：提高下注额
- **全下**：押上所有筹码

## 配置选项

### 服务器配置

在`server.js`中可以修改以下配置：

```javascript
// 端口设置
const SERVER_PORT = process.env.PORT || 3000;
const BROADCAST_PORT = 8889;

// 房间设置
const DEFAULT_SETTINGS = {
    initialChips: 1000,
    smallBlind: 10,
    bigBlind: 20,
    maxPlayers: 10
};
```

### 客户端设置

游戏内设置选项：
- **音效开关**：启用/禁用操作音效
- **背景音乐**：启用/禁用背景音乐
- **动画速度**：慢/正常/快
- **卡牌主题**：经典/现代/简约

## 核心算法

### 牌型判断算法

```javascript
// 牌型优先级（从高到低）
const HAND_TYPES = {
    ROYAL_FLUSH: 10,     // 皇家同花顺
    STRAIGHT_FLUSH: 9,   // 同花顺
    FOUR_KIND: 8,        // 四条
    FULL_HOUSE: 7,       // 葫芦
    FLUSH: 6,            // 同花
    STRAIGHT: 5,         // 顺子
    THREE_KIND: 4,       // 三条
    TWO_PAIR: 3,         // 两对
    PAIR: 2,             // 一对
    HIGH_CARD: 1         // 高牌
};
```

算法特点：
- 支持7张牌中选择最佳5张牌组合
- 精确的牌型比较和排序
- 处理特殊情况（如A-2-3-4-5顺子）

### 局域网通信机制

**WebSocket通信**：
- 实时双向通信
- 自动重连机制
- 消息队列处理

**UDP广播发现**：
```javascript
// 客户端发送广播
socket.send('POKER_DISCOVERY', BROADCAST_PORT, '255.255.255.255');

// 服务器响应
server.send(JSON.stringify({
    type: 'POKER_SERVER',
    port: SERVER_PORT,
    rooms: availableRooms
}));
```

## 故障排除

### 常见问题

**1. 无法连接服务器**
- 检查服务器是否正常启动
- 确认端口号是否正确
- 检查防火墙设置

**2. 局域网内其他设备无法访问**
- 确认服务器IP地址
- 检查网络连接
- 验证防火墙规则

**3. 音效无法播放**
- 检查浏览器音频权限
- 确认音频文件路径
- 尝试用户交互后再播放

**4. 游戏卡顿或延迟**
- 检查网络质量
- 降低动画速度设置
- 关闭不必要的浏览器标签页

### 调试模式

启用调试日志：
```bash
DEBUG=* npm start
```

浏览器控制台查看详细日志：
```javascript
// 启用Socket.IO调试
localStorage.debug = 'socket.io-client:*';
```

## 开发指南

### 项目结构
```
poker/
├── server.js              # 服务器主文件
├── package.json           # 项目配置
├── README.md             # 说明文档
└── public/               # 前端资源
    ├── index.html        # 主页面
    ├── styles.css        # 样式文件
    ├── game.js          # 游戏逻辑
    └── audio/           # 音频文件
        ├── background.mp3
        ├── card.mp3
        ├── chip.mp3
        └── win.mp3
```

### 扩展功能

**添加AI玩家**：
1. 在`server.js`中实现AI决策逻辑
2. 创建AI玩家管理模块
3. 集成到游戏流程中

**增加游戏模式**：
1. 扩展房间设置选项
2. 修改游戏规则逻辑
3. 更新前端界面

**数据持久化**：
1. 集成数据库（如SQLite）
2. 保存玩家统计数据
3. 实现排行榜功能

## 许可证

MIT License - 详见LICENSE文件

## 贡献指南

欢迎提交Issue和Pull Request来改进这个项目！

### 开发环境设置
1. Fork项目
2. 创建功能分支
3. 提交更改
4. 发起Pull Request

### 代码规范
- 使用ES6+语法
- 遵循JSDoc注释规范
- 保持代码简洁可读
- 添加适当的错误处理

## 联系方式

如有问题或建议，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件至开发者

---

**享受游戏，祝你好运！** 🎰♠️♥️♦️♣️
