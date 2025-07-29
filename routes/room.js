const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const chipService = require('../services/chipService');
const User = require('../models/User');
const RoomBalance = require('../models/RoomBalance');

const router = express.Router();

/**
 * 进入房间
 * POST /api/room/enter
 */
router.post('/enter', authenticateToken, async (req, res) => {
  try {
    const { roomCode, chipsToEnter } = req.body;
    const userId = req.user._id;
    
    if (!roomCode) {
      return res.status(400).json({ error: '房间代码不能为空' });
    }
    
    if (!chipsToEnter || chipsToEnter <= 0) {
      return res.status(400).json({ error: '转入筹码数量必须大于0' });
    }
    
    // 检查用户总筹码是否足够
    const user = await User.findById(userId);
    if (user.totalChips < chipsToEnter) {
      return res.status(400).json({ 
        error: '筹码余额不足',
        currentBalance: user.totalChips,
        required: chipsToEnter
      });
    }
    
    // 执行进入房间操作
    const result = await chipService.enterRoom(userId, roomCode, chipsToEnter);
    
    res.json({
      success: true,
      message: '成功进入房间',
      data: result
    });
    
  } catch (error) {
    console.error('进入房间错误:', error);
    
    if (error.message.includes('筹码余额不足') || 
        error.message.includes('用户已在该房间内') ||
        error.message.includes('用户不存在')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 退出房间
 * POST /api/room/exit
 */
router.post('/exit', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.body;
    const userId = req.user._id;
    
    if (!roomCode) {
      return res.status(400).json({ error: '房间代码不能为空' });
    }
    
    // 执行退出房间操作
    const result = await chipService.exitRoom(userId, roomCode);
    
    res.json({
      success: true,
      message: '成功退出房间',
      data: result
    });
    
  } catch (error) {
    console.error('退出房间错误:', error);
    
    if (error.message.includes('用户不在该房间内') ||
        error.message.includes('用户不存在')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取房间筹码状态
 * GET /api/room/:roomCode/chips
 */
router.get('/:roomCode/chips', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const userId = req.user._id;
    
    const chipStatus = await chipService.getUserChipStatus(userId, roomCode);
    
    res.json({
      success: true,
      chipStatus
    });
    
  } catch (error) {
    console.error('获取房间筹码状态错误:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 检查房间准入条件
 * GET /api/room/:roomCode/check-entry
 */
router.get('/:roomCode/check-entry', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { minChips = 100, maxChips = 10000 } = req.query;
    const userId = req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 检查是否已在房间内
    const existingBalance = await RoomBalance.findOne({
      userId,
      roomCode,
      isActive: true
    });
    
    if (existingBalance) {
      return res.json({
        success: false,
        canEnter: false,
        reason: '已在房间内',
        currentRoomChips: existingBalance.chips
      });
    }
    
    // 检查筹码余额
    const canEnter = user.totalChips >= parseInt(minChips);
    const recommendedAmount = Math.min(
      user.totalChips,
      Math.max(parseInt(minChips), parseInt(maxChips))
    );
    
    res.json({
      success: true,
      canEnter,
      userTotalChips: user.totalChips,
      minChips: parseInt(minChips),
      maxChips: parseInt(maxChips),
      recommendedAmount,
      reason: canEnter ? null : '筹码余额不足'
    });
    
  } catch (error) {
    console.error('检查房间准入条件错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 获取房间内所有玩家的筹码状态
 * GET /api/room/:roomCode/players-chips
 */
router.get('/:roomCode/players-chips', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;
    
    const roomBalances = await RoomBalance.find({
      roomCode,
      isActive: true
    }).populate('userId', 'username avatar');
    
    const playersChips = roomBalances.map(balance => ({
      userId: balance.userId._id,
      username: balance.userId.username,
      avatar: balance.userId.avatar,
      roomChips: balance.chips,
      initialChips: balance.initialChips,
      currentProfitLoss: balance.calculateProfitLoss(),
      entryTime: balance.entryTime
    }));
    
    res.json({
      success: true,
      playersChips,
      totalPlayers: playersChips.length
    });
    
  } catch (error) {
    console.error('获取房间玩家筹码状态错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * 补充房间筹码
 * POST /api/room/:roomCode/add-chips
 */
router.post('/:roomCode/add-chips', authenticateToken, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { additionalChips } = req.body;
    const userId = req.user._id;
    
    if (!additionalChips || additionalChips <= 0) {
      return res.status(400).json({ error: '补充筹码数量必须大于0' });
    }
    
    // 检查用户是否在房间内
    const roomBalance = await RoomBalance.findOne({
      userId,
      roomCode,
      isActive: true
    });
    
    if (!roomBalance) {
      return res.status(400).json({ error: '用户不在该房间内' });
    }
    
    // 检查用户总筹码是否足够
    const user = await User.findById(userId);
    if (user.totalChips < additionalChips) {
      return res.status(400).json({ 
        error: '筹码余额不足',
        currentBalance: user.totalChips,
        required: additionalChips
      });
    }
    
    // 执行筹码转移（类似进入房间的逻辑，但是添加到现有房间筹码）
    const session = await require('mongoose').startSession();
    
    try {
      await session.startTransaction();
      
      // 扣除总筹码
      user.totalChips -= additionalChips;
      await user.save({ session });
      
      // 增加房间筹码
      roomBalance.chips += additionalChips;
      await roomBalance.save({ session });
      
      // 记录交易历史
      await require('../models/ChipTransaction').createTransaction({
        userId,
        type: 'ROOM_ENTRY',
        amount: -additionalChips,
        balanceBefore: user.totalChips + additionalChips,
        balanceAfter: user.totalChips,
        roomCode,
        description: `补充房间筹码 ${additionalChips}`,
        metadata: { 
          roomBalance: roomBalance._id,
          isAdditional: true
        }
      });
      
      await session.commitTransaction();
      
      res.json({
        success: true,
        message: '筹码补充成功',
        data: {
          totalChips: user.totalChips,
          roomChips: roomBalance.chips,
          addedAmount: additionalChips
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
    
  } catch (error) {
    console.error('补充房间筹码错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;