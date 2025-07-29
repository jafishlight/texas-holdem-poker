const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * 用户模型
 * 存储用户账户信息和总筹码余额
 */
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  totalChips: {
    type: Number,
    default: 1000, // 默认初始筹码
    min: 0
  },
  avatar: {
    type: String,
    default: '/default-avatar.png'
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 密码加密中间件
UserSchema.pre('save', async function(next) {
  // 只有密码被修改时才重新加密
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 验证密码方法
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 添加筹码方法
UserSchema.methods.addChips = async function(amount) {
  if (amount <= 0) throw new Error('筹码数量必须为正数');
  
  this.totalChips += amount;
  return await this.save();
};

// 扣除筹码方法
UserSchema.methods.deductChips = async function(amount) {
  if (amount <= 0) throw new Error('筹码数量必须为正数');
  if (this.totalChips < amount) throw new Error('筹码余额不足');
  
  this.totalChips -= amount;
  return await this.save();
};

module.exports = mongoose.model('User', UserSchema);