const cron = require('node-cron');
const Leaderboard = require('../models/Leaderboard');
const UserTask = require('../models/UserTask');
const chipService = require('./chipService');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * 启动所有定时任务
   */
  start() {
    console.log('启动定时任务服务...');
    
    // 每10分钟更新排行榜
    this.scheduleLeaderboardUpdate();
    
    // 每日凌晨发放排行榜奖励
    this.scheduleDailyRewards();
    
    // 每日凌晨清理过期任务
    this.scheduleTaskCleanup();
    
    console.log('所有定时任务已启动');
  }

  /**
   * 停止所有定时任务
   */
  stop() {
    console.log('停止定时任务服务...');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`已停止定时任务: ${name}`);
    });
    this.jobs.clear();
    console.log('所有定时任务已停止');
  }

  /**
   * 调度排行榜更新任务
   */
  scheduleLeaderboardUpdate() {
    const job = cron.schedule('*/10 * * * *', async () => {
      try {
        console.log('开始更新排行榜...');
        
        // 更新总筹码排行榜
        await Leaderboard.updateTotalChipsLeaderboard();
        console.log('总筹码排行榜更新完成');
        
        // 更新胜率排行榜
        await Leaderboard.updateWinRateLeaderboard();
        console.log('胜率排行榜更新完成');
        
      } catch (error) {
        console.error('更新排行榜失败:', error);
      }
    }, {
      scheduled: false
    });
    
    job.start();
    this.jobs.set('leaderboard_update', job);
    console.log('排行榜更新任务已启动 (每10分钟执行一次)');
  }

  /**
   * 调度每日奖励发放任务
   */
  scheduleDailyRewards() {
    const job = cron.schedule('0 0 * * *', async () => {
      try {
        console.log('开始发放每日排行榜奖励...');
        
        // 发放总筹码排行榜奖励
        const totalChipsResult = await Leaderboard.distributeDailyRewards('total_chips');
        console.log(`总筹码排行榜奖励发放完成，共发放给 ${totalChipsResult.rewardedCount} 名玩家`);
        
        // 发放胜率排行榜奖励
        const winRateResult = await Leaderboard.distributeDailyRewards('win_rate');
        console.log(`胜率排行榜奖励发放完成，共发放给 ${winRateResult.rewardedCount} 名玩家`);
        
      } catch (error) {
        console.error('发放每日奖励失败:', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Shanghai'
    });
    
    job.start();
    this.jobs.set('daily_rewards', job);
    console.log('每日奖励发放任务已启动 (每日凌晨执行)');
  }

  /**
   * 调度任务清理任务
   */
  scheduleTaskCleanup() {
    const job = cron.schedule('0 1 * * *', async () => {
      try {
        console.log('开始清理过期任务...');
        
        // 清理过期的日常任务
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);
        
        const result = await UserTask.deleteMany({
          taskType: 'daily',
          refreshDate: { $lt: yesterdayStr }
        });
        
        console.log(`清理过期任务完成，删除了 ${result.deletedCount} 个过期任务`);
        
      } catch (error) {
        console.error('清理过期任务失败:', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Shanghai'
    });
    
    job.start();
    this.jobs.set('task_cleanup', job);
    console.log('任务清理任务已启动 (每日凌晨1点执行)');
  }

  /**
   * 手动触发排行榜更新
   */
  async triggerLeaderboardUpdate() {
    try {
      console.log('手动触发排行榜更新...');
      await Leaderboard.updateTotalChipsLeaderboard();
      await Leaderboard.updateWinRateLeaderboard();
      console.log('手动排行榜更新完成');
      return { success: true };
    } catch (error) {
      console.error('手动排行榜更新失败:', error);
      throw error;
    }
  }

  /**
   * 手动触发每日奖励发放
   */
  async triggerDailyRewards() {
    try {
      console.log('手动触发每日奖励发放...');
      const totalChipsResult = await Leaderboard.distributeDailyRewards('total_chips');
      const winRateResult = await Leaderboard.distributeDailyRewards('win_rate');
      
      const result = {
        success: true,
        totalChipsRewards: totalChipsResult.rewardedCount,
        winRateRewards: winRateResult.rewardedCount,
        totalRewardedPlayers: totalChipsResult.rewardedCount + winRateResult.rewardedCount
      };
      
      console.log('手动每日奖励发放完成:', result);
      return result;
    } catch (error) {
      console.error('手动每日奖励发放失败:', error);
      throw error;
    }
  }

  /**
   * 获取定时任务状态
   */
  getStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    });
    return status;
  }
}

module.exports = new SchedulerService();