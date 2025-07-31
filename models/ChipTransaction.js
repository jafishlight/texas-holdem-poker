const mongoose = require('mongoose');

/**
 * 筹码交易记录模型
 * 记录所有筹码变动历史，用于审计和统计
 */
const ChipTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'REGISTER_BONUS',    // 注册奖励
      'ROOM_ENTRY',        // 进入房间
      'ROOM_EXIT',         // 退出房间
      'GAME_WIN',          // 游戏获胜
      'GAME_LOSS',         // 游戏失败
      'ADMIN_ADJUST',      // 管理员调整
      'DAILY_BONUS',       // 每日奖励
      'PURCHASE',          // 购买筹码
      'task_reward'        // 任务奖励
    ],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  roomCode: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 索引优化
ChipTransactionSchema.index({ userId: 1, createdAt: -1 });
ChipTransactionSchema.index({ type: 1, createdAt: -1 });
ChipTransactionSchema.index({ roomCode: 1, createdAt: -1 });

// 静态方法：创建交易记录
ChipTransactionSchema.statics.createTransaction = async function({
  userId,
  type,
  amount,
  balanceBefore,
  balanceAfter,
  roomCode = null,
  description = '',
  metadata = {}
}) {
  const transaction = new this({
    userId,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    roomCode,
    description,
    metadata
  });
  
  return await transaction.save();
};

// 静态方法：获取用户交易历史
ChipTransactionSchema.statics.getUserTransactions = async function(userId, limit = 50, skip = 0) {
  return await this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('userId', 'username avatar');
};

// 静态方法：获取用户统计数据
ChipTransactionSchema.statics.getUserStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    }
  ]);
  
  return stats;
};

module.exports = mongoose.model('ChipTransaction', ChipTransactionSchema);