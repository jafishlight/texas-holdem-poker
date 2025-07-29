const express = require('express');
const User = require('../models/User');
const ChipTransaction = require('../models/ChipTransaction');
const { generateToken, authenticateToken } = require('../middleware/auth');
const chipService = require('../services/chipService');

const router = express.Router();

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // 验证输入
    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱和密码都是必填项' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }
    
    // 检查用户名是否已存在
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ error: '用户名已存在' });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ error: '邮箱已被注册' });
      }
    }
    
    // 创建新用户
    const user = new User({
      username,
      email,
      password,
      totalChips: 1000 // 初始筹码
    });
    
    await user.save();
    
    // 记录注册奖励交易
    await ChipTransaction.createTransaction({
      userId: user._id,
      type: 'REGISTER_BONUS',
      amount: 1000,
      balanceBefore: 0,
      balanceAfter: 1000,
      description: '注册奖励'
    });
    
    // 生成JWT令牌
    const token = generateToken({ userId: user._id });
    
    res.status(201).json({
      success: true,
      message: '注册成功',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        totalChips: user.totalChips,
        avatar: user.avatar
      }
    });
    
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码都是必填项' });
    }
    
    // 查找用户（支持用户名或邮箱登录）
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });
    
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 验证密码
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 更新最后登录时间
    user.lastLogin = new Date();
    await user.save();
    
    // 生成JWT令牌
    const token = generateToken({ userId: user._id });
    
    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        totalChips: user.totalChips,
        avatar: user.avatar,
        lastLogin: user.lastLogin
      }
    });
    
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        totalChips: user.totalChips,
        avatar: user.avatar,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 更新用户资料
 * PUT /api/auth/profile
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    const user = req.user;
    
    if (avatar) {
      user.avatar = avatar;
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: '资料更新成功',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        totalChips: user.totalChips,
        avatar: user.avatar
      }
    });
    
  } catch (error) {
    console.error('更新资料错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 修改密码
 * PUT /api/auth/password
 */
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '当前密码和新密码都是必填项' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6位' });
    }
    
    // 验证当前密码
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: '当前密码错误' });
    }
    
    // 更新密码
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: '密码修改成功'
    });
    
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取用户筹码状态
 * GET /api/auth/chips
 */
router.get('/chips', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.query;
    const chipStatus = await chipService.getUserChipStatus(req.user._id, roomCode);
    
    res.json({
      success: true,
      chipStatus
    });
    
  } catch (error) {
    console.error('获取筹码状态错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取用户交易历史
 * GET /api/auth/transactions
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const transactions = await chipService.getUserTransactionHistory(
      req.user._id,
      parseInt(limit),
      parseInt(skip)
    );
    
    res.json({
      success: true,
      transactions
    });
    
  } catch (error) {
    console.error('获取交易历史错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取用户统计数据
 * GET /api/auth/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await chipService.getUserStats(req.user._id, parseInt(days));
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;