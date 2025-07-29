const mongoose = require('mongoose');

/**
 * 房间筹码记录模型
 * 跟踪用户在特定房间内的筹码状态
 */
const RoomBalanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  roomCode: {
    type: String,
    required: true
  },
  chips: {
    type: Number,
    required: true,
    min: 0
  },
  entryTime: {
    type: Date,
    default: Date.now
  },
  exitTime: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // 记录进入房间时的筹码数量
  initialChips: {
    type: Number,
    required: true
  },
  // 记录最终筹码数量（退出时）
  finalChips: {
    type: Number,
    default: null
  }
});

// 复合索引，确保用户在同一房间只能有一个活跃记录
RoomBalanceSchema.index({ userId: 1, roomCode: 1, isActive: 1 }, { unique: true });

// 计算盈亏方法
RoomBalanceSchema.methods.calculateProfitLoss = function() {
  if (this.finalChips === null) {
    return this.chips - this.initialChips; // 当前盈亏
  }
  return this.finalChips - this.initialChips; // 最终盈亏
};

// 更新筹码数量方法
RoomBalanceSchema.methods.updateChips = async function(newAmount) {
  if (newAmount < 0) throw new Error('房间筹码不能为负数');
  
  this.chips = newAmount;
  return await this.save();
};

// 退出房间方法
RoomBalanceSchema.methods.exitRoom = async function() {
  this.exitTime = new Date();
  this.finalChips = this.chips;
  this.isActive = false;
  return await this.save();
};

module.exports = mongoose.model('RoomBalance', RoomBalanceSchema);