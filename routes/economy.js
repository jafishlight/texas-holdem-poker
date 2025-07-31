const express = require('express');
const router = express.Router();
const chipService = require('../services/chipService');
const { authenticateToken } = require('../middleware/auth');

// 使用认证中间件的别名
const auth = authenticateToken;

/**
 * 签到相关路由
 */

// 获取签到状态
router.get('/checkin/status', auth, async (req, res) => {
  try {
    const status = await chipService.getCheckinStatus(req.user.id);
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('获取签到状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取签到状态失败',
      error: error.message
    });
  }
});

// 执行签到
router.post('/checkin', auth, async (req, res) => {
  try {
    const result = await chipService.performCheckin(req.user.id);
    res.json({
      success: true,
      message: `签到成功！获得 ${result.reward} 筹码`,
      data: result
    });
  } catch (error) {
    console.error('签到失败:', error);
    res.status(400).json({
      success: false,
      message: error.message === '今日已签到' ? '今日已签到' : '签到失败',
      error: error.message
    });
  }
});

/**
 * 任务相关路由
 */

// 获取任务列表
router.get('/tasks', auth, async (req, res) => {
  try {
    const { type } = req.query;
    const tasks = await chipService.getUserTasks(req.user.id, type);
    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    console.error('获取任务列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取任务列表失败',
      error: error.message
    });
  }
});

// 领取任务奖励
router.post('/tasks/:taskId/claim', auth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = await chipService.claimTaskReward(req.user.id, taskId);
    res.json({
      success: true,
      message: `任务完成！获得 ${result.reward} 筹码`,
      data: result
    });
  } catch (error) {
    console.error('领取任务奖励失败:', error);
    res.status(400).json({
      success: false,
      message: '领取奖励失败',
      error: error.message
    });
  }
});

// 更新任务进度（内部接口，游戏逻辑调用）
router.post('/tasks/progress', auth, async (req, res) => {
  try {
    const { taskType, taskId, increment = 1 } = req.body;
    const result = await chipService.updateTaskProgress(
      req.user.id,
      taskType,
      taskId,
      increment
    );
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('更新任务进度失败:', error);
    res.status(500).json({
      success: false,
      message: '更新任务进度失败',
      error: error.message
    });
  }
});

/**
 * 排行榜相关路由
 */

// 获取排行榜
router.get('/leaderboards', auth, async (req, res) => {
  try {
    const { type = 'total_chips' } = req.query;
    const leaderboard = await chipService.getLeaderboard(type, req.user.id);
    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('获取排行榜失败:', error);
    res.status(500).json({
      success: false,
      message: '获取排行榜失败',
      error: error.message
    });
  }
});

// 获取用户排名详情
router.get('/leaderboards/my-rank', auth, async (req, res) => {
  try {
    const { type = 'total_chips' } = req.query;
    const userRank = await chipService.getUserActualRank(req.user.id, type);
    res.json({
      success: true,
      data: userRank
    });
  } catch (error) {
    console.error('获取用户排名失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户排名失败',
      error: error.message
    });
  }
});

/**
 * 筹码相关路由
 */

// 添加筹码（管理员接口）
router.post('/chips/add', auth, async (req, res) => {
  try {
    // 检查管理员权限
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '权限不足'
      });
    }
    
    const { userId, amount, type, description, metadata } = req.body;
    const result = await chipService.addChips(userId, amount, type, description, metadata);
    res.json({
      success: true,
      message: `成功添加 ${amount} 筹码`,
      data: result
    });
  } catch (error) {
    console.error('添加筹码失败:', error);
    res.status(500).json({
      success: false,
      message: '添加筹码失败',
      error: error.message
    });
  }
});

// 获取用户经济数据概览
router.get('/overview', auth, async (req, res) => {
  try {
    const [checkinStatus, tasks, leaderboard] = await Promise.all([
      chipService.getCheckinStatus(req.user.id),
      chipService.getUserTasks(req.user.id, 'daily'),
      chipService.getLeaderboard('total_chips', req.user.id)
    ]);
    
    // 计算今日可获得的筹码
    const dailyPotential = checkinStatus.canCheckin ? checkinStatus.nextReward : 0;
    const tasksPotential = tasks
      .filter(task => !task.isCompleted)
      .reduce((sum, task) => sum + task.rewardChips, 0);
    
    res.json({
      success: true,
      data: {
        checkin: checkinStatus,
        dailyTasks: tasks,
        myRank: leaderboard.userRank,
        todayPotential: dailyPotential + tasksPotential
      }
    });
  } catch (error) {
    console.error('获取经济数据概览失败:', error);
    res.status(500).json({
      success: false,
      message: '获取数据失败',
      error: error.message
    });
  }
});

module.exports = router;