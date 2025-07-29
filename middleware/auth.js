const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * JWT密钥配置
 */
const JWT_SECRET = process.env.JWT_SECRET || 'texas_holdem_secret_key_2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * 生成JWT令牌
 * @param {Object} payload - 令牌载荷
 * @returns {string} JWT令牌
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证JWT令牌
 * @param {string} token - JWT令牌
 * @returns {Object} 解码后的载荷
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * 认证中间件 - Express路由使用
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: '访问令牌缺失' });
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: '无效的访问令牌' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: '访问令牌已过期' });
    }
    return res.status(500).json({ error: '服务器内部错误' });
  }
}

/**
 * Socket.IO认证中间件
 * @param {Object} socket - Socket.IO套接字对象
 * @param {Function} next - 下一个中间件函数
 */
async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error('认证令牌缺失'));
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return next(new Error('用户不存在'));
    }

    // 更新最后登录时间
    user.lastLogin = new Date();
    await user.save();

    socket.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new Error('无效的访问令牌'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new Error('访问令牌已过期'));
    }
    return next(new Error('认证失败'));
  }
}

/**
 * 管理员权限验证中间件
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

/**
 * 可选认证中间件 - 如果有令牌则验证，没有则跳过
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select('-password');
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // 可选认证失败时不阻止请求继续
    next();
  }
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateToken,
  authenticateSocket,
  requireAdmin,
  optionalAuth,
  JWT_SECRET,
  JWT_EXPIRES_IN
};