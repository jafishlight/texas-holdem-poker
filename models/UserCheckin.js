const mongoose = require('mongoose');

/**
 * 用户签到模型
 * 记录用户每日签到状态和连续签到天数
 */
const UserCheckinSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // 连续签到天数
  consecutiveDays: {
    type: Number,
    default: 0,
    min: 0
  },
  // 最后签到时间
  lastCheckinTime: {
    type: Date,
    default: null
  },
  // 总签到天数
  totalCheckinDays: {
    type: Number,
    default: 0,
    min: 0
  },
  // 本月签到天数
  monthlyCheckinDays: {
    type: Number,
    default: 0,
    min: 0
  },
  // 当前月份（用于重置月度统计）
  currentMonth: {
    type: String,
    default: () => new Date().toISOString().slice(0, 7) // YYYY-MM格式
  },
  // 创建时间
  createdAt: {
    type: Date,
    default: Date.now
  },
  // 更新时间
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 更新时间中间件
UserCheckinSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

/**
 * 检查是否可以签到（今天还未签到）
 * @returns {boolean} 是否可以签到
 */
UserCheckinSchema.methods.canCheckinToday = function() {
  if (!this.lastCheckinTime) return true;
  
  const today = new Date();
  const lastCheckin = new Date(this.lastCheckinTime);
  
  // 检查是否是同一天
  return today.toDateString() !== lastCheckin.toDateString();
};

/**
 * 执行签到操作
 * @returns {Object} 签到结果
 */
UserCheckinSchema.methods.performCheckin = function() {
  const now = new Date();
  const today = now.toDateString();
  
  if (!this.canCheckinToday()) {
    throw new Error('今日已签到');
  }
  
  // 检查是否连续签到
  let isConsecutive = false;
  if (this.lastCheckinTime) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastCheckin = new Date(this.lastCheckinTime);
    
    isConsecutive = yesterday.toDateString() === lastCheckin.toDateString();
  }
  
  // 更新签到数据
  if (isConsecutive || !this.lastCheckinTime) {
    this.consecutiveDays += 1;
  } else {
    this.consecutiveDays = 1; // 重置连续签到
  }
  
  this.lastCheckinTime = now;
  this.totalCheckinDays += 1;
  
  // 检查月份是否变化
  const currentMonth = now.toISOString().slice(0, 7);
  if (this.currentMonth !== currentMonth) {
    this.monthlyCheckinDays = 1;
    this.currentMonth = currentMonth;
  } else {
    this.monthlyCheckinDays += 1;
  }
  
  return {
    consecutiveDays: this.consecutiveDays,
    totalDays: this.totalCheckinDays,
    monthlyDays: this.monthlyCheckinDays,
    isWeekend: now.getDay() === 0 || now.getDay() === 6
  };
};

/**
 * 计算签到奖励
 * @param {boolean} isWeekend 是否周末
 * @returns {number} 奖励筹码数量
 */
UserCheckinSchema.methods.calculateReward = function(isWeekend = false) {
  const baseRewards = {
    1: 5000,
    2: 8000,
    3: 12000,
    4: 18000,
    5: 25000,
    6: 35000,
    7: 50000
  };
  
  // 7天后循环，但保持最高奖励
  const day = this.consecutiveDays > 7 ? 7 : this.consecutiveDays;
  let reward = baseRewards[day] || baseRewards[7];
  
  // 周末1.5倍奖励
  if (isWeekend) {
    reward = Math.floor(reward * 1.5);
  }
  
  return reward;
};

module.exports = mongoose.model('UserCheckin', UserCheckinSchema);