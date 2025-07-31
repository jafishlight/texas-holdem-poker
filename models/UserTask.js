const mongoose = require('mongoose');

/**
 * 用户任务模型
 * 记录用户任务进度和完成状态
 */
const UserTaskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 任务类型：daily(日常), growth(成长), challenge(挑战)
  taskType: {
    type: String,
    enum: ['daily', 'growth', 'challenge'],
    required: true
  },
  // 任务ID（用于标识具体任务）
  taskId: {
    type: String,
    required: true
  },
  // 任务名称
  taskName: {
    type: String,
    required: true
  },
  // 任务描述
  taskDescription: {
    type: String,
    required: true
  },
  // 当前进度
  progress: {
    type: Number,
    default: 0,
    min: 0
  },
  // 目标进度
  targetProgress: {
    type: Number,
    required: true,
    min: 1
  },
  // 是否已完成
  isCompleted: {
    type: Boolean,
    default: false
  },
  // 是否已领取奖励
  isRewarded: {
    type: Boolean,
    default: false
  },
  // 奖励筹码数量
  rewardChips: {
    type: Number,
    required: true,
    min: 0
  },
  // 任务刷新日期（日常任务用）
  refreshDate: {
    type: String, // YYYY-MM-DD格式
    default: null
  },
  // 完成时间
  completedAt: {
    type: Date,
    default: null
  },
  // 领取奖励时间
  rewardedAt: {
    type: Date,
    default: null
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

// 复合索引
UserTaskSchema.index({ userId: 1, taskType: 1, taskId: 1 });
UserTaskSchema.index({ userId: 1, isCompleted: 1, isRewarded: 1 });
UserTaskSchema.index({ refreshDate: 1, taskType: 1 });

// 更新时间中间件
UserTaskSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

/**
 * 更新任务进度
 * @param {number} increment 进度增量
 * @returns {boolean} 是否完成任务
 */
UserTaskSchema.methods.updateProgress = function(increment = 1) {
  if (this.isCompleted) {
    return true;
  }
  
  this.progress = Math.min(this.progress + increment, this.targetProgress);
  
  if (this.progress >= this.targetProgress && !this.isCompleted) {
    this.isCompleted = true;
    this.completedAt = new Date();
    return true;
  }
  
  return false;
};

/**
 * 领取任务奖励
 * @returns {number} 奖励筹码数量
 */
UserTaskSchema.methods.claimReward = function() {
  if (!this.isCompleted) {
    throw new Error('任务未完成，无法领取奖励');
  }
  
  if (this.isRewarded) {
    throw new Error('奖励已领取');
  }
  
  this.isRewarded = true;
  this.rewardedAt = new Date();
  
  return this.rewardChips;
};

/**
 * 检查任务是否过期（仅日常任务）
 * @returns {boolean} 是否过期
 */
UserTaskSchema.methods.isExpired = function() {
  if (this.taskType !== 'daily') {
    return false;
  }
  
  const today = new Date().toISOString().slice(0, 10);
  return this.refreshDate !== today;
};

/**
 * 获取任务进度百分比
 * @returns {number} 进度百分比（0-100）
 */
UserTaskSchema.methods.getProgressPercentage = function() {
  return Math.floor((this.progress / this.targetProgress) * 100);
};

// 静态方法：获取任务模板
UserTaskSchema.statics.getTaskTemplates = function() {
  return {
    daily: {
      'complete_game': {
        name: '完成游戏',
        description: '完成1局游戏',
        targetProgress: 1,
        rewardChips: 8000
      },
      'win_game': {
        name: '获得胜利',
        description: '获得1次胜利',
        targetProgress: 1,
        rewardChips: 15000
      },
      'achieve_flush': {
        name: '达成同花',
        description: '达成1次同花牌型',
        targetProgress: 1,
        rewardChips: 20000
      }
    },
    growth: {
      'login_7_days': {
        name: '连续登录',
        description: '累计登录7天',
        targetProgress: 7,
        rewardChips: 100000
      },
      'complete_10_games': {
        name: '游戏达人',
        description: '完成10局游戏',
        targetProgress: 10,
        rewardChips: 80000
      },
      'win_5_games': {
        name: '胜利之星',
        description: '获得5次胜利',
        targetProgress: 5,
        rewardChips: 150000
      },
      'achieve_straight_flush': {
        name: '同花顺大师',
        description: '达成1次同花顺',
        targetProgress: 1,
        rewardChips: 500000
      },
      'earn_10000_chips': {
        name: '财富积累',
        description: '累计赢得10000筹码',
        targetProgress: 10000,
        rewardChips: 100000
      }
    }
  };
};

// 静态方法：创建日常任务
UserTaskSchema.statics.createDailyTasks = async function(userId) {
  const templates = this.getTaskTemplates().daily;
  const today = new Date().toISOString().slice(0, 10);
  
  // 随机选择3个日常任务
  const taskIds = Object.keys(templates);
  const selectedTasks = taskIds.sort(() => 0.5 - Math.random()).slice(0, 3);
  
  const tasks = [];
  for (const taskId of selectedTasks) {
    const template = templates[taskId];
    tasks.push({
      userId,
      taskType: 'daily',
      taskId,
      taskName: template.name,
      taskDescription: template.description,
      targetProgress: template.targetProgress,
      rewardChips: template.rewardChips,
      refreshDate: today
    });
  }
  
  return await this.insertMany(tasks);
};

// 静态方法：创建成长任务
UserTaskSchema.statics.createGrowthTasks = async function(userId) {
  const templates = this.getTaskTemplates().growth;
  
  const tasks = [];
  for (const [taskId, template] of Object.entries(templates)) {
    // 检查是否已存在该成长任务
    const existingTask = await this.findOne({
      userId,
      taskType: 'growth',
      taskId
    });
    
    if (!existingTask) {
      tasks.push({
        userId,
        taskType: 'growth',
        taskId,
        taskName: template.name,
        taskDescription: template.description,
        targetProgress: template.targetProgress,
        rewardChips: template.rewardChips
      });
    }
  }
  
  if (tasks.length > 0) {
    return await this.insertMany(tasks);
  }
  
  return [];
};

module.exports = mongoose.model('UserTask', UserTaskSchema);