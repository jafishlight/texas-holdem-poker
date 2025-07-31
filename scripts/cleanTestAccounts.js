const mongoose = require('mongoose');
const User = require('../models/User');
const UserCheckin = require('../models/UserCheckin');
const UserTask = require('../models/UserTask');
const ChipTransaction = require('../models/ChipTransaction');
const RoomBalance = require('../models/RoomBalance');
const Leaderboard = require('../models/Leaderboard');
const database = require('../config/database');

/**
 * 清理测试账户脚本
 * 删除所有测试账户及其相关数据
 */
class TestAccountCleaner {
  constructor() {
    this.db = database;
    // 定义测试账户用户名列表
    this.testUsernames = ['admin', 'player1', 'player2', 'player3'];
  }

  /**
   * 执行清理操作
   */
  async clean() {
    try {
      console.log('开始清理测试账户...');
      
      // 连接数据库
      await this.db.connect();
      console.log('数据库连接成功');
      
      // 获取测试用户ID列表
      const testUsers = await User.find({ 
        username: { $in: this.testUsernames } 
      });
      
      if (testUsers.length === 0) {
        console.log('未找到测试账户');
        return;
      }
      
      const testUserIds = testUsers.map(user => user._id);
      console.log(`找到 ${testUsers.length} 个测试账户:`, testUsers.map(u => u.username));
      
      // 删除相关数据
      await this.cleanRelatedData(testUserIds);
      
      // 删除测试用户
      await this.cleanTestUsers();
      
      console.log('测试账户清理完成');
      
    } catch (error) {
      console.error('清理测试账户失败:', error);
      throw error;
    } finally {
      await this.db.disconnect();
    }
  }

  /**
   * 清理与测试用户相关的数据
   * @param {Array} testUserIds - 测试用户ID列表
   */
  async cleanRelatedData(testUserIds) {
    try {
      // 删除用户签到记录
      const checkinResult = await UserCheckin.deleteMany({ 
        userId: { $in: testUserIds } 
      });
      console.log(`删除签到记录: ${checkinResult.deletedCount} 条`);
      
      // 删除用户任务记录
      const taskResult = await UserTask.deleteMany({ 
        userId: { $in: testUserIds } 
      });
      console.log(`删除任务记录: ${taskResult.deletedCount} 条`);
      
      // 删除筹码交易记录
      const transactionResult = await ChipTransaction.deleteMany({ 
        userId: { $in: testUserIds } 
      });
      console.log(`删除交易记录: ${transactionResult.deletedCount} 条`);
      
      // 删除房间余额记录
      const roomBalanceResult = await RoomBalance.deleteMany({ 
        userId: { $in: testUserIds } 
      });
      console.log(`删除房间余额记录: ${roomBalanceResult.deletedCount} 条`);
      
      // 删除排行榜记录
      const leaderboardResult = await Leaderboard.deleteMany({ 
        userId: { $in: testUserIds } 
      });
      console.log(`删除排行榜记录: ${leaderboardResult.deletedCount} 条`);
      
    } catch (error) {
      console.error('清理相关数据失败:', error);
      throw error;
    }
  }

  /**
   * 删除测试用户账户
   */
  async cleanTestUsers() {
    try {
      const result = await User.deleteMany({ 
        username: { $in: this.testUsernames } 
      });
      console.log(`删除测试用户: ${result.deletedCount} 个`);
      
    } catch (error) {
      console.error('删除测试用户失败:', error);
      throw error;
    }
  }

  /**
   * 显示当前测试账户状态
   */
  async showStatus() {
    try {
      await this.db.connect();
      
      const testUsers = await User.find({ 
        username: { $in: this.testUsernames } 
      }, 'username email totalChips isAdmin');
      
      if (testUsers.length === 0) {
        console.log('当前没有测试账户');
      } else {
        console.log('当前测试账户:');
        testUsers.forEach(user => {
          console.log(`- ${user.username} (${user.email}) - 筹码: ${user.totalChips}${user.isAdmin ? ' [管理员]' : ''}`);
        });
      }
      
    } catch (error) {
      console.error('查询测试账户状态失败:', error);
      throw error;
    } finally {
      await this.db.disconnect();
    }
  }
}

// 命令行执行
if (require.main === module) {
  const cleaner = new TestAccountCleaner();
  
  const command = process.argv[2];
  
  if (command === 'status') {
    // 显示状态
    cleaner.showStatus()
      .then(() => {
        console.log('状态查询完成');
        process.exit(0);
      })
      .catch((error) => {
        console.error('状态查询失败:', error);
        process.exit(1);
      });
  } else {
    // 执行清理
    cleaner.clean()
      .then(() => {
        console.log('清理操作完成');
        process.exit(0);
      })
      .catch((error) => {
        console.error('清理操作失败:', error);
        process.exit(1);
      });
  }
}

module.exports = TestAccountCleaner;