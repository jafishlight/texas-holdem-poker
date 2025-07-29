const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const dgram = require('dgram');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 游戏房间管理
const rooms = new Map();
const players = new Map();

// UDP广播服务用于局域网发现
const udpServer = dgram.createSocket('udp4');
const BROADCAST_PORT = 8890; // 修改端口避免冲突
const SERVER_PORT = process.env.PORT || 3000;

// 扑克牌定义
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 牌型枚举（从小到大）
const HAND_TYPES = {
  HIGH_CARD: 1,
  PAIR: 2,
  TWO_PAIR: 3,
  THREE_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

// 游戏状态枚举
const GAME_STATES = {
  WAITING: 'waiting',
  PRE_FLOP: 'pre_flop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
  FINISHED: 'finished'
};

// 创建一副牌
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffleDeck(deck);
}

// 洗牌
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 生成房间号
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 创建房间
function createRoom(roomName, hostId, settings) {
  const roomCode = generateRoomCode();
  const room = {
    code: roomCode,
    name: roomName,
    hostId: hostId,
    players: new Map(),
    seats: new Map(), // 座位号 -> 玩家ID
    playerSeats: new Map(), // 玩家ID -> 座位号
    gameState: GAME_STATES.WAITING,
    deck: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    currentPlayerIndex: 0,
    dealerIndex: 0,
    smallBlindIndex: 0,
    bigBlindIndex: 0,
    settings: {
      initialChips: settings.initialChips || 1000,
      smallBlind: settings.smallBlind || 10,
      bigBlind: settings.bigBlind || 20,
      maxPlayers: settings.maxPlayers || 8 // 限制为8个座位
    },
    gameHistory: [],
    aiPlayers: []
  };
  
  rooms.set(roomCode, room);
  return room;
}

// 牌型判断函数
function evaluateHand(cards) {
  if (cards.length < 5) return { type: HAND_TYPES.HIGH_CARD, value: 0 };
  
  // 获取所有可能的5张牌组合
  const combinations = getCombinations(cards, 5);
  let bestHand = { type: HAND_TYPES.HIGH_CARD, value: 0, cards: [] };
  
  for (const combo of combinations) {
    const hand = evaluateFiveCards(combo);
    if (hand.value > bestHand.value) {
      bestHand = hand;
    }
  }
  
  return bestHand;
}

// 评估5张牌的牌型
function evaluateFiveCards(cards) {
  const ranks = cards.map(card => RANKS.indexOf(card.rank));
  const suits = cards.map(card => card.suit);
  
  ranks.sort((a, b) => b - a); // 降序排列
  
  const isFlush = suits.every(suit => suit === suits[0]);
  const isStraight = checkStraight(ranks);
  
  // 统计每个点数的出现次数
  const rankCounts = {};
  ranks.forEach(rank => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });
  
  // 按出现次数和点数大小排序，用于精确比较
  const sortedRanks = Object.keys(rankCounts)
    .map(rank => parseInt(rank))
    .sort((a, b) => {
      const countDiff = rankCounts[b] - rankCounts[a];
      if (countDiff !== 0) return countDiff; // 先按出现次数排序
      return b - a; // 再按点数大小排序
    });
  
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  
  // 判断牌型
  if (isFlush && isStraight) {
    if (ranks[0] === 12 && ranks[4] === 8) { // A-K-Q-J-10
      return { type: HAND_TYPES.ROYAL_FLUSH, value: 10000000, cards };
    }
    // 特殊处理A-2-3-4-5顺子（最小的顺子）
    const straightHigh = (ranks[0] === 12 && ranks[1] === 3) ? 3 : ranks[0];
    return { type: HAND_TYPES.STRAIGHT_FLUSH, value: 9000000 + straightHigh, cards };
  }
  
  if (counts[0] === 4) {
    // 四条：四条的点数 + 单牌点数
    const fourKindRank = sortedRanks[0];
    const kickerRank = sortedRanks[1];
    return { type: HAND_TYPES.FOUR_KIND, value: 8000000 + fourKindRank * 1000 + kickerRank, cards };
  }
  
  if (counts[0] === 3 && counts[1] === 2) {
    // 葫芦：三条的点数 + 对子的点数
    const threeKindRank = sortedRanks[0];
    const pairRank = sortedRanks[1];
    return { type: HAND_TYPES.FULL_HOUSE, value: 7000000 + threeKindRank * 1000 + pairRank, cards };
  }
  
  if (isFlush) {
    // 同花：按所有牌的点数比较
    return { type: HAND_TYPES.FLUSH, value: 6000000 + ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4], cards };
  }
  
  if (isStraight) {
    // 顺子：按最高牌比较，特殊处理A-2-3-4-5
    const straightHigh = (ranks[0] === 12 && ranks[1] === 3) ? 3 : ranks[0];
    return { type: HAND_TYPES.STRAIGHT, value: 5000000 + straightHigh, cards };
  }
  
  if (counts[0] === 3) {
    // 三条：三条的点数 + 两张单牌点数
    const threeKindRank = sortedRanks[0];
    const kicker1 = sortedRanks[1];
    const kicker2 = sortedRanks[2];
    return { type: HAND_TYPES.THREE_KIND, value: 4000000 + threeKindRank * 10000 + kicker1 * 100 + kicker2, cards };
  }
  
  if (counts[0] === 2 && counts[1] === 2) {
    // 两对：大对子点数 + 小对子点数 + 单牌点数
    const bigPairRank = sortedRanks[0];
    const smallPairRank = sortedRanks[1];
    const kickerRank = sortedRanks[2];
    return { type: HAND_TYPES.TWO_PAIR, value: 3000000 + bigPairRank * 10000 + smallPairRank * 100 + kickerRank, cards };
  }
  
  if (counts[0] === 2) {
    // 一对：对子点数 + 三张单牌点数
    const pairRank = sortedRanks[0];
    const kicker1 = sortedRanks[1];
    const kicker2 = sortedRanks[2];
    const kicker3 = sortedRanks[3];
    return { type: HAND_TYPES.PAIR, value: 2000000 + pairRank * 100000 + kicker1 * 1000 + kicker2 * 100 + kicker3, cards };
  }
  
  // 高牌：按所有牌的点数比较
  return { type: HAND_TYPES.HIGH_CARD, value: 1000000 + ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4], cards };
}

// 检查是否为顺子
function checkStraight(ranks) {
  // 特殊情况：A-2-3-4-5
  if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
    return true;
  }
  
  for (let i = 0; i < ranks.length - 1; i++) {
    if (ranks[i] - ranks[i + 1] !== 1) {
      return false;
    }
  }
  return true;
}

// 获取组合
function getCombinations(arr, k) {
  if (k === 1) return arr.map(x => [x]);
  if (k === arr.length) return [arr];
  
  const combinations = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tailCombinations = getCombinations(arr.slice(i + 1), k - 1);
    for (const tail of tailCombinations) {
      combinations.push([head, ...tail]);
    }
  }
  return combinations;
}

// WebSocket连接处理
io.on('connection', (socket) => {
  console.log('玩家连接:', socket.id);
  
  // 创建房间
  socket.on('createRoom', (data) => {
    const { roomName, playerName, settings } = data;
    const room = createRoom(roomName, socket.id, settings);
    
    const player = {
      id: socket.id,
      name: playerName,
      chips: room.settings.initialChips,
      cards: [],
      bet: 0,
      folded: false,
      allIn: false,
      isReady: false
    };
    
    room.players.set(socket.id, player);
    players.set(socket.id, { roomCode: room.code, player });
    
    socket.join(room.code);
    socket.emit('roomCreated', { roomCode: room.code, room: getRoomInfo(room) });
    
    console.log(`房间创建成功: ${room.code}`);
  });
  
  // 加入房间
  socket.on('joinRoom', (data) => {
    const { roomCode, playerName } = data;
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    if (room.players.size >= room.settings.maxPlayers) {
      socket.emit('error', { message: '房间已满' });
      return;
    }
    
    const player = {
      id: socket.id,
      name: playerName,
      chips: room.settings.initialChips,
      cards: [],
      bet: 0,
      folded: false,
      allIn: false,
      isReady: false
    };
    
    room.players.set(socket.id, player);
    players.set(socket.id, { roomCode: room.code, player });
    
    socket.join(room.code);
    socket.emit('joinedRoom', { room: getRoomInfo(room) });
    
    // 同步当前座位信息给新加入的玩家
    console.log(`为新玩家 ${playerName} 同步座位信息，当前座位数量: ${room.seats.size}`);
    if (room.seats.size > 0) {
      room.seats.forEach((playerId, seatNumber) => {
        const seatedPlayer = room.players.get(playerId);
        if (seatedPlayer) {
          console.log(`发送座位信息: 座位${seatNumber} - 玩家${seatedPlayer.name}`);
          socket.emit('seatTaken', {
            seatNumber,
            player: getPlayerInfo(seatedPlayer, room)
          });
        }
      });
    } else {
      console.log('当前房间没有玩家坐下，无需同步座位信息');
    }
    
    io.to(room.code).emit('playerJoined', { player: getPlayerInfo(player, room) });
    
    console.log(`玩家 ${playerName} 加入房间 ${roomCode}`);
  });
  
  // 玩家准备
  socket.on('playerReady', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomCode);
    const player = room.players.get(socket.id);
    
    player.isReady = !player.isReady;
    io.to(room.code).emit('playerStatusChanged', { 
      playerId: socket.id, 
      isReady: player.isReady 
    });
  });
  
  // 开始游戏（已改为自动开始，保留此事件以防客户端调用）
  socket.on('startGame', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomCode);
    
    // 提示玩家游戏已改为自动开始
    socket.emit('error', { 
      message: '游戏已改为自动开始模式，当有2名玩家坐下时会自动开始游戏' 
    });
  });
  
  // 玩家操作
  socket.on('playerAction', (data) => {
    const { action, amount } = data;
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomCode);
    handlePlayerAction(room, socket.id, action, amount);
  });
  
  // 请求座位信息
  socket.on('requestSeatInfo', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomCode);
    if (!room) return;
    
    console.log(`玩家请求座位信息，当前座位数量: ${room.seats.size}`);
    
    // 发送当前所有座位信息给请求的玩家
    if (room.seats.size > 0) {
      room.seats.forEach((playerId, seatNumber) => {
        const seatedPlayer = room.players.get(playerId);
        if (seatedPlayer) {
          console.log(`发送座位信息: 座位${seatNumber} - 玩家${seatedPlayer.name}`);
          socket.emit('seatTaken', {
            seatNumber,
            player: getPlayerInfo(seatedPlayer)
          });
        }
      });
    } else {
      console.log('当前房间没有玩家坐下');
    }
  });
  
  // 离开房间
  socket.on('leaveRoom', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomCode);
    if (room) {
      // 释放座位
      const seatNumber = room.playerSeats.get(socket.id);
      if (seatNumber) {
        room.seats.delete(seatNumber);
        room.playerSeats.delete(socket.id);
        io.to(room.code).emit('seatLeft', {
          seatNumber,
          playerId: socket.id
        });
      }
      
      room.players.delete(socket.id);
      socket.leave(room.code);
      io.to(room.code).emit('playerLeft', { playerId: socket.id });
      
      // 如果房主离开，转移房主权限
      if (room.hostId === socket.id && room.players.size > 0) {
        const newHost = Array.from(room.players.keys())[0];
        room.hostId = newHost;
        io.to(room.code).emit('hostChanged', { newHostId: newHost });
      }
      
      // 如果房间为空，删除房间
      if (room.players.size === 0) {
        rooms.delete(room.code);
      }
    }
    players.delete(socket.id);
  });
  
  // 选择座位
  socket.on('selectSeat', (data) => {
    const { seatNumber } = data;
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomCode);
    if (!room) return;
    
    // 检查座位号是否有效
    if (seatNumber < 1 || seatNumber > 8) {
      socket.emit('seatError', { message: '无效的座位号' });
      return;
    }
    
    // 检查座位是否已被占用
    if (room.seats.has(seatNumber)) {
      socket.emit('seatError', { message: '该座位已被占用' });
      return;
    }
    
    // 检查玩家是否已经坐在其他座位
    if (room.playerSeats.has(socket.id)) {
      const currentSeat = room.playerSeats.get(socket.id);
      socket.emit('seatError', { message: `您已经坐在座位${currentSeat}，请先离开当前座位` });
      return;
    }
    
    // 分配座位
    room.seats.set(seatNumber, socket.id);
    room.playerSeats.set(socket.id, seatNumber);
    
    const player = room.players.get(socket.id);
    
    // 通知所有玩家座位被占用
    io.to(room.code).emit('seatTaken', {
      seatNumber,
      player: getPlayerInfo(player, room)
    });
    
    console.log(`玩家 ${player.name} 坐在座位 ${seatNumber}`);
    
    // 检查是否有两个玩家坐下，如果有且游戏未开始，则自动开始游戏
    if (room.seats.size >= 2 && room.gameState === GAME_STATES.WAITING) {
      console.log(`房间 ${room.code} 有 ${room.seats.size} 个玩家坐下，自动开始游戏`);
      startNewGame(room);
    }
  });
  
  // 离开座位
  socket.on('leaveSeat', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomCode);
    if (!room) return;
    
    const seatNumber = room.playerSeats.get(socket.id);
    if (!seatNumber) {
      socket.emit('seatError', { message: '您没有坐在任何座位上' });
      return;
    }
    
    // 释放座位
    room.seats.delete(seatNumber);
    room.playerSeats.delete(socket.id);
    
    // 通知所有玩家座位被释放
    io.to(room.code).emit('seatLeft', {
      seatNumber,
      playerId: socket.id
    });
    
    console.log(`玩家离开座位 ${seatNumber}`);
  });
  
  // 搜索房间
  socket.on('discoverRooms', () => {
    console.log(`搜索房间请求，当前房间数量: ${rooms.size}`);
    
    const availableRooms = Array.from(rooms.values())
      .filter(room => room.players.size < room.settings.maxPlayers)
      .map(room => ({
        code: room.code,
        name: room.name,
        players: room.players.size,
        maxPlayers: room.settings.maxPlayers,
        gameState: room.gameState,
        isPlaying: room.gameState !== GAME_STATES.WAITING
      }));
    
    console.log(`找到可用房间: ${availableRooms.length}个`);
    availableRooms.forEach(room => {
      const status = room.isPlaying ? '游戏中' : '等待中';
      console.log(`- 房间 ${room.code}: ${room.name} (${room.players}/${room.maxPlayers}) - ${status}`);
    });
    
    socket.emit('discoverRoomsResult', { rooms: availableRooms });
  });
  
  // 断线处理
  socket.on('disconnect', () => {
    console.log('玩家断线:', socket.id);
    
    const playerData = players.get(socket.id);
    if (playerData) {
      const room = rooms.get(playerData.roomCode);
      if (room) {
        // 释放座位
        const seatNumber = room.playerSeats.get(socket.id);
        if (seatNumber) {
          room.seats.delete(seatNumber);
          room.playerSeats.delete(socket.id);
          io.to(room.code).emit('seatLeft', {
            seatNumber,
            playerId: socket.id
          });
        }
        
        room.players.delete(socket.id);
        io.to(room.code).emit('playerLeft', { playerId: socket.id });
        
        // 如果房主离开，转移房主权限
        if (room.hostId === socket.id && room.players.size > 0) {
          const newHost = Array.from(room.players.keys())[0];
          room.hostId = newHost;
          io.to(room.code).emit('hostChanged', { newHostId: newHost });
        }
        
        // 如果房间为空，删除房间
        if (room.players.size === 0) {
          rooms.delete(room.code);
        }
      }
      players.delete(socket.id);
    }
  });
});

// 开始新游戏
function startNewGame(room) {
  room.deck = createDeck();
  room.communityCards = [];
  room.pot = 0;
  room.currentBet = 0;
  room.lastRaise = 0;
  room.actionCount = 0;
  room.playersActed = new Set();
  room.gameState = GAME_STATES.PRE_FLOP;
  
  // 重置玩家状态
  room.players.forEach(player => {
    player.folded = false;
    player.allIn = false;
    player.bet = 0;
    player.totalGameInvestment = 0; // 重置累积投入
    player.cards = [];
  });
  
  // 只有已选择座位的玩家才能参与游戏（不再需要准备状态检查）
  const seatedPlayers = Array.from(room.players.values()).filter(p => {
    return room.playerSeats.has(p.id);
  });
  
  // 记录参与本局游戏的玩家ID，用于区分观战玩家
  room.gameParticipants = new Set(seatedPlayers.map(p => p.id));
  
  // 按座位号排序玩家，确保游戏顺序按座位进行
  seatedPlayers.sort((a, b) => {
    const seatA = room.playerSeats.get(a.id);
    const seatB = room.playerSeats.get(b.id);
    return seatA - seatB;
  });
  
  // 设置庄家和盲注位置
  if (!room.dealerIndex) room.dealerIndex = 0;
  room.dealerIndex = (room.dealerIndex + 1) % seatedPlayers.length;
  room.smallBlindIndex = (room.dealerIndex + 1) % seatedPlayers.length;
  room.bigBlindIndex = (room.dealerIndex + 2) % seatedPlayers.length;
  
  // Pre-Flop阶段特殊规则：从大盲注左侧的玩家开始行动
  // 这是因为小盲注和大盲注已经强制下注，需要从下一位玩家开始决策
  room.currentPlayerIndex = (room.bigBlindIndex + 1) % seatedPlayers.length;
  
  // 发底牌给已选择座位的玩家
  for (let i = 0; i < 2; i++) {
    seatedPlayers.forEach(player => {
      player.cards.push(room.deck.pop());
    });
  }
  
  // 下盲注
  const smallBlindPlayer = seatedPlayers[room.smallBlindIndex];
  const bigBlindPlayer = seatedPlayers[room.bigBlindIndex];
  
  smallBlindPlayer.bet = room.settings.smallBlind;
  smallBlindPlayer.chips -= room.settings.smallBlind;
  bigBlindPlayer.bet = room.settings.bigBlind;
  bigBlindPlayer.chips -= room.settings.bigBlind;
  
  room.pot = room.settings.smallBlind + room.settings.bigBlind;
  room.currentBet = room.settings.bigBlind;
  
  io.to(room.code).emit('gameStarted', {
    gameState: room.gameState,
    pot: room.pot,
    currentBet: room.currentBet,
    currentPlayer: seatedPlayers[room.currentPlayerIndex].id,
    players: seatedPlayers.map(p => getPlayerInfo(p, room)),
    dealerIndex: room.dealerIndex,
    smallBlindIndex: room.smallBlindIndex,
    bigBlindIndex: room.bigBlindIndex,
    bigBlind: room.settings.bigBlind,
    smallBlind: room.settings.smallBlind,
    seatedPlayers: seatedPlayers.map(p => ({
      playerId: p.id,
      seatNumber: room.playerSeats.get(p.id)
    }))
  });
  
  // 发送底牌给已选择座位的玩家
  seatedPlayers.forEach(player => {
    io.to(player.id).emit('dealCards', { cards: player.cards });
  });
}

// 处理玩家操作
function handlePlayerAction(room, playerId, action, amount = 0) {
  // 检查玩家是否参与本局游戏
  if (!room.gameParticipants || !room.gameParticipants.has(playerId)) {
    return; // 观战玩家不能参与游戏操作
  }
  
  // 获取活跃玩家（按座位号排序）
  const activePlayers = Array.from(room.players.values())
    .filter(p => room.gameParticipants.has(p.id) && !p.folded)
    .sort((a, b) => {
      const seatA = room.playerSeats.get(a.id);
      const seatB = room.playerSeats.get(b.id);
      return seatA - seatB;
    });
  const currentPlayer = activePlayers[room.currentPlayerIndex];
  
  if (currentPlayer.id !== playerId) {
    return; // 不是当前玩家的回合
  }
  
  const player = room.players.get(playerId);
  
  switch (action) {
    case 'fold':
      player.folded = true;
      break;
      
    case 'call':
      const callAmount = Math.max(0, room.currentBet - player.bet);
      
      // 如果没有需要跟注的金额或筹码不足跟注，拒绝操作
      if (callAmount <= 0 || player.chips < callAmount) {
        return; // 没有需要跟注或筹码不足，不能跟注
      }
      
      player.bet += callAmount;
      player.chips -= callAmount;
      room.pot += callAmount;
      if (player.chips === 0) player.allIn = true;
      break;
      
    case 'raise':
      // 计算跟注金额
      const raiseCallAmount = Math.max(0, room.currentBet - player.bet);
      // 最小加注额度：至少是大盲注
      const minRaiseAmount = room.settings.bigBlind;
      // 总的最小下注额度 = 跟注 + 最小加注
      const minTotalAmount = raiseCallAmount + minRaiseAmount;
      
      // 如果筹码不足最小加注要求，拒绝操作
      if (player.chips < minTotalAmount) {
        return; // 筹码不足，不能加注
      }
      
      // 实际加注金额不能少于最小加注
      const actualAmount = Math.max(minTotalAmount, amount);
      const totalAmount = Math.min(actualAmount, player.chips);
      const newTotalBet = player.bet + totalAmount;
      
      if (newTotalBet > room.currentBet) {
        room.lastRaise = room.currentBet;
        room.currentBet = newTotalBet;
      }
      player.chips -= totalAmount;
      player.bet += totalAmount;
      room.pot += totalAmount;
      if (player.chips === 0) player.allIn = true;
      break;
      
    case 'check':
      // 不需要额外操作
      break;
      
    case 'allIn':
      const allInAmount = player.chips;
      const newBetTotal = player.bet + allInAmount;
      
      // 如果全下金额超过当前下注，视为加注
      if (newBetTotal > room.currentBet) {
        room.lastRaise = room.currentBet;
        room.currentBet = newBetTotal;
      }
      
      room.pot += allInAmount;
      player.bet += allInAmount;
      player.chips = 0;
      player.allIn = true;
      break;
  }
  
  // 记录玩家行动
  if (!room.playersActed) room.playersActed = new Set();
  room.playersActed.add(playerId);
  
  // 增加行动计数
  if (!room.actionCount) room.actionCount = 0;
  room.actionCount++;
  
  // 如果有加注或全下超过当前下注，重置行动记录（所有玩家需要重新行动）
  if (action === 'raise' || (action === 'allIn' && player.bet > room.lastRaise)) {
    room.playersActed.clear();
    room.playersActed.add(playerId); // 当前玩家已经行动
    room.actionCount = 1; // 重置为1，因为当前玩家已经行动
  }
  
  // 移动到下一个玩家
  moveToNextPlayer(room);
  
  // 检查是否只剩一个未弃牌的玩家
  const remainingPlayers = Array.from(room.players.values())
    .filter(p => room.gameParticipants.has(p.id) && !p.folded)
    .sort((a, b) => {
      const seatA = room.playerSeats.get(a.id);
      const seatB = room.playerSeats.get(b.id);
      return seatA - seatB;
    });
  
  if (remainingPlayers.length === 1) {
    // 只剩一个玩家，直接结束游戏
    showdown(room);
    return;
  }
  
  // 广播游戏状态
  io.to(room.code).emit('gameStateUpdate', {
    pot: room.pot,
    currentBet: room.currentBet,
    currentPlayer: getCurrentPlayer(room)?.id,
    players: remainingPlayers.map(p => getPlayerInfo(p, room)),
    allPlayers: Array.from(room.players.values()).map(p => getPlayerInfo(p, room)),
    gameParticipants: Array.from(room.gameParticipants || []),
    action: { playerId, action, amount },
    dealerIndex: room.dealerIndex,
    smallBlindIndex: room.smallBlindIndex,
    bigBlindIndex: room.bigBlindIndex,
    bigBlind: room.settings.bigBlind,
    smallBlind: room.settings.smallBlind
  });
  
  // 检查是否需要进入下一阶段
  if (isRoundComplete(room)) {
    nextGameStage(room);
  }
}

// 移动到下一个玩家
function moveToNextPlayer(room) {
  // 获取活跃玩家（按座位号排序）
  const activePlayers = Array.from(room.players.values())
    .filter(p => room.gameParticipants.has(p.id) && !p.folded)
    .sort((a, b) => {
      const seatA = room.playerSeats.get(a.id);
      const seatB = room.playerSeats.get(b.id);
      return seatA - seatB;
    });
  
  const playersCanAct = activePlayers.filter(p => !p.allIn);
  
  if (playersCanAct.length === 0) return; // 所有玩家都全下了
  
  // 移动到下一个可以行动的玩家
  let attempts = 0;
  const maxAttempts = activePlayers.length;
  
  do {
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % activePlayers.length;
    attempts++;
    
    // 防止无限循环
    if (attempts >= maxAttempts) {
      break;
    }
  } while (activePlayers[room.currentPlayerIndex] && 
           (activePlayers[room.currentPlayerIndex].folded || activePlayers[room.currentPlayerIndex].allIn));
}

// 获取当前玩家
function getCurrentPlayer(room) {
  // 获取活跃玩家（按座位号排序）
  const activePlayers = Array.from(room.players.values())
    .filter(p => room.gameParticipants.has(p.id) && !p.folded)
    .sort((a, b) => {
      const seatA = room.playerSeats.get(a.id);
      const seatB = room.playerSeats.get(b.id);
      return seatA - seatB;
    });
  return activePlayers[room.currentPlayerIndex];
}

// 检查回合是否完成
function isRoundComplete(room) {
  // 获取活跃玩家（按座位号排序）
  const activePlayers = Array.from(room.players.values())
    .filter(p => room.gameParticipants.has(p.id) && !p.folded)
    .sort((a, b) => {
      const seatA = room.playerSeats.get(a.id);
      const seatB = room.playerSeats.get(b.id);
      return seatA - seatB;
    });
  
  if (activePlayers.length <= 1) return true;
  
  const playersCanAct = activePlayers.filter(p => !p.allIn);
  
  // 如果没有能行动的玩家，回合结束
  if (playersCanAct.length === 0) return true;
  
  // 检查所有能行动的玩家是否都跟上了当前下注
  const currentBet = room.currentBet;
  const allPlayersMatchCurrentBet = playersCanAct.every(p => p.bet === currentBet);
  
  if (!allPlayersMatchCurrentBet) return false;
  
  // 检查是否所有能行动的玩家都已行动过
  if (!room.actionCount) room.actionCount = 0;
  if (!room.playersActed) room.playersActed = new Set();
  
  // 所有能行动的玩家都必须至少行动过一次
  const allPlayersActed = playersCanAct.every(p => room.playersActed.has(p.id));
  
  return allPlayersActed;
}

// 进入下一游戏阶段
function nextGameStage(room) {
  // 累积玩家的总投入并重置当前轮下注
  room.players.forEach(player => {
    if (!player.totalGameInvestment) player.totalGameInvestment = 0;
    player.totalGameInvestment += (player.bet || 0);
    player.bet = 0;
  });
  room.currentBet = 0;
  room.lastRaise = 0;
  room.actionCount = 0;
  room.playersActed = new Set();
  
  // 获取活跃玩家（按座位号排序）
  const activePlayers = Array.from(room.players.values())
    .filter(p => room.gameParticipants.has(p.id) && !p.folded)
    .sort((a, b) => {
      const seatA = room.playerSeats.get(a.id);
      const seatB = room.playerSeats.get(b.id);
      return seatA - seatB;
    });
  
  const playersCanAct = activePlayers.filter(p => !p.allIn);
  
  // 如果没有玩家能继续行动（所有玩家都全下或只剩一个能行动的玩家），直接跳到摊牌并发出所有剩余公共牌
  if (playersCanAct.length <= 1 && activePlayers.length > 1) {
    // 发出所有剩余的公共牌
    while (room.communityCards.length < 5 && room.deck.length > 0) {
      room.communityCards.push(room.deck.pop());
    }
    
    room.gameState = GAME_STATES.SHOWDOWN;
    
    // 通知客户端所有剩余公共牌已发出
    io.to(room.code).emit('allInShowdown', {
      gameState: room.gameState,
      communityCards: room.communityCards,
      message: '所有玩家全下，直接摊牌'
    });
    
    // 直接进入摊牌
    showdown(room);
    return;
  }
  
  // 正常的游戏阶段转换
  switch (room.gameState) {
    case GAME_STATES.PRE_FLOP:
      room.gameState = GAME_STATES.FLOP;
      // 发3张公共牌
      for (let i = 0; i < 3; i++) {
        room.communityCards.push(room.deck.pop());
      }
      break;
      
    case GAME_STATES.FLOP:
      room.gameState = GAME_STATES.TURN;
      // 发1张公共牌
      room.communityCards.push(room.deck.pop());
      break;
      
    case GAME_STATES.TURN:
      room.gameState = GAME_STATES.RIVER;
      // 发1张公共牌
      room.communityCards.push(room.deck.pop());
      break;
      
    case GAME_STATES.RIVER:
      room.gameState = GAME_STATES.SHOWDOWN;
      
      // 先通知客户端进入摊牌阶段，显示手牌
      const showdownData = {
        gameState: room.gameState,
        communityCards: room.communityCards,
        dealerIndex: room.dealerIndex,
        smallBlindIndex: room.smallBlindIndex,
        bigBlindIndex: room.bigBlindIndex
      };
      
      // 发送所有参与游戏玩家的手牌
      const gameParticipants = Array.from(room.players.values())
        .filter(p => room.gameParticipants.has(p.id))
        .map(p => ({
          playerId: p.id,
          cards: p.cards
        }));
      showdownData.playerCards = gameParticipants;
      
      io.to(room.code).emit('nextStage', showdownData);
      
      // 延时1秒后进行摊牌计算和结果显示
      setTimeout(() => {
        showdown(room);
      }, 1000);
      return;
  }
  
  // 设置下注顺序：Flop/Turn/River阶段从庄家左侧第一个存活玩家开始
  setCurrentPlayerForNewStage(room, activePlayers);
  
  // 准备发送的数据
  const stageData = {
    gameState: room.gameState,
    communityCards: room.communityCards,
    currentPlayer: activePlayers[room.currentPlayerIndex]?.id,
    dealerIndex: room.dealerIndex,
    smallBlindIndex: room.smallBlindIndex,
    bigBlindIndex: room.bigBlindIndex
  };
  
  // 如果是翻牌阶段及之后，发送所有参与游戏玩家的手牌
  if (room.gameState !== GAME_STATES.PRE_FLOP) {
    const gameParticipants = Array.from(room.players.values())
      .filter(p => room.gameParticipants.has(p.id))
      .map(p => ({
        playerId: p.id,
        cards: p.cards
      }));
    stageData.playerCards = gameParticipants;
  }
  
  io.to(room.code).emit('nextStage', stageData);
}

// 为新阶段设置当前玩家（Flop/Turn/River从庄家左侧开始）
function setCurrentPlayerForNewStage(room, activePlayers) {
  // Flop/Turn/River阶段规则：从庄家左侧第一个存活玩家开始行动
  // 这与Pre-Flop不同，Pre-Flop是从大盲注左侧开始
  
  // 找到庄家在活跃玩家中的索引
  const dealerPlayerIndex = activePlayers.findIndex(p => {
    const playerSeat = room.playerSeats.get(p.id);
    const dealerSeat = Array.from(room.players.values())
      .filter(player => room.gameParticipants.has(player.id))
      .sort((a, b) => {
        const seatA = room.playerSeats.get(a.id);
        const seatB = room.playerSeats.get(b.id);
        return seatA - seatB;
      })[room.dealerIndex];
    return playerSeat === room.playerSeats.get(dealerSeat.id);
  });
  
  // 从庄家左侧第一个存活且能行动的玩家开始
  let startIndex = (dealerPlayerIndex + 1) % activePlayers.length;
  
  // 找到第一个能行动的玩家（跳过全下玩家）
  while (activePlayers[startIndex] && activePlayers[startIndex].allIn) {
    startIndex = (startIndex + 1) % activePlayers.length;
  }
  
  room.currentPlayerIndex = startIndex;
}

// 摊牌
function showdown(room) {
  // 获取活跃玩家（按座位号排序）
  const activePlayers = Array.from(room.players.values())
    .filter(p => room.gameParticipants.has(p.id) && !p.folded)
    .sort((a, b) => {
      const seatA = room.playerSeats.get(a.id);
      const seatB = room.playerSeats.get(b.id);
      return seatA - seatB;
    });
  
  // 如果只剩一个玩家，直接获胜
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    winner.chips += room.pot;
    
    const gameResult = {
      winners: [{ 
        playerId: winner.id, 
        playerName: winner.name,
        hand: null, // 无需摊牌
        winAmount: room.pot 
      }],
      pot: room.pot,
      communityCards: room.communityCards,
      timestamp: new Date(),
      noShowdown: true
    };
    
    room.gameHistory.push(gameResult);
    
    io.to(room.code).emit('gameFinished', {
      result: gameResult,
      players: activePlayers.map(p => getPlayerInfo(p, room))
    });
    
    finishGame(room);
    return;
  }
  
  // 评估每个玩家的牌型
  const playerHands = activePlayers.map(player => {
    const allCards = [...player.cards, ...room.communityCards];
    const hand = evaluateHand(allCards);
    return { player, hand };
  });
  
  // 排序找出赢家
  playerHands.sort((a, b) => b.hand.value - a.hand.value);
  
  // 处理边池分配
  const potResults = distributePots(room, playerHands);
  
  // 分配奖池给获胜者
  potResults.forEach(result => {
    result.winners.forEach(winner => {
      winner.player.chips += winner.winAmount;
    });
  });
  
  // 记录游戏历史
  const gameResult = {
    winners: potResults.flatMap(result => result.winners.map(w => ({
      playerId: w.player.id,
      playerName: w.player.name,
      hand: w.hand,
      winAmount: w.winAmount,
      potType: result.potType
    }))),
    pot: room.pot,
    communityCards: room.communityCards,
    timestamp: new Date(),
    potResults: potResults,
    // 添加所有参与摊牌玩家的手牌信息
    showdownPlayers: playerHands.map(ph => ({
      playerId: ph.player.id,
      playerName: ph.player.name,
      cards: ph.player.cards,
      hand: ph.hand
    }))
  };

  room.gameHistory.push(gameResult);

  io.to(room.code).emit('gameFinished', {
    result: gameResult,
    players: activePlayers.map(p => getPlayerInfo(p, room))
  });
  
  finishGame(room);
}

// 分配边池
function distributePots(room, playerHands) {
  const activePlayers = playerHands.map(ph => ph.player);
  
  // 简化处理：如果没有全下玩家，直接分配主池
  const allInPlayers = activePlayers.filter(p => p.allIn);
  
  if (allInPlayers.length === 0) {
    // 没有全下玩家，简单分配
    const bestHandValue = Math.max(...playerHands.map(ph => ph.hand.value));
    const winners = playerHands.filter(ph => ph.hand.value === bestHandValue);
    const winAmount = Math.floor(room.pot / winners.length);
    
    return [{
      potType: 'main',
      amount: room.pot,
      winners: winners.map(winner => ({
        player: winner.player,
        hand: winner.hand,
        winAmount: winAmount
      }))
    }];
  }
  
  // 有全下玩家，需要处理边池
  // 收集所有玩家的累积总投入（包括历史轮次）
  const playerTotalInvestment = new Map();
  activePlayers.forEach(player => {
    // 计算玩家在整局游戏中的总投入
    const totalInvestment = (player.totalGameInvestment || 0) + (player.bet || 0);
    playerTotalInvestment.set(player.id, totalInvestment);
  });
  
  // 创建边池
  const sidePots = createSidePotsFromTotalInvestment(activePlayers, playerTotalInvestment);
  
  // 为每个边池分配获胜者
  const potResults = [];
  
  sidePots.forEach((pot, index) => {
    // 找出有资格争夺此边池的玩家
    const eligiblePlayers = playerHands.filter(ph => pot.eligiblePlayers.has(ph.player.id));
    
    if (eligiblePlayers.length === 0) return;
    
    // 找出此边池的获胜者
    const bestHandValue = Math.max(...eligiblePlayers.map(ph => ph.hand.value));
    const winners = eligiblePlayers.filter(ph => ph.hand.value === bestHandValue);
    
    // 分配奖金
    const winAmount = Math.floor(pot.amount / winners.length);
    
    potResults.push({
      potType: index === 0 ? 'main' : `side${index}`,
      amount: pot.amount,
      winners: winners.map(winner => ({
        player: winner.player,
        hand: winner.hand,
        winAmount: winAmount
      }))
    });
  });
  
  return potResults;
}

// 根据累积总投入创建边池
function createSidePotsFromTotalInvestment(players, playerTotalInvestment) {
  // 获取所有不同的投入金额并排序
  const investmentAmounts = [...new Set(Array.from(playerTotalInvestment.values()))].sort((a, b) => a - b);
  
  const sidePots = [];
  let previousAmount = 0;
  
  investmentAmounts.forEach((investmentAmount, index) => {
    const potContribution = investmentAmount - previousAmount;
    if (potContribution > 0) {
      // 有资格争夺此边池的玩家（总投入至少达到当前水平的玩家）
      const eligiblePlayers = new Set();
      players.forEach(player => {
        const playerInvestment = playerTotalInvestment.get(player.id) || 0;
        if (playerInvestment >= investmentAmount) {
          eligiblePlayers.add(player.id);
        }
      });
      
      if (eligiblePlayers.size > 0) {
        sidePots.push({
          amount: potContribution * eligiblePlayers.size,
          eligiblePlayers: eligiblePlayers
        });
      }
    }
    previousAmount = investmentAmount;
  });
  
  return sidePots;
}



// 游戏结束处理
function finishGame(room) {
  // 累积最后一轮的投入
  room.players.forEach(player => {
    if (!player.totalGameInvestment) player.totalGameInvestment = 0;
    player.totalGameInvestment += (player.bet || 0);
  });
  
  // 移除筹码用完的玩家
  const playersToRemove = [];
  room.players.forEach((player, playerId) => {
    if (player.chips <= 0 && player.id !== room.hostId) {
      playersToRemove.push(playerId);
      io.to(player.id).emit('playerEliminated', {
        message: '您的筹码已用完，已被移出游戏'
      });
    }
  });
  
  // 从房间中移除筹码用完的玩家
  playersToRemove.forEach(playerId => {
    // 释放座位
    const seatNumber = room.playerSeats.get(playerId);
    if (seatNumber) {
      room.seats.delete(seatNumber);
      room.playerSeats.delete(playerId);
      io.to(room.code).emit('seatLeft', {
        seatNumber,
        playerId
      });
    }
    
    room.players.delete(playerId);
  });
  
  // 重置游戏状态
  room.gameState = GAME_STATES.WAITING;
  room.communityCards = [];
  room.pot = 0;
  room.gameParticipants = null; // 清除本局游戏参与者记录
  
  // 检查是否还有足够坐下的玩家继续游戏
  if (room.seats.size >= 2) {
    // 3秒后自动开始新游戏
    setTimeout(() => {
      if (room.gameState === GAME_STATES.WAITING && room.seats.size >= 2) {
        console.log(`房间 ${room.code} 游戏结束后自动开始新游戏，坐下玩家数: ${room.seats.size}`);
        startNewGame(room);
      } else {
        // 玩家不足，通知房间状态
        io.to(room.code).emit('roomUpdate', {
          message: '需要至少2名玩家坐下才能开始游戏',
          players: Array.from(room.players.values()).map(p => getPlayerInfo(p, room))
        });
      }
    }, 3000);
  } else {
    // 玩家不足，通知房间状态
    io.to(room.code).emit('roomUpdate', {
      message: '需要至少2名玩家坐下才能开始游戏',
      players: Array.from(room.players.values()).map(p => getPlayerInfo(p, room))
    });
  }
}

// 获取房间信息
function getRoomInfo(room) {
  return {
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    gameState: room.gameState,
    players: Array.from(room.players.values()).map(p => getPlayerInfo(p, room)),
    settings: room.settings,
    communityCards: room.communityCards,
    pot: room.pot,
    gameParticipants: room.gameParticipants ? Array.from(room.gameParticipants) : []
  };
}

// 获取玩家信息
function getPlayerInfo(player, room = null) {
  const playerInfo = {
    id: player.id,
    name: player.name,
    chips: player.chips,
    bet: player.bet,
    folded: player.folded,
    allIn: player.allIn,
    isReady: player.isReady,
    status: getPlayerStatus(player, room)
  };
  
  // 如果提供了房间信息，添加是否为游戏参与者的标识
  if (room && room.gameParticipants) {
    playerInfo.isGameParticipant = room.gameParticipants.has(player.id);
  }
  
  return playerInfo;
}

// 获取玩家状态
function getPlayerStatus(player, room = null) {
  // 检查是否在线（这里简化处理，实际应该检查socket连接状态）
  if (!player.id) {
    return 'offline';
  }
  
  // 如果游戏进行中
  if (room && room.gameState !== GAME_STATES.WAITING && room.gameParticipants && room.gameParticipants.has(player.id)) {
    if (player.folded) {
      return 'folded';
    }
    if (player.allIn) {
      return 'allin';
    }
    
    // 检查是否轮到该玩家行动
    const currentPlayer = getCurrentPlayer(room);
    if (currentPlayer && currentPlayer.id === player.id) {
      return 'thinking';
    }
  }
  
  return 'online';
}

// UDP广播处理
udpServer.on('message', (msg, rinfo) => {
  if (msg.toString() === 'POKER_DISCOVERY') {
    const response = JSON.stringify({
      type: 'POKER_SERVER',
      port: SERVER_PORT,
      rooms: Array.from(rooms.values()).map(room => ({
        code: room.code,
        name: room.name,
        players: room.players.size,
        maxPlayers: room.settings.maxPlayers
      }))
    });
    
    udpServer.send(response, rinfo.port, rinfo.address);
  }
});

udpServer.bind(BROADCAST_PORT);

// 启动服务器
server.listen(SERVER_PORT, () => {
  console.log(`德州扑克服务器启动在端口 ${SERVER_PORT}`);
  console.log(`UDP广播服务启动在端口 ${BROADCAST_PORT}`);
});

module.exports = { app, server, io };