# 德州扑克筹码管理系统 🃏💰

## 系统概述

本系统为德州扑克游戏实现了完整的筹码管理功能，包括用户认证、总筹码管理、房间筹码转移、交易记录等核心功能。

## 核心功能 ✨

### 1. 用户系统
- 🔐 用户注册/登录
- 👤 用户资料管理
- 🎯 头像系统
- 👑 管理员权限

### 2. 筹码管理
- 💎 总筹码余额管理
- 🏠 房间筹码转移
- 📊 实时筹码同步
- 🔄 自动筹码回收

### 3. 交易系统
- 📝 完整交易记录
- 📈 统计分析
- 🔍 交易历史查询
- 🛡️ 防作弊机制

## 技术架构 🏗️

### 后端技术栈
- **Node.js** + **Express.js** - 服务器框架
- **Socket.IO** - 实时通信
- **MongoDB** + **Mongoose** - 数据库
- **JWT** - 身份认证
- **bcryptjs** - 密码加密

### 数据模型

#### 用户模型 (User)
```javascript
{
  username: String,     // 用户名
  email: String,        // 邮箱
  password: String,     // 加密密码
  totalChips: Number,   // 总筹码
  avatar: String,       // 头像
  isAdmin: Boolean,     // 管理员标识
  lastLogin: Date,      // 最后登录时间
  createdAt: Date       // 创建时间
}
```

#### 房间筹码记录 (RoomBalance)
```javascript
{
  userId: ObjectId,     // 用户ID
  roomCode: String,     // 房间代码
  currentChips: Number, // 当前筹码
  entryTime: Date,      // 进入时间
  exitTime: Date,       // 退出时间
  isActive: Boolean,    // 活跃状态
  initialChips: Number, // 初始筹码
  finalChips: Number    // 最终筹码
}
```

#### 筹码交易记录 (ChipTransaction)
```javascript
{
  userId: ObjectId,     // 用户ID
  type: String,         // 交易类型
  amount: Number,       // 交易金额
  balanceBefore: Number,// 交易前余额
  balanceAfter: Number, // 交易后余额
  roomCode: String,     // 房间代码
  description: String,  // 描述
  metadata: Object,     // 元数据
  createdAt: Date       // 创建时间
}
```

## 安装和配置 ⚙️

### 1. 环境要求
- Node.js 16+
- MongoDB 4.4+
- npm 或 yarn

### 2. 安装依赖
```bash
npm install
```

### 3. 环境配置
复制 `.env.example` 到 `.env` 并配置：
```env
# 数据库配置
MONGODB_URI=mongodb://localhost:27017/poker_game

# JWT配置
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=3000
NODE_ENV=development

# Session配置
SESSION_SECRET=your_session_secret_key_here

# 游戏配置
DEFAULT_CHIPS=1000
MIN_ROOM_CHIPS=100
MAX_ROOM_CHIPS=10000
```

### 4. 数据库初始化
```bash
# 初始化数据库（创建测试用户）
npm run init-db

# 重置数据库
npm run reset-db
```

### 5. 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## API 接口 📡

### 认证接口
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/profile` - 更新用户资料
- `PUT /api/auth/password` - 修改密码
- `GET /api/auth/chips` - 获取筹码状态
- `GET /api/auth/transactions` - 获取交易历史
- `GET /api/auth/stats` - 获取用户统计

### 房间接口
- `POST /api/room/enter` - 进入房间
- `POST /api/room/exit` - 退出房间
- `GET /api/room/:roomCode/chips` - 获取房间筹码状态
- `GET /api/room/:roomCode/check-entry` - 检查准入条件
- `GET /api/room/:roomCode/players-chips` - 获取所有玩家筹码
- `POST /api/room/:roomCode/add-chips` - 补充房间筹码

### 健康检查
- `GET /api/health` - 服务器和数据库状态检查

## Socket.IO 事件 🔌

### 客户端发送事件
- `createRoom` - 创建房间
- `joinRoom` - 加入房间
- `leaveRoom` - 离开房间
- `playerAction` - 玩家操作（下注、弃牌等）
- `takeSeat` - 坐下
- `leaveSeat` - 离开座位

### 服务器发送事件
- `joinedRoom` - 成功加入房间
- `leftRoom` - 成功离开房间
- `playerJoined` - 玩家加入
- `playerLeft` - 玩家离开
- `chipUpdate` - 筹码更新
- `gameStateUpdate` - 游戏状态更新
- `error` - 错误信息

## 测试账户 👥

系统预设了以下测试账户：

| 用户名 | 密码 | 筹码 | 权限 |
|--------|------|------|------|
| admin | admin123 | 100,000 | 管理员 |
| player1 | password123 | 5,000 | 普通用户 |
| player2 | password123 | 3,000 | 普通用户 |
| player3 | password123 | 2,000 | 普通用户 |

## 筹码管理流程 🔄

### 1. 用户注册
- 新用户注册时自动获得初始筹码（默认1000）
- 记录注册奖励交易

### 2. 进入房间
- 检查用户总筹码是否满足房间最低要求
- 将指定数量筹码从总筹码转移到房间筹码
- 创建房间筹码记录
- 记录进入房间交易

### 3. 游戏中筹码变化
- 实时同步房间内筹码变化到数据库
- 记录每次下注、赢取等操作
- 防止筹码数据不一致

### 4. 退出房间
- 将剩余房间筹码转回总筹码
- 更新房间筹码记录状态
- 记录退出房间交易
- 计算盈亏统计

### 5. 异常处理
- 断线重连时自动处理筹码转移
- 游戏异常结束时保护玩家筹码
- 并发操作时使用事务保证数据一致性

## 安全特性 🛡️

### 1. 身份认证
- JWT令牌认证
- 密码bcrypt加密
- Session管理

### 2. 数据保护
- MongoDB事务支持
- 并发控制
- 数据验证

### 3. 防作弊
- 服务器端验证所有操作
- 完整的审计日志
- 实时监控异常行为

## 监控和日志 📊

### 1. 交易监控
- 所有筹码变化都有详细记录
- 支持按时间、用户、房间查询
- 异常交易自动告警

### 2. 性能监控
- 数据库连接状态监控
- API响应时间统计
- 内存使用情况跟踪

### 3. 错误日志
- 详细的错误堆栈信息
- 分级日志记录
- 自动错误恢复机制

## 开发指南 👨‍💻

### 1. 添加新的筹码操作
```javascript
// 在ChipService中添加新方法
async customChipOperation(userId, amount, description) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    
    // 执行筹码操作
    const user = await User.findById(userId).session(session);
    const newBalance = user.totalChips + amount;
    
    // 更新用户筹码
    await user.updateOne({ totalChips: newBalance }).session(session);
    
    // 记录交易
    await ChipTransaction.create([{
      userId,
      type: 'custom_operation',
      amount,
      balanceBefore: user.totalChips,
      balanceAfter: newBalance,
      description
    }], { session });
    
    await session.commitTransaction();
    return { success: true, newBalance };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

### 2. 添加新的API接口
```javascript
// 在routes中添加新路由
router.post('/custom-operation', authenticateToken, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const result = await chipService.customChipOperation(
      req.user._id, 
      amount, 
      description
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
```

## 故障排除 🔧

### 常见问题

1. **数据库连接失败**
   - 检查MongoDB服务是否启动
   - 验证连接字符串配置
   - 检查网络连接

2. **JWT认证失败**
   - 检查JWT_SECRET配置
   - 验证token是否过期
   - 确认请求头格式正确

3. **筹码数据不一致**
   - 检查事务是否正确提交
   - 验证并发操作处理
   - 查看错误日志定位问题

4. **Socket连接问题**
   - 检查CORS配置
   - 验证认证中间件
   - 确认客户端连接参数

### 日志查看
```bash
# 查看应用日志
npm run dev

# 查看数据库日志
mongod --logpath /var/log/mongodb/mongod.log
```

## 部署指南 🚀

### 1. 生产环境配置
```env
NODE_ENV=production
MONGODB_URI=mongodb://your-production-db
JWT_SECRET=your-strong-secret-key
SESSION_SECRET=your-strong-session-secret
```

### 2. 安全配置
- 使用HTTPS
- 配置防火墙
- 设置强密码策略
- 启用数据库认证

### 3. 性能优化
- 启用数据库索引
- 配置连接池
- 使用CDN加速静态资源
- 启用Gzip压缩

## 贡献指南 🤝

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证 📄

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式 📧

- 开发者邮箱: fishlights@qq.com
- 项目地址: [GitHub Repository]

---

**享受游戏，负责任地玩耍！** 🎮✨