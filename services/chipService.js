const User = require('../models/User');
const RoomBalance = require('../models/RoomBalance');
const ChipTransaction = require('../models/ChipTransaction');
const UserCheckin = require('../models/UserCheckin');
const UserTask = require('../models/UserTask');
const Leaderboard = require('../models/Leaderboard');
const mongoose = require('mongoose');

/**
 * 筹码管理服务
 * 处理总筹码与房间筹码之间的转移逻辑
 */
class ChipService {
  /**
   * 用户进入房间 - 从总筹码转移到房间筹码
   * @param {string} userId - 用户ID
   * @param {string} roomCode - 房间代码
   * @param {number} chipsToEnter - 要转入房间的筹码数量
   * @returns {Object} 操作结果
   */
  async enterRoom(userId, roomCode, chipsToEnter) {
    try {
      // 获取用户信息
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('用户不存在');
      }
      
      // 验证筹码数量
      if (chipsToEnter <= 0) {
        throw new Error('转入筹码数量必须大于0');
      }
      
      if (user.totalChips < chipsToEnter) {
        throw new Error(`筹码余额不足，当前余额: ${user.totalChips}，需要: ${chipsToEnter}`);
      }
      
      // 检查是否已在房间内
      const existingBalance = await RoomBalance.findOne({
        userId,
        roomCode,
        isActive: true
      });
      
      if (existingBalance) {
        throw new Error('用户已在该房间内');
      }
      
      // 记录操作前余额
      const balanceBefore = user.totalChips;
      
      // 扣除总筹码
      user.totalChips -= chipsToEnter;
      await user.save();
      
      // 创建房间筹码记录
      const roomBalance = new RoomBalance({
        userId,
        roomCode,
        chips: chipsToEnter,
        initialChips: chipsToEnter
      });
      await roomBalance.save();
      
      // 记录交易历史
      await ChipTransaction.createTransaction({
        userId,
        type: 'ROOM_ENTRY',
        amount: -chipsToEnter,
        balanceBefore,
        balanceAfter: user.totalChips,
        roomCode,
        description: `进入房间 ${roomCode}`,
        metadata: { roomBalance: roomBalance._id }
      });
      
      return {
        success: true,
        totalChips: user.totalChips,
        roomChips: chipsToEnter,
        roomBalanceId: roomBalance._id
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * 用户退出房间 - 从房间筹码转移回总筹码
   * @param {string} userId - 用户ID
   * @param {string} roomCode - 房间代码
   * @returns {Object} 操作结果
   */
  async exitRoom(userId, roomCode) {
    try {
      // 获取用户信息
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('用户不存在');
      }
      
      // 获取房间筹码记录
      const roomBalance = await RoomBalance.findOne({
        userId,
        roomCode,
        isActive: true
      });
      
      if (!roomBalance) {
        throw new Error('用户不在该房间内');
      }
      
      // 记录操作前余额
      const balanceBefore = user.totalChips;
      const roomChips = roomBalance.chips;
      
      // 转回总筹码
      user.totalChips += roomChips;
      await user.save();
      
      // 标记房间记录为已退出
      await roomBalance.exitRoom();
      
      // 记录交易历史
      await ChipTransaction.createTransaction({
        userId,
        type: 'ROOM_EXIT',
        amount: roomChips,
        balanceBefore,
        balanceAfter: user.totalChips,
        roomCode,
        description: `退出房间 ${roomCode}`,
        metadata: {
          roomBalance: roomBalance._id,
          profitLoss: roomBalance.calculateProfitLoss()
        }
      });
      
      return {
        success: true,
        totalChips: user.totalChips,
        roomChips: 0,
        profitLoss: roomBalance.calculateProfitLoss()
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * 更新房间内筹码数量（游戏过程中）
   * @param {string} userId - 用户ID
   * @param {string} roomCode - 房间代码
   * @param {number} newAmount - 新的筹码数量
   * @returns {Object} 操作结果
   */
  async updateRoomChips(userId, roomCode, newAmount) {
    try {
      if (newAmount < 0) {
        throw new Error('房间筹码不能为负数');
      }
      
      const roomBalance = await RoomBalance.findOne({
        userId,
        roomCode,
        isActive: true
      });
      
      if (!roomBalance) {
        throw new Error('用户不在该房间内');
      }
      
      const oldAmount = roomBalance.chips;
      await roomBalance.updateChips(newAmount);
      
      return {
        success: true,
        oldAmount,
        newAmount,
        change: newAmount - oldAmount
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * 获取用户筹码状态
   * @param {string} userId - 用户ID
   * @param {string} roomCode - 房间代码（可选）
   * @returns {Object} 筹码状态
   */
  async getUserChipStatus(userId, roomCode = null) {
    try {
      const user = await User.findById(userId).select('username totalChips');
      if (!user) {
        throw new Error('用户不存在');
      }
      
      const result = {
        userId,
        username: user.username,
        totalChips: user.totalChips,
        roomChips: 0,
        isInRoom: false
      };
      
      if (roomCode) {
        const roomBalance = await RoomBalance.findOne({
          userId,
          roomCode,
          isActive: true
        });
        
        if (roomBalance) {
          result.roomChips = roomBalance.chips;
          result.isInRoom = true;
          result.roomBalanceId = roomBalance._id;
          result.entryTime = roomBalance.entryTime;
          result.initialChips = roomBalance.initialChips;
          result.currentProfitLoss = roomBalance.calculateProfitLoss();
        }
      }
      
      return result;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * 管理员调整用户筹码
   * @param {string} userId - 用户ID
   * @param {number} amount - 调整数量（正数为增加，负数为减少）
   * @param {string} reason - 调整原因
   * @param {string} adminId - 管理员ID
   * @returns {Object} 操作结果
   */
  async adminAdjustChips(userId, amount, reason, adminId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('用户不存在');
      }
      
      const balanceBefore = user.totalChips;
      
      if (amount < 0 && user.totalChips < Math.abs(amount)) {
        throw new Error('用户筹码余额不足');
      }
      
      user.totalChips += amount;
      await user.save();
      
      // 记录交易历史
      await ChipTransaction.create({
        userId,
        type: 'ADMIN_ADJUST',
        amount,
        balanceBefore,
        balanceAfter: user.totalChips,
        description: reason,
        metadata: { adminId }
      });
      
      return {
        success: true,
        newBalance: user.totalChips,
        adjustment: amount
      };
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * 获取用户交易历史
   * @param {string} userId - 用户ID
   * @param {number} limit - 限制数量
   * @param {number} skip - 跳过数量
   * @returns {Array} 交易历史
   */
  async getUserTransactionHistory(userId, limit = 50, skip = 0) {
    try {
      return await ChipTransaction.getUserTransactions(userId, limit, skip);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * 获取用户统计数据
   * @param {string} userId - 用户ID
   * @param {number} days - 统计天数
   * @returns {Object} 统计数据
   */
  async getUserStats(userId, days = 30) {
    try {
      const stats = await ChipTransaction.getUserStats(userId, days);
      const user = await User.findById(userId).select('username totalChips createdAt');
      
      return {
        user: {
          username: user.username,
          totalChips: user.totalChips,
          memberSince: user.createdAt
        },
        period: `${days}天`,
        transactions: stats
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 用户签到
   * @param {string} userId - 用户ID
   * @returns {Object} 签到结果
   */
  async performCheckin(userId) {
    try {
      // 获取或创建签到记录
      let checkinRecord = await UserCheckin.findOne({ userId });
      if (!checkinRecord) {
        checkinRecord = new UserCheckin({ userId });
      }
      
      // 检查是否可以签到
      if (!checkinRecord.canCheckinToday()) {
        throw new Error('今日已签到');
      }
      
      // 执行签到
      const checkinResult = checkinRecord.performCheckin();
      await checkinRecord.save();
      
      // 计算奖励
      const reward = checkinRecord.calculateReward(checkinResult.isWeekend);
      
      // 发放奖励
      const user = await User.findById(userId);
      const balanceBefore = user.totalChips;
      user.totalChips += reward;
      await user.save();
      
      // 记录交易
      await ChipTransaction.create({
        userId,
        type: 'daily_checkin',
        amount: reward,
        balanceBefore,
        balanceAfter: user.totalChips,
        description: `第${checkinResult.consecutiveDays}天签到奖励${checkinResult.isWeekend ? '(周末加成)' : ''}`,
        metadata: {
          consecutiveDays: checkinResult.consecutiveDays,
          isWeekend: checkinResult.isWeekend
        }
      });
      
      return {
        success: true,
        reward,
        consecutiveDays: checkinResult.consecutiveDays,
        totalDays: checkinResult.totalDays,
        monthlyDays: checkinResult.monthlyDays,
        isWeekend: checkinResult.isWeekend,
        newBalance: user.totalChips
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取用户签到状态
   * @param {string} userId - 用户ID
   * @returns {Object} 签到状态
   */
  async getCheckinStatus(userId) {
    try {
      let checkinRecord = await UserCheckin.findOne({ userId });
      if (!checkinRecord) {
        checkinRecord = new UserCheckin({ userId });
        await checkinRecord.save();
      }
      
      const canCheckin = checkinRecord.canCheckinToday();
      const nextReward = checkinRecord.calculateReward(
        new Date().getDay() === 0 || new Date().getDay() === 6
      );
      
      return {
        canCheckin,
        consecutiveDays: checkinRecord.consecutiveDays,
        totalDays: checkinRecord.totalCheckinDays,
        monthlyDays: checkinRecord.monthlyCheckinDays,
        nextReward,
        lastCheckinTime: checkinRecord.lastCheckinTime
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 更新任务进度
   * @param {string} userId - 用户ID
   * @param {string} taskType - 任务类型
   * @param {string} taskId - 任务ID
   * @param {number} increment - 进度增量
   * @returns {Object} 更新结果
   */
  async updateTaskProgress(userId, taskType, taskId, increment = 1) {
    try {
      const task = await UserTask.findOne({
        userId,
        taskType,
        taskId,
        isCompleted: false
      });
      
      if (!task) {
        return { found: false };
      }
      
      const wasCompleted = task.updateProgress(increment);
      await task.save();
      
      return {
        found: true,
        completed: wasCompleted,
        progress: task.progress,
        targetProgress: task.targetProgress,
        taskName: task.taskName
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 领取任务奖励
   * @param {string} userId - 用户ID
   * @param {string} taskId - 任务ID
   * @returns {Object} 领取结果
   */
  async claimTaskReward(userId, taskId) {
    try {
      const task = await UserTask.findOne({
        _id: taskId,
        userId,
        isCompleted: true,
        isRewarded: false
      });
      
      if (!task) {
        throw new Error('任务不存在或无法领取奖励');
      }
      
      // 领取奖励
      const reward = task.claimReward();
      await task.save();
      
      // 发放筹码
      const user = await User.findById(userId);
      const balanceBefore = user.totalChips;
      user.totalChips += reward;
      await user.save();
      
      // 记录交易
      await ChipTransaction.create({
        userId,
        type: 'task_reward',
        amount: reward,
        balanceBefore,
        balanceAfter: user.totalChips,
        description: `完成任务「${task.taskName}」奖励`,
        metadata: {
          taskType: task.taskType,
          taskId: task.taskId,
          taskName: task.taskName
        }
      });
      
      return {
        success: true,
        reward,
        taskName: task.taskName,
        newBalance: user.totalChips
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取用户任务列表
   * @param {string} userId - 用户ID
   * @param {string} taskType - 任务类型（可选）
   * @returns {Array} 任务列表
   */
  async getUserTasks(userId, taskType = null) {
    try {
      const query = { userId };
      if (taskType) {
        query.taskType = taskType;
      }
      
      // 清理过期的日常任务
      await this.cleanupExpiredDailyTasks(userId);
      
      // 确保有日常任务
      if (!taskType || taskType === 'daily') {
        await this.ensureDailyTasks(userId);
      }
      
      // 确保有成长任务
      if (!taskType || taskType === 'growth') {
        await this.ensureGrowthTasks(userId);
      }
      
      const tasks = await UserTask.find(query)
        .sort({ taskType: 1, createdAt: 1 })
        .lean();
      
      return tasks.map(task => ({
        ...task,
        progressPercentage: Math.floor((task.progress / task.targetProgress) * 100),
        canClaim: task.isCompleted && !task.isRewarded
      }));
    } catch (error) {
      throw error;
    }
  }

  /**
   * 清理过期的日常任务
   * @param {string} userId - 用户ID
   */
  async cleanupExpiredDailyTasks(userId) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await UserTask.deleteMany({
        userId,
        taskType: 'daily',
        refreshDate: { $ne: today }
      });
    } catch (error) {
      console.error('清理过期日常任务失败:', error);
    }
  }

  /**
   * 确保用户有日常任务
   * @param {string} userId - 用户ID
   */
  async ensureDailyTasks(userId) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const existingTasks = await UserTask.countDocuments({
        userId,
        taskType: 'daily',
        refreshDate: today
      });
      
      if (existingTasks === 0) {
        await UserTask.createDailyTasks(userId);
      }
    } catch (error) {
      console.error('创建日常任务失败:', error);
    }
  }

  /**
   * 确保用户有成长任务
   * @param {string} userId - 用户ID
   */
  async ensureGrowthTasks(userId) {
    try {
      await UserTask.createGrowthTasks(userId);
    } catch (error) {
      console.error('创建成长任务失败:', error);
    }
  }

  /**
   * 获取排行榜数据
   * @param {string} rankType - 排行榜类型
   * @param {string} userId - 用户ID（可选，用于获取用户排名）
   * @returns {Object} 排行榜数据
   */
  async getLeaderboard(rankType = 'total_chips', userId = null) {
    try {
      let leaderboard = await Leaderboard.findOne({ rankType });
      
      // 如果不存在或需要更新，则更新排行榜
      if (!leaderboard || leaderboard.needsUpdate()) {
        if (rankType === 'total_chips') {
          await Leaderboard.updateTotalChipsLeaderboard();
        } else if (rankType === 'win_rate') {
          await Leaderboard.updateWinRateLeaderboard();
        }
        
        leaderboard = await Leaderboard.findOne({ rankType });
      }
      
      const result = {
        rankType,
        data: leaderboard?.data || [],
        lastUpdated: leaderboard?.lastUpdated,
        userRank: null
      };
      
      // 获取用户排名
      if (userId && leaderboard) {
        result.userRank = leaderboard.getUserRank(userId);
        
        // 如果用户不在前10名，查询实际排名
        if (!result.userRank) {
          result.userRank = await this.getUserActualRank(userId, rankType);
        }
      }
      
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取用户实际排名（不在前10名时）
   * @param {string} userId - 用户ID
   * @param {string} rankType - 排行榜类型
   * @returns {Object|null} 用户排名信息
   */
  async getUserActualRank(userId, rankType) {
    try {
      if (rankType === 'total_chips') {
        const user = await User.findById(userId).select('totalChips');
        if (!user) return null;
        
        const rank = await User.countDocuments({
          totalChips: { $gt: user.totalChips }
        }) + 1;
        
        return {
          rank,
          value: user.totalChips,
          inTopTen: false
        };
      }
      
      return null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 添加筹码（通用方法）
   * @param {string} userId - 用户ID
   * @param {number} amount - 筹码数量
   * @param {string} type - 交易类型
   * @param {string} description - 描述
   * @param {Object} metadata - 元数据
   * @returns {Object} 操作结果
   */
  async addChips(userId, amount, type, description, metadata = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('用户不存在');
      }
      
      const balanceBefore = user.totalChips;
      user.totalChips += amount;
      await user.save();
      
      // 记录交易
      await ChipTransaction.create({
        userId,
        type,
        amount,
        balanceBefore,
        balanceAfter: user.totalChips,
        description,
        metadata
      });
      
      return {
        success: true,
        newBalance: user.totalChips,
        amount
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new ChipService();