// 游戏客户端主文件
class PokerGame {
    constructor() {
        this.socket = null;
        this.currentRoom = null;
        this.currentPlayer = null;
        this.gameState = null;
        this.playerSeats = new Map(); // 玩家ID -> 座位号
        this.seatPlayers = new Map(); // 座位号 -> 玩家信息
        this.playerCards = []; // 存储玩家的手牌
        this.allPlayerCards = new Map(); // 存储所有玩家的手牌 (玩家ID -> 手牌数组)
        this.settings = {
            soundEnabled: true,
            musicEnabled: true,
            animationSpeed: 'normal',
            cardTheme: 'classic'
        };
        
        this.init();
    }

    // 初始化游戏
    init() {
        this.loadSettings();
        this.initSocket();
        this.bindEvents();
        this.showScreen('mainMenu');
    }

    // 加载设置
    loadSettings() {
        const saved = localStorage.getItem('pokerSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        this.applySettings();
        
        // 加载保存的昵称
        this.loadPlayerName();
    }
    
    // 加载玩家昵称
    loadPlayerName() {
        const savedName = localStorage.getItem('playerName');
        if (savedName) {
            document.getElementById('mainPlayerName').value = savedName;
        }
    }
    
    // 保存玩家昵称
    savePlayerName(name) {
        if (name && name.trim()) {
            localStorage.setItem('playerName', name.trim());
        }
    }
    
    // 获取当前昵称
    getCurrentPlayerName() {
        return document.getElementById('mainPlayerName').value.trim() || 
               localStorage.getItem('playerName') || '';
    }

    // 应用设置
    applySettings() {
        document.getElementById('soundEnabled').checked = this.settings.soundEnabled;
        document.getElementById('musicEnabled').checked = this.settings.musicEnabled;
        document.getElementById('animationSpeed').value = this.settings.animationSpeed;
        document.getElementById('cardTheme').value = this.settings.cardTheme;
        
        // 应用音乐设置
        const bgMusic = document.getElementById('backgroundMusic');
        if (this.settings.musicEnabled) {
            // 确保背景音乐已加载
            if (bgMusic.readyState < 2) {
                bgMusic.load();
                bgMusic.addEventListener('canplay', () => {
                    bgMusic.play().catch(() => {});
                }, { once: true });
            } else {
                bgMusic.play().catch(() => {});
            }
        } else {
            bgMusic.pause();
        }
    }

    // 保存设置
    saveSettings() {
        this.settings.soundEnabled = document.getElementById('soundEnabled').checked;
        this.settings.musicEnabled = document.getElementById('musicEnabled').checked;
        this.settings.animationSpeed = document.getElementById('animationSpeed').value;
        this.settings.cardTheme = document.getElementById('cardTheme').value;
        
        localStorage.setItem('pokerSettings', JSON.stringify(this.settings));
        this.applySettings();
        this.showToast('设置已保存', 'success');
    }

    // 初始化Socket连接
    initSocket() {
        this.socket = io();
        
        // 连接事件
        this.socket.on('connect', () => {
            console.log('已连接到服务器');
            this.hideLoading();
        });
        
        this.socket.on('disconnect', () => {
            console.log('与服务器断开连接');
            this.showToast('与服务器断开连接', 'error');
        });
        
        // 房间事件
        this.socket.on('roomCreated', (data) => {
            this.hideLoading();
            this.currentRoom = data.room;
            this.showScreen('roomScreen');
            this.updateRoomDisplay();
            this.showToast(`房间创建成功，房间号: ${data.roomCode}`, 'success');
        });
        
        this.socket.on('joinedRoom', (data) => {
            this.hideLoading();
            this.currentRoom = data.room;
            this.showScreen('roomScreen');
            this.updateRoomDisplay();
            this.showToast('成功加入房间', 'success');
        });
        
        this.socket.on('playerJoined', (data) => {
            if (this.currentRoom) {
                // 检查玩家是否已经在列表中，避免重复添加
                const existingPlayer = this.currentRoom.players.find(p => p.id === data.player.id);
                if (!existingPlayer) {
                    this.currentRoom.players.push(data.player);
                }
                this.updateRoomDisplay();
                this.showToast(`${data.player.name} 加入了房间`, 'success');
            }
        });
        
        this.socket.on('playerLeft', (data) => {
            if (this.currentRoom) {
                this.currentRoom.players = this.currentRoom.players.filter(p => p.id !== data.playerId);
                this.updateRoomDisplay();
            }
        });
        
        this.socket.on('playerStatusChanged', (data) => {
            if (this.currentRoom) {
                const player = this.currentRoom.players.find(p => p.id === data.playerId);
                if (player) {
                    player.isReady = data.isReady;
                    this.updateRoomDisplay();
                }
            }
        });
        
        this.socket.on('hostChanged', (data) => {
            if (this.currentRoom) {
                this.currentRoom.hostId = data.newHostId;
                this.updateRoomDisplay();
            }
        });
        
        // 游戏事件
        this.socket.on('gameStarted', (data) => {
            this.gameState = data;
            this.showScreen('gameScreen');
            // 清理游戏界面，确保新游戏开始时界面干净
            this.clearGameDisplay();
            // 初始化座位系统
            this.initializeSeats();
            
            // 如果有座位信息，按座位顺序显示玩家
            if (data.seatedPlayers) {
                data.seatedPlayers.forEach(seatedPlayer => {
                    const player = data.players.find(p => p.id === seatedPlayer.playerId);
                    if (player) {
                        this.updateSeatDisplay(seatedPlayer.seatNumber, player);
                    }
                });
            }
            
            this.updateGameDisplay();
            this.playSound('cardSound');
            this.showToast('游戏开始！手牌已发放', 'success');
        });
        
        // 座位相关事件
        this.socket.on('seatTaken', (data) => {
            console.log('收到 seatTaken 事件:', data);
            const { seatNumber, player } = data;
            this.updateSeatDisplay(seatNumber, player);
            this.showToast(`${player.name} 坐在了座位${seatNumber}`, 'info');
        });
        
        this.socket.on('seatLeft', (data) => {
            const { seatNumber, playerId } = data;
            this.clearSeat(seatNumber);
            
            // 如果是当前玩家离开座位，显示提示
            if (playerId === this.socket.id) {
                this.showToast(`您已离开座位${seatNumber}`, 'info');
            }
        });
        
        this.socket.on('seatError', (data) => {
            this.showToast(data.message, 'error');
        });
        
        this.socket.on('dealCards', (data) => {
            this.dealPlayerCards(data.cards);
        });
        
        this.socket.on('gameStateUpdate', (data) => {
            this.gameState = { ...this.gameState, ...data };
            
            // 更新房间信息以包含最新的玩家状态
            if (this.currentRoom && data.allPlayers && data.gameParticipants) {
                this.currentRoom.players = data.allPlayers;
                this.currentRoom.gameParticipants = data.gameParticipants;
            }
            
            this.updateGameDisplay();
            this.updateActionButtons();
            
            if (data.action) {
                this.showActionFeedback(data.action);
            }
        });
        
        this.socket.on('nextStage', (data) => {
            this.gameState = { ...this.gameState, ...data };
            this.updateCommunityCards(data.communityCards);
            
            // 如果收到了所有玩家的手牌信息，存储起来
            if (data.playerCards) {
                this.allPlayerCards.clear();
                data.playerCards.forEach(playerCard => {
                    this.allPlayerCards.set(playerCard.playerId, playerCard.cards);
                });
            }
            
            this.updateGameDisplay();
            this.playSound('cardSound');
        });
        
        this.socket.on('allInShowdown', (data) => {
            this.gameState = { ...this.gameState, ...data };
            this.updateCommunityCards(data.communityCards);
            this.updateGameDisplay();
            this.showToast(data.message, 'info');
            this.playSound('cardSound');
        });
        
        this.socket.on('gameFinished', (data) => {
            // 如果有摊牌玩家信息，显示所有参与摊牌玩家的手牌
            if (data.result.showdownPlayers && data.result.showdownPlayers.length > 0) {
                this.allPlayerCards.clear();
                data.result.showdownPlayers.forEach(player => {
                    this.allPlayerCards.set(player.playerId, player.cards);
                });
                // 更新玩家显示以显示摊牌手牌
                this.updatePlayersDisplay();
                
                // 延时2秒后再显示摊牌结果
                setTimeout(() => {
                    this.showGameResult(data.result);
                    this.playSound('winSound');
                    
                    // 显示自动开始新游戏倒计时
                    this.showAutoStartCountdown();
                }, 2000);
            } else {
                // 没有摊牌的情况（只剩一人获胜），立即显示结果
                this.showGameResult(data.result);
                this.playSound('winSound');
                
                // 显示自动开始新游戏倒计时
                this.showAutoStartCountdown();
            }
        });
        
        // 玩家被淘汰事件
        this.socket.on('playerEliminated', (data) => {
            this.showToast(data.message, 'warning');
            // 3秒后返回主菜单
            setTimeout(() => {
                this.showScreen('mainMenu');
                this.currentRoom = null;
                this.gameState = null;
            }, 3000);
        });
        
        // 房间更新事件
        this.socket.on('roomUpdate', (data) => {
            if (data.message) {
                this.showToast(data.message, 'info');
            }
            if (data.players && this.currentRoom) {
                this.currentRoom.players = data.players;
                this.updateRoomDisplay();
            }
        });
        
        // 房间搜索结果
        this.socket.on('discoverRoomsResult', (data) => {
            this.displayDiscoveredRooms(data.rooms);
        });
        
        // 错误处理
        this.socket.on('error', (data) => {
            this.hideLoading();
            this.showToast(data.message, 'error');
        });
    }

    // 绑定事件
    bindEvents() {
        // 主菜单昵称输入
        document.getElementById('mainPlayerName').addEventListener('input', (e) => {
            this.savePlayerName(e.target.value);
        });
        
        // 主菜单按钮
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            const playerName = this.getCurrentPlayerName();
            if (!playerName) {
                this.showToast('请先设置您的昵称', 'error');
                document.getElementById('mainPlayerName').focus();
                return;
            }
            this.showScreen('createRoomScreen');
            // 设置房间名称默认值为"玩家昵称+的房间"
            if (playerName) {
                document.getElementById('roomName').value = playerName + '的房间';
            }
        });
        
        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            const playerName = this.getCurrentPlayerName();
            if (!playerName) {
                this.showToast('请先设置您的昵称', 'error');
                document.getElementById('mainPlayerName').focus();
                return;
            }
            this.showScreen('joinRoomScreen');
        });
        
        document.getElementById('discoverRoomsBtn').addEventListener('click', () => {
            const playerName = this.getCurrentPlayerName();
            if (!playerName) {
                this.showToast('请先设置您的昵称', 'error');
                document.getElementById('mainPlayerName').focus();
                return;
            }
            this.showScreen('discoverScreen');
            this.discoverRooms();
        });
        
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showScreen('settingsScreen');
        });
        
        // 返回按钮
        document.getElementById('backToMenuBtn').addEventListener('click', () => {
            this.showScreen('mainMenu');
        });
        
        document.getElementById('backToMenuBtn2').addEventListener('click', () => {
            this.showScreen('mainMenu');
        });
        
        document.getElementById('backToMenuBtn3').addEventListener('click', () => {
            this.showScreen('mainMenu');
        });
        
        document.getElementById('backToMenuBtn4').addEventListener('click', () => {
            this.showScreen('mainMenu');
        });
        
        // 表单提交
        document.getElementById('createRoomForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createRoom();
        });
        
        document.getElementById('joinRoomForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.joinRoom();
        });
        
        // 房间控制
        document.getElementById('enterGameBtn').addEventListener('click', () => {
            this.enterGameInterface();
        });
        
        document.getElementById('leaveRoomBtn').addEventListener('click', () => {
            this.leaveRoom();
        });
        
        // 游戏操作
        document.getElementById('foldBtn').addEventListener('click', () => {
            this.playerAction('fold');
        });
        
        document.getElementById('checkBtn').addEventListener('click', () => {
            this.playerAction('check');
        });
        
        document.getElementById('callBtn').addEventListener('click', () => {
            this.playerAction('call');
        });
        
        document.getElementById('raiseBtn').addEventListener('click', () => {
            const amount = parseInt(document.getElementById('betAmount').value) || 0;
            this.playerAction('raise', amount);
        });
        
        document.getElementById('allInBtn').addEventListener('click', () => {
            this.playerAction('allIn');
        });
        
        // 下注滑块
        const betSlider = document.getElementById('betSlider');
        const betAmount = document.getElementById('betAmount');
        
        betSlider.addEventListener('input', (e) => {
            betAmount.value = e.target.value;
        });
        
        betAmount.addEventListener('input', (e) => {
            betSlider.value = e.target.value;
        });
        
        // 设置
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });
        
        // 座位点击事件
        for (let i = 1; i <= 8; i++) {
            document.getElementById(`seat${i}`).addEventListener('click', () => {
                this.selectSeat(i);
            });
        }
        
        // 历史记录功能已移除
        
        // 房间搜索
        document.getElementById('refreshRoomsBtn').addEventListener('click', () => {
            this.discoverRooms();
        });
        
        // 旧的toast关闭事件已移除
        
        // 确认对话框
        document.getElementById('confirmOk').addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback();
            }
            this.hideConfirm();
        });
        
        document.getElementById('confirmCancel').addEventListener('click', () => {
            this.hideConfirm();
        });
        
        // 输入对话框
        document.getElementById('inputOk').addEventListener('click', () => {
            const value = document.getElementById('inputField').value.trim();
            if (this.inputCallback) {
                this.inputCallback(value);
            }
            this.hideInput();
        });
        
        document.getElementById('inputCancel').addEventListener('click', () => {
            if (this.inputCallback) {
                this.inputCallback(null);
            }
            this.hideInput();
        });
        
        // 输入框回车确认
        document.getElementById('inputField').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('inputOk').click();
            }
        });
        
        // 房间设置按钮
        document.getElementById('roomSettingsBtn').addEventListener('click', () => {
            this.showRoomSettings();
        });
        
        // 房间设置对话框
        document.getElementById('roomSettingsOk').addEventListener('click', () => {
            this.saveRoomSettings();
        });
        
        document.getElementById('roomSettingsCancel').addEventListener('click', () => {
            this.hideRoomSettings();
        });
    }

    // 显示屏幕
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    // 创建房间
    createRoom() {
        const playerName = this.getCurrentPlayerName();
        const roomName = document.getElementById('roomName').value.trim();
        const initialChips = parseInt(document.getElementById('initialChips').value);
        const smallBlind = parseInt(document.getElementById('smallBlind').value);
        const maxPlayers = parseInt(document.getElementById('maxPlayers').value);
        
        if (!playerName || !roomName) {
            this.showToast('请填写完整信息', 'error');
            return;
        }
        
        this.showLoading();
        this.socket.emit('createRoom', {
            roomName,
            playerName,
            settings: {
                initialChips,
                smallBlind,
                bigBlind: smallBlind * 2,
                maxPlayers
            }
        });
    }

    // 加入房间
    joinRoom() {
        const playerName = this.getCurrentPlayerName();
        const roomCode = document.getElementById('roomCode').value.trim();
        
        if (!playerName || !roomCode) {
            this.showToast('请填写完整信息', 'error');
            return;
        }
        
        if (!/^\d{6}$/.test(roomCode)) {
            this.showToast('房间号必须是6位数字', 'error');
            return;
        }
        
        this.showLoading();
        this.socket.emit('joinRoom', {
            roomCode,
            playerName
        });
    }

    // 搜索房间
    discoverRooms() {
        const roomsList = document.getElementById('roomsList');
        roomsList.innerHTML = '<div class="loading">搜索中...</div>';
        
        // 向服务器请求房间列表
        this.socket.emit('discoverRooms');
    }
    
    // 显示搜索到的房间列表
    displayDiscoveredRooms(rooms) {
        const roomsList = document.getElementById('roomsList');
        
        if (!rooms || rooms.length === 0) {
            roomsList.innerHTML = '<div class="no-rooms">暂无可用房间</div>';
            return;
        }
        
        roomsList.innerHTML = '';
        rooms.forEach(room => {
            const roomItem = document.createElement('div');
            roomItem.className = 'room-item';
            
            // 根据游戏状态设置样式和文本
            const statusText = room.isPlaying ? '游戏中' : '等待中';
            const statusClass = room.isPlaying ? 'playing' : 'waiting';
            const buttonText = room.isPlaying ? '观战' : '加入';
            
            roomItem.innerHTML = `
                <div class="room-info">
                    <div class="room-name">${room.name}</div>
                    <div class="room-details">
                        房间号: ${room.code} | 玩家: ${room.players}/${room.maxPlayers}
                        <span class="room-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
                <button class="btn primary join-room-btn" data-room-code="${room.code}">
                    ${buttonText}
                </button>
            `;
            
            // 添加加入房间事件
            const joinBtn = roomItem.querySelector('.join-room-btn');
            joinBtn.addEventListener('click', () => {
                const playerName = this.getCurrentPlayerName();
                if (playerName) {
                    this.showLoading();
                    this.socket.emit('joinRoom', {
                        roomCode: room.code,
                        playerName: playerName
                    });
                } else {
                    this.showToast('请先在主页面设置您的昵称', 'error');
                }
            });
            
            roomsList.appendChild(roomItem);
        });
    }

    // 更新房间显示
    updateRoomDisplay() {
        if (!this.currentRoom) return;
        
        document.getElementById('roomTitle').textContent = `牌桌: ${this.currentRoom.name}`;
        document.getElementById('roomCodeDisplay').textContent = `房间号: ${this.currentRoom.code}`;
        
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';
        
        this.currentRoom.players.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            
            if (player.id === this.currentRoom.hostId) {
                playerItem.classList.add('host');
            }
            
            // 检查是否为观战者
            const isSpectator = this.currentRoom.gameParticipants && 
                               this.currentRoom.gameParticipants.length > 0 && 
                               player.isGameParticipant === false;
            
            if (isSpectator) {
                playerItem.classList.add('spectator');
            }
            
            let statusText = player.id === this.currentRoom.hostId ? '房主' : '玩家';
            if (isSpectator) {
                statusText += ' (观战)';
            }
            
            playerItem.innerHTML = `
                <div>
                    <div class="player-name">${player.name}</div>
                    <div class="player-status">
                        ${statusText}
                    </div>
                </div>
                <div class="player-chips">筹码: ${player.chips}</div>
            `;
            
            playersList.appendChild(playerItem);
        });
        
        // 显示进入游戏界面按钮
        const enterGameBtn = document.getElementById('enterGameBtn');
        if (enterGameBtn) {
            enterGameBtn.style.display = 'block';
        }
    }

    // 进入游戏界面
    enterGameInterface() {
        this.showScreen('gameScreen');
        // 清理游戏界面，确保界面干净
        this.clearGameDisplay();
        // 初始化座位系统（但不清空已有座位）
        if (!this.playerSeats) {
            this.playerSeats = new Map(); // 玩家ID -> 座位号
        }
        if (!this.seatPlayers) {
            this.seatPlayers = new Map(); // 座位号 -> 玩家信息
        }
        
        // 主动请求服务器同步当前座位信息
        console.log('进入游戏界面，请求服务器同步座位信息');
        this.socket.emit('requestSeatInfo');
        
        this.showToast('已进入游戏界面，选择座位后等待其他玩家', 'info');
    }

    // 离开房间
    leaveRoom() {
        this.showConfirm('确定要离开房间吗？', () => {
            this.socket.emit('leaveRoom');
            this.currentRoom = null;
            this.gameState = null;
            this.showScreen('mainMenu');
        });
    }

    // 玩家操作
    playerAction(action, amount = 0) {
        // 发送操作到服务器
        this.socket.emit('playerAction', { action, amount });
        this.playSound('chipSound');
        
        // 对于allIn、call和raise操作，立即更新本地显示以提供即时反馈
        if ((action === 'allIn' || action === 'call' || action === 'raise') && this.gameState && this.gameState.players) {
            const currentPlayer = this.gameState.players.find(p => p.id === this.socket.id);
            if (currentPlayer) {
                if (action === 'allIn' && currentPlayer.chips > 0) {
                    // 全下操作
                    const allInAmount = currentPlayer.chips;
                    currentPlayer.bet += allInAmount;
                    currentPlayer.chips = 0;
                    currentPlayer.allIn = true;
                    
                    // 立即更新显示
                    this.updatePlayersDisplay();
                    
                    // 显示操作反馈
                    this.showActionFeedback({ playerId: this.socket.id, action: 'allIn', amount: allInAmount });
                } else if (action === 'call') {
                    // 跟注操作 - 只有筹码足够时才进行本地更新
                    const callAmount = Math.max(0, this.gameState.currentBet - currentPlayer.bet);
                    
                    if (currentPlayer.chips >= callAmount && callAmount > 0) {
                        currentPlayer.bet += callAmount;
                        currentPlayer.chips -= callAmount;
                        
                        // 如果跟注后筹码为0，标记为全下
                        if (currentPlayer.chips === 0) {
                            currentPlayer.allIn = true;
                        }
                        
                        // 立即更新显示
                        this.updatePlayersDisplay();
                        
                        // 显示操作反馈
                        this.showActionFeedback({ playerId: this.socket.id, action: 'call', amount: callAmount });
                    }
                } else if (action === 'raise') {
                    // 加注操作 - 只有筹码足够时才进行本地更新
                    const callAmount = Math.max(0, this.gameState.currentBet - currentPlayer.bet);
                    const minRaiseAmount = this.gameState.bigBlind || 20; // 使用游戏设置的大盲注
                    const minTotalAmount = callAmount + minRaiseAmount;
                    
                    if (currentPlayer.chips >= minTotalAmount && amount >= minTotalAmount) {
                        const actualAmount = Math.min(amount, currentPlayer.chips);
                        currentPlayer.bet += actualAmount;
                        currentPlayer.chips -= actualAmount;
                        
                        // 如果加注后筹码为0，标记为全下
                        if (currentPlayer.chips === 0) {
                            currentPlayer.allIn = true;
                        }
                        
                        // 立即更新显示
                        this.updatePlayersDisplay();
                        
                        // 显示操作反馈
                        this.showActionFeedback({ playerId: this.socket.id, action: 'raise', amount: actualAmount });
                    }
                }
            }
        }
    }

    // 更新游戏显示
    updateGameDisplay() {
        if (!this.gameState) return;
        
        // 更新奖池和下注信息
        document.getElementById('potAmount').textContent = this.gameState.pot || 0;
        document.getElementById('currentBet').textContent = this.gameState.currentBet || 0;
        
        // 更新游戏阶段
        const stageNames = {
            'pre_flop': '翻牌前',
            'flop': '翻牌',
            'turn': '转牌',
            'river': '河牌',
            'showdown': '摊牌'
        };
        document.getElementById('gameStage').textContent = stageNames[this.gameState.gameState] || '等待开始';
        
        // 更新玩家位置
        this.updatePlayersDisplay();
        
        // 更新操作按钮
        this.updateActionButtons();
    }

    // 初始化座位系统
    initializeSeats() {
        // 确保映射存在
        if (!this.playerSeats) {
            this.playerSeats = new Map(); // 玩家ID -> 座位号
        }
        if (!this.seatPlayers) {
            this.seatPlayers = new Map(); // 座位号 -> 玩家信息
        }
        
        // 不清空座位，座位信息会在 gameStarted 事件中通过 seatedPlayers 重新设置
        // 或者在 seatTaken 事件中更新
    }
    
    // 选择座位
    selectSeat(seatNumber) {
        const seat = document.getElementById(`seat${seatNumber}`);
        
        // 检查座位是否已被占用
        if (seat.classList.contains('occupied')) {
            this.showToast('该座位已被占用', 'error');
            return;
        }
        
        // 检查玩家是否已经坐在其他座位
        if (this.playerSeats.has(this.socket.id)) {
            const currentSeat = this.playerSeats.get(this.socket.id);
            this.showToast(`您已经坐在座位${currentSeat}，请先离开当前座位`, 'error');
            return;
        }
        
        // 发送选择座位请求到服务器
        this.socket.emit('selectSeat', { seatNumber });
    }
    
    // 更新座位显示
    updateSeatDisplay(seatNumber, player) {
        const seat = document.getElementById(`seat${seatNumber}`);
        const seatContent = seat.querySelector('.seat-content');
        
        // 更新座位状态
        seat.classList.remove('empty');
        seat.classList.add('occupied');
        
        // 如果是当前玩家的座位
        if (player.id === this.socket.id) {
            seat.classList.add('my-seat');
        }
        
        // 不再显示手牌占位符
        const cardDisplay = '';
        
        // 检查是否为观战者
        const isSpectator = this.currentRoom && this.currentRoom.gameParticipants && 
                           this.currentRoom.gameParticipants.length > 0 && 
                           player.isGameParticipant === false;
        
        const spectatorBadge = isSpectator ? '<span class="spectator-badge">观战</span>' : '';
        
        // 获取玩家状态显示
        const statusDisplay = this.getPlayerStatusDisplay(player);
        const playerNameWithMe = player.id === this.socket.id ? `${player.name} (我)` : player.name;
        
        // 显示玩家信息
        seatContent.innerHTML = `
            <div class="player-name-display">${playerNameWithMe}${spectatorBadge}</div>
            <div class="player-status">${statusDisplay}</div>
            <div class="player-chips">筹码: ${player.chips}</div>
            <div class="player-bet">下注: ${player.bet || 0}</div>
            ${cardDisplay}
        `;
        
        // 更新映射
        this.playerSeats.set(player.id, seatNumber);
        this.seatPlayers.set(seatNumber, player);
    }
    
    // 清空座位
    clearSeat(seatNumber) {
        const seat = document.getElementById(`seat${seatNumber}`);
        const seatContent = seat.querySelector('.seat-content');
        
        // 重置座位状态
        seat.classList.remove('occupied', 'current-turn', 'my-seat');
        seat.classList.add('empty');
        
        // 清空内容
        seatContent.innerHTML = '<div class="seat-placeholder">点击坐下</div>';
        
        // 清理映射
        const player = this.seatPlayers.get(seatNumber);
        if (player) {
            this.playerSeats.delete(player.id);
            this.seatPlayers.delete(seatNumber);
        }
    }
    
    // 显示游戏日志
    showToast(message, type = 'info') {
        this.addLogMessage(message, type);
    }
    
    // 添加日志消息
    addLogMessage(message, type = 'info') {
        const logContent = document.getElementById('logContent');
        if (!logContent) return;
        
        // 获取当前游戏阶段
        let stagePrefix = '';
        if (this.gameState && this.gameState.gameState) {
            const stageNames = {
                'pre_flop': '[翻牌前]',
                'flop': '[翻牌]',
                'turn': '[转牌]',
                'river': '[河牌]',
                'showdown': '[摊牌]'
            };
            stagePrefix = stageNames[this.gameState.gameState] || '[等待]';
        }
        
        // 创建日志消息元素
        const logMessage = document.createElement('div');
        logMessage.className = `log-message ${type}`;
        
        // 如果有游戏阶段，创建带样式的HTML结构
        if (stagePrefix) {
            logMessage.innerHTML = `<span class="stage-prefix">${stagePrefix}</span> ${message}`;
        } else {
            logMessage.textContent = message;
        }
        
        // 添加到日志容器
        logContent.appendChild(logMessage);
        
        // 自动滚动到最新消息
        logContent.scrollTop = logContent.scrollHeight;
        
        // 限制日志数量，保留最新的50条
        const messages = logContent.children;
        if (messages.length > 50) {
            logContent.removeChild(messages[0]);
        }
    }
    
    // 更新玩家显示（游戏中）
    updatePlayersDisplay() {
        if (!this.gameState || !this.gameState.players) {
            return;
        }
        
        // 更新游戏参与者的座位信息
        this.gameState.players.forEach((player, index) => {
            const seatNumber = this.playerSeats.get(player.id);
            if (seatNumber) {
                const seat = document.getElementById(`seat${seatNumber}`);
                const seatContent = seat.querySelector('.seat-content');
                
                // 确定玩家位置标识
                let positionBadge = '';
                if (this.gameState.dealerIndex === index) {
                    positionBadge = '<div class="position-badge dealer">D</div>';
                } else if (this.gameState.smallBlindIndex === index) {
                    positionBadge = '<div class="position-badge small-blind">SB</div>';
                } else if (this.gameState.bigBlindIndex === index) {
                    positionBadge = '<div class="position-badge big-blind">BB</div>';
                }
                
                // 检查是否为观战者
                const isSpectator = this.currentRoom && this.currentRoom.gameParticipants && 
                                   this.currentRoom.gameParticipants.length > 0 && 
                                   player.isGameParticipant === false;
                
                const spectatorBadge = isSpectator ? '<span class="spectator-badge">观战</span>' : '';
                
                // 获取玩家状态显示
                const statusDisplay = this.getPlayerStatusDisplay(player);
                const playerNameWithMe = player.id === this.socket.id ? `${player.name} (我)` : player.name;
                
                // 生成手牌显示内容
                let cardsDisplay = '';
                const playerCards = this.allPlayerCards.get(player.id);
                
                if (this.gameState && this.gameState.gameState === 'showdown' && 
                    playerCards && playerCards.length === 2) {
                    // 只在摊牌阶段显示实际手牌
                    cardsDisplay = `
                        <div class="player-cards-display">
                            <div class="player-card-mini">${this.createMiniCardHTML(playerCards[0])}</div>
                            <div class="player-card-mini">${this.createMiniCardHTML(playerCards[1])}</div>
                        </div>
                    `;
                } else {
                    // 其他情况显示占位符
                    cardsDisplay = `
                        <div class="player-cards-display">
                            <div class="player-card-mini"></div>
                            <div class="player-card-mini"></div>
                        </div>
                    `;
                }
                
                // 更新座位内容
                seatContent.innerHTML = `
                    <div class="player-name-display">${playerNameWithMe}${spectatorBadge}</div>
                    <div class="player-status">${statusDisplay}</div>
                    <div class="player-chips">筹码: ${player.chips}</div>
                    <div class="player-bet">下注: ${player.bet}</div>
                    ${cardsDisplay}
                    ${positionBadge}
                `;
                
                // 更新座位状态
                seat.classList.remove('current-turn');
                if (player.id === this.gameState.currentPlayer) {
                    seat.classList.add('current-turn');
                }
                
                // 设置透明度
                if (player.folded) {
                    seat.style.opacity = '0.5';
                } else {
                    seat.style.opacity = '1';
                }
            }
        });
        
        // 更新观战者的座位信息
        if (this.currentRoom && this.currentRoom.players) {
            this.currentRoom.players.forEach(player => {
                // 检查是否为观战者
                const isSpectator = this.currentRoom.gameParticipants && 
                                   this.currentRoom.gameParticipants.length > 0 && 
                                   player.isGameParticipant === false;
                
                if (isSpectator) {
                    const seatNumber = this.playerSeats.get(player.id);
                    if (seatNumber) {
                        const seat = document.getElementById(`seat${seatNumber}`);
                        const seatContent = seat.querySelector('.seat-content');
                        
                        const spectatorBadge = '<span class="spectator-badge">观战</span>';
                        
                        // 获取玩家状态显示
                        const statusDisplay = this.getPlayerStatusDisplay(player);
                        const playerNameWithMe = player.id === this.socket.id ? `${player.name} (我)` : player.name;
                        
                        // 更新观战者座位内容
                        seatContent.innerHTML = `
                            <div class="player-name-display">${playerNameWithMe}${spectatorBadge}</div>
                            <div class="player-status">${statusDisplay}</div>
                            <div class="player-chips">筹码: ${player.chips}</div>
                            <div class="player-bet">下注: ${player.bet || 0}</div>
                            <div class="player-cards-display">
                                <div class="player-card-mini"></div>
                                <div class="player-card-mini"></div>
                            </div>
                        `;
                        
                        // 观战者座位设置为半透明
                        seat.style.opacity = '0.7';
                    }
                }
            });
        }
        
        // 更新底池和当前下注信息
        if (this.gameState.pot !== undefined) {
            const potElement = document.getElementById('potAmount');
            if (potElement) {
                potElement.textContent = this.gameState.pot;
            }
        }
        
        if (this.gameState.currentBet !== undefined) {
            const currentBetElement = document.getElementById('currentBet');
            if (currentBetElement) {
                currentBetElement.textContent = this.gameState.currentBet;
            }
        }
    }

    // 发牌给玩家
    dealPlayerCards(cards) {
        // 存储玩家手牌
        this.playerCards = cards;
        
        cards.forEach((card, index) => {
            const cardElement = document.getElementById(`playerCard${index + 1}`);
            if (cardElement) {
                cardElement.innerHTML = this.createCardHTML(card);
                cardElement.classList.add('card-deal');
                
                setTimeout(() => {
                    cardElement.classList.remove('card-deal');
                }, 500);
            }
        });
    }

    // 更新公共牌
    updateCommunityCards(cards) {
        // 先清空所有公共牌位置
        for (let i = 1; i <= 5; i++) {
            const cardSlot = document.getElementById(`communityCard${i}`);
            if (cardSlot) {
                cardSlot.innerHTML = '';
            }
        }
        
        // 重新显示公共牌
        cards.forEach((card, index) => {
            const cardSlot = document.getElementById(`communityCard${index + 1}`);
            if (cardSlot) {
                cardSlot.innerHTML = this.createCardHTML(card);
                cardSlot.classList.add('card-deal');
                
                setTimeout(() => {
                    cardSlot.classList.remove('card-deal');
                }, 500);
            }
        });
    }

    // 创建卡牌HTML
    createCardHTML(card) {
        const suitSymbols = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        
        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        
        return `
            <div class="card ${isRed ? 'red' : 'black'}">
                <div class="card-rank">${card.rank}</div>
                <div class="card-suit">${suitSymbols[card.suit]}</div>
            </div>
        `;
    }

    // 创建小尺寸卡牌HTML
    createMiniCardHTML(card) {
        const suitSymbols = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        
        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        
        return `
            <div class="card-mini ${isRed ? 'red' : 'black'}">
                <div class="card-rank-mini">${card.rank}</div>
                <div class="card-suit-mini">${suitSymbols[card.suit]}</div>
            </div>
        `;
    }

    // 更新操作按钮
    updateActionButtons() {
        if (!this.gameState) return;
        
        const isMyTurn = this.gameState.currentPlayer === this.socket.id;
        const currentPlayer = this.gameState.players?.find(p => p.id === this.socket.id);
        
        // 禁用/启用所有按钮
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.disabled = !isMyTurn;
        });
        
        if (isMyTurn && currentPlayer) {
            // 更新下注滑块范围
            const betSlider = document.getElementById('betSlider');
            const betAmount = document.getElementById('betAmount');
            
            betSlider.max = currentPlayer.chips;
            betSlider.min = Math.max(0, this.gameState.currentBet - currentPlayer.bet);
            
            // 更新按钮文本
            const callAmount = Math.max(0, this.gameState.currentBet - currentPlayer.bet);
            document.getElementById('callBtn').textContent = callAmount > 0 ? `跟注 ${callAmount}` : '跟注';
            
            // 检查按钮可用性
            document.getElementById('checkBtn').disabled = callAmount > 0;
            document.getElementById('callBtn').disabled = callAmount <= 0 || currentPlayer.chips < callAmount;
            const minRaiseAmount = this.gameState.bigBlind || 20;
            document.getElementById('raiseBtn').disabled = currentPlayer.chips < Math.max(0, callAmount) + minRaiseAmount;
            
            // 如果筹码不足跟注，只能全下
            if (currentPlayer.chips > 0 && currentPlayer.chips < callAmount) {
                document.getElementById('callBtn').disabled = true;
                document.getElementById('raiseBtn').disabled = true;
                document.getElementById('allInBtn').disabled = false;
            }
        }
    }

    // 显示操作反馈
    showActionFeedback(action) {
        const player = this.gameState.players?.find(p => p.id === action.playerId);
        if (player) {
            const actionNames = {
                'fold': '弃牌',
                'check': '过牌',
                'call': '跟注',
                'raise': '加注',
                'allIn': '全下'
            };
            
            let message = `${player.name} ${actionNames[action.action] || action.action}`;
            if (action.amount > 0) {
                message += ` ${action.amount}`;
            }
            
            this.showToast(message, 'info');
        }
    }

    // 显示游戏结果
    showGameResult(result) {
        const handTypeNames = {
            1: '高牌',
            2: '一对',
            3: '两对',
            4: '三条',
            5: '顺子',
            6: '同花',
            7: '葫芦',
            8: '四条',
            9: '同花顺',
            10: '皇家同花顺'
        };
        
        let message = '游戏结束！\n';
        
        // 检查是否无需摊牌（只剩一个玩家）
        if (result.noShowdown) {
            result.winners.forEach(winner => {
                message += `${winner.playerName} 获胜（其他玩家弃牌）- 赢得 ${winner.winAmount} 筹码\n`;
            });
        } else {
            // 显示所有参与摊牌玩家的手牌
            if (result.showdownPlayers && result.showdownPlayers.length > 0) {
                message += '\n摊牌结果：\n';
                result.showdownPlayers.forEach(player => {
                    const handType = handTypeNames[player.hand.type] || '未知牌型';
                    const cardStr = player.cards.map(card => `${card.rank}${this.getSuitSymbol(card.suit)}`).join(' ');
                    message += `${player.playerName}: ${cardStr} (${handType})\n`;
                });
                message += '\n';
            }
            
            // 正常摊牌，显示牌型
            if (result.potResults && result.potResults.length > 1) {
                // 有边池的情况
                message += '边池分配结果：\n';
                result.potResults.forEach((potResult, index) => {
                    const potName = potResult.potType === 'main' ? '主池' : `边池${index}`;
                    message += `${potName} (${potResult.amount} 筹码)：\n`;
                    potResult.winners.forEach(winner => {
                        const handType = handTypeNames[winner.hand.type] || '未知牌型';
                        message += `  ${winner.player.name} (${handType}) - 赢得 ${winner.winAmount} 筹码\n`;
                    });
                });
            } else {
                // 普通情况
                result.winners.forEach(winner => {
                    const handType = winner.hand ? handTypeNames[winner.hand.type] || '未知牌型' : '未知牌型';
                    message += `${winner.playerName} 获胜 (${handType}) - 赢得 ${winner.winAmount} 筹码\n`;
                });
            }
        }
        
        this.showToast(message, 'success');
        
        // 历史记录功能已移除
    }
    
    // 获取花色符号
    getSuitSymbol(suit) {
        const symbols = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        return symbols[suit] || suit;
    }

    // 获取玩家状态显示
    getPlayerStatusDisplay(player) {
        const statusMap = {
            'online': '在线',
            'offline': '离线',
            'thinking': '思考中',
            'folded': '已弃牌',
            'allin': '全下'
        };
        
        const status = player.status || 'online';
        const statusText = statusMap[status] || '在线';
        
        // 根据状态设置不同的样式类
        const statusClass = `status-${status}`;
        
        return `<span class="player-status-badge ${statusClass}">${statusText}</span>`;
    }
    
    // 显示自动开始新游戏倒计时
    showAutoStartCountdown() {
        let countdown = 3;
        const countdownInterval = setInterval(() => {
            if (countdown > 0) {
                this.showToast(`${countdown}秒后自动开始新游戏...`, 'info');
                countdown--;
            } else {
                clearInterval(countdownInterval);
                // 不再在客户端清理界面，让服务器控制游戏流程
                this.showToast('等待服务器开始新游戏...', 'info');
            }
        }, 1000);
    }

    // 清理游戏显示
    clearGameDisplay() {
        // 清空公共牌
        for (let i = 1; i <= 5; i++) {
            const cardSlot = document.getElementById(`communityCard${i}`);
            if (cardSlot) {
                cardSlot.innerHTML = '';
            }
        }
        
        // 清空玩家手牌
        this.playerCards = [];
        this.allPlayerCards.clear();
        for (let i = 1; i <= 2; i++) {
            const cardElement = document.getElementById(`playerCard${i}`);
            if (cardElement) {
                cardElement.innerHTML = '';
            }
        }
        
        // 清空所有玩家位置显示
        for (let i = 1; i <= 8; i++) {
            const position = document.getElementById(`player${i}`);
            if (position) {
                position.innerHTML = '';
                position.classList.remove('active', 'current-turn');
            }
        }
        
        // 重置游戏信息显示
        document.getElementById('potAmount').textContent = '0';
        document.getElementById('currentBet').textContent = '0';
        document.getElementById('gameStage').textContent = '等待开始';
        
        // 禁用所有操作按钮
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.disabled = true;
        });
    }

    // 历史记录功能已移除

    // 播放音效
    playSound(soundId) {
        if (!this.settings.soundEnabled) return;
        
        const audio = document.getElementById(soundId);
        if (audio) {
            // 确保音频已加载
            if (audio.readyState < 2) {
                audio.load();
                audio.addEventListener('canplay', () => {
                    audio.currentTime = 0;
                    audio.play().catch(() => {});
                }, { once: true });
            } else {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            }
        }
    }

    // 旧的toast函数已移除，使用新的日志系统

    // 显示确认对话框
    showConfirm(message, callback) {
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmDialog').classList.remove('hidden');
        this.confirmCallback = callback;
    }

    // 隐藏确认对话框
    hideConfirm() {
        document.getElementById('confirmDialog').classList.add('hidden');
        this.confirmCallback = null;
    }
    
    // 显示输入对话框
    showInput(title, message, callback) {
        document.getElementById('inputTitle').textContent = title;
        document.getElementById('inputMessage').textContent = message;
        document.getElementById('inputField').value = '';
        document.getElementById('inputDialog').classList.remove('hidden');
        this.inputCallback = callback;
        
        // 聚焦到输入框
        setTimeout(() => {
            document.getElementById('inputField').focus();
        }, 100);
    }
    
    // 隐藏输入对话框
    hideInput() {
        document.getElementById('inputDialog').classList.add('hidden');
        this.inputCallback = null;
    }

    // 显示加载动画
    showLoading() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    // 隐藏加载动画
    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
    
    // 显示房间设置对话框
    showRoomSettings() {
        // 同步当前设置状态
        document.getElementById('roomSoundEnabled').checked = this.settings.soundEnabled;
        document.getElementById('roomMusicEnabled').checked = this.settings.musicEnabled;
        document.getElementById('roomSettingsDialog').classList.remove('hidden');
    }
    
    // 隐藏房间设置对话框
    hideRoomSettings() {
        document.getElementById('roomSettingsDialog').classList.add('hidden');
    }
    
    // 保存房间设置
    saveRoomSettings() {
        this.settings.soundEnabled = document.getElementById('roomSoundEnabled').checked;
        this.settings.musicEnabled = document.getElementById('roomMusicEnabled').checked;
        
        // 保存到本地存储
        localStorage.setItem('pokerSettings', JSON.stringify(this.settings));
        
        // 应用设置
        this.applySettings();
        
        // 隐藏对话框
        this.hideRoomSettings();
        
        // 显示保存成功提示
        this.showToast('设置已保存', 'success');
    }
}

// 初始化游戏
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new PokerGame();
});

// 页面卸载时断开连接
window.addEventListener('beforeunload', () => {
    if (game && game.socket) {
        game.socket.disconnect();
    }
});