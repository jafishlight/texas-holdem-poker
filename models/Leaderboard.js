const mongoose = require('mongoose');

/**
 * 排行榜模型
 * 缓存各种排行榜数据，定期更新
 */
const LeaderboardSchema = new mongoose.Schema({
  // 排行榜类型
  rankType: {
    type: String,
    enum: ['total_chips', 'win_rate', 'games_played', 'monthly_earnings'],
    required: true,
    unique: true
  },
  // 排行榜数据（JSON格式存储前10名）
  data: {
    type: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        username: {
          type: String,
          required: true
        },
        avatar: {
          type: String,
          default: '/default-avatar.png'
        },
        value: {
          type: Number,
          required: true
        },
        rank: {
          type: Number,
          required: true
        },
        // 额外数据（如胜率的总局数等）
        extraData: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }
    ],
    default: []
  },
  // 最后更新时间
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  // 下次更新时间
  nextUpdate: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10分钟后
  },
  // 创建时间
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 索引
LeaderboardSchema.index({ rankType: 1 });
LeaderboardSchema.index({ nextUpdate: 1 });

/**
 * 检查是否需要更新
 * @returns {boolean} 是否需要更新
 */
LeaderboardSchema.methods.needsUpdate = function() {
  return new Date() >= this.nextUpdate;
};

/**
 * 更新排行榜数据
 * @param {Array} newData 新的排行榜数据
 */
LeaderboardSchema.methods.updateData = function(newData) {
  this.data = newData.slice(0, 10); // 只保留前10名
  this.lastUpdated = new Date();
  this.nextUpdate = new Date(Date.now() + 10 * 60 * 1000); // 10分钟后更新
};

/**
 * 获取用户在排行榜中的排名
 * @param {string} userId 用户ID
 * @returns {Object|null} 用户排名信息
 */
LeaderboardSchema.methods.getUserRank = function(userId) {
  const userEntry = this.data.find(entry => entry.userId.toString() === userId.toString());
  if (userEntry) {
    return {
      rank: userEntry.rank,
      value: userEntry.value,
      inTopTen: true
    };
  }
  return null;
};

/**
 * 获取排行榜奖励配置
 * @returns {Object} 奖励配置
 */
LeaderboardSchema.statics.getRewardConfig = function() {
  return {
    total_chips: {
      1: 100000,  // 第1名
      2: 80000,   // 第2名
      3: 50000,   // 第3名
      4: 30000,   // 第4名
      5: 25000,   // 第5名
      6: 20000,   // 第6名
      7: 15000,   // 第7名
      8: 12000,   // 第8名
      9: 10000,   // 第9名
      10: 8000    // 第10名
    }
  };
};

/**
 * 计算用户排行榜奖励
 * @param {string} rankType 排行榜类型
 * @param {number} rank 排名
 * @returns {number} 奖励筹码
 */
LeaderboardSchema.statics.calculateReward = function(rankType, rank) {
  const config = this.getRewardConfig();
  if (config[rankType] && config[rankType][rank]) {
    return config[rankType][rank];
  }
  return 0;
};

/**
 * 静态方法：更新总筹码排行榜
 */
LeaderboardSchema.statics.updateTotalChipsLeaderboard = async function() {
  const User = mongoose.model('User');
  
  // 获取总筹码前10名用户
  const topUsers = await User.find({})
    .sort({ totalChips: -1 })
    .limit(10)
    .select('username avatar totalChips')
    .lean();
  
  const leaderboardData = topUsers.map((user, index) => ({
    userId: user._id,
    username: user.username,
    avatar: user.avatar,
    value: user.totalChips,
    rank: index + 1,
    extraData: {}
  }));
  
  // 更新或创建排行榜记录
  await this.findOneAndUpdate(
    { rankType: 'total_chips' },
    {
      $set: {
        data: leaderboardData,
        lastUpdated: new Date(),
        nextUpdate: new Date(Date.now() + 10 * 60 * 1000)
      }
    },
    { upsert: true, new: true }
  );
  
  return leaderboardData;
};

/**
 * 静态方法：更新胜率排行榜
 */
LeaderboardSchema.statics.updateWinRateLeaderboard = async function() {
  const ChipTransaction = mongoose.model('ChipTransaction');
  const User = mongoose.model('User');
  
  // 聚合查询计算胜率（需要至少10局游戏）
  const winRateData = await ChipTransaction.aggregate([
    {
      $match: {
        type: { $in: ['game_win', 'game_loss'] }
      }
    },
    {
      $group: {
        _id: '$userId',
        totalGames: { $sum: 1 },
        wins: {
          $sum: {
            $cond: [{ $eq: ['$type', 'game_win'] }, 1, 0]
          }
        }
      }
    },
    {
      $match: {
        totalGames: { $gte: 10 } // 至少10局游戏
      }
    },
    {
      $addFields: {
        winRate: {
          $multiply: [
            { $divide: ['$wins', '$totalGames'] },
            100
          ]
        }
      }
    },
    {
      $sort: { winRate: -1 }
    },
    {
      $limit: 10
    }
  ]);
  
  // 获取用户信息
  const userIds = winRateData.map(item => item._id);
  const users = await User.find({ _id: { $in: userIds } })
    .select('username avatar')
    .lean();
  
  const userMap = users.reduce((map, user) => {
    map[user._id.toString()] = user;
    return map;
  }, {});
  
  const leaderboardData = winRateData.map((item, index) => {
    const user = userMap[item._id.toString()];
    return {
      userId: item._id,
      username: user?.username || 'Unknown',
      avatar: user?.avatar || '/default-avatar.png',
      value: Math.round(item.winRate * 100) / 100, // 保留2位小数
      rank: index + 1,
      extraData: {
        totalGames: item.totalGames,
        wins: item.wins
      }
    };
  });
  
  // 更新排行榜
  await this.findOneAndUpdate(
    { rankType: 'win_rate' },
    {
      $set: {
        data: leaderboardData,
        lastUpdated: new Date(),
        nextUpdate: new Date(Date.now() + 10 * 60 * 1000)
      }
    },
    { upsert: true, new: true }
  );
  
  return leaderboardData;
};

/**
 * 静态方法：发放每日排行榜奖励
 */
LeaderboardSchema.statics.distributeDailyRewards = async function() {
  const ChipService = require('../services/chipService');
  const rewardConfig = this.getRewardConfig();
  
  // 获取总筹码排行榜
  const totalChipsBoard = await this.findOne({ rankType: 'total_chips' });
  
  if (!totalChipsBoard || !totalChipsBoard.data.length) {
    return { distributed: 0, totalAmount: 0 };
  }
  
  let distributed = 0;
  let totalAmount = 0;
  
  // 为前10名发放奖励
  for (const entry of totalChipsBoard.data) {
    const reward = rewardConfig.total_chips[entry.rank];
    if (reward > 0) {
      try {
        await ChipService.addChips(
          entry.userId,
          reward,
          'daily_leaderboard_reward',
          `每日排行榜第${entry.rank}名奖励`
        );
        distributed++;
        totalAmount += reward;
      } catch (error) {
        console.error(`发放排行榜奖励失败 - 用户: ${entry.userId}, 奖励: ${reward}`, error);
      }
    }
  }
  
  return { distributed, totalAmount };
};

module.exports = mongoose.model('Leaderboard', LeaderboardSchema);