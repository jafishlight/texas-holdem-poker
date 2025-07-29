const User = require('../models/User');
const RoomBalance = require('../models/RoomBalance');
const ChipTransaction = require('../models/ChipTransaction');
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
    const session = await mongoose.startSession();
    
    try {
      await session.startTransaction();
      
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('用户不存在');
      }
      
      const balanceBefore = user.totalChips;
      
      if (amount < 0 && user.totalChips < Math.abs(amount)) {
        throw new Error('用户筹码余额不足');
      }
      
      user.totalChips += amount;
      await user.save({ session });
      
      // 记录交易历史
      await ChipTransaction.createTransaction({
        userId,
        type: 'ADMIN_ADJUST',
        amount,
        balanceBefore,
        balanceAfter: user.totalChips,
        description: reason,
        metadata: { adminId }
      });
      
      await session.commitTransaction();
      
      return {
        success: true,
        newBalance: user.totalChips,
        adjustment: amount
      };
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
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
}

module.exports = new ChipService();