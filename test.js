// 德州扑克游戏测试文件
const assert = require('assert');

// 导入游戏逻辑（需要将server.js中的函数导出）
// 这里提供测试框架，实际使用时需要重构server.js以支持模块导出

// 模拟游戏逻辑函数（从server.js复制）
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

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

// 创建一副牌
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
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
  
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  
  // 判断牌型
  if (isFlush && isStraight) {
    if (ranks[0] === 12 && ranks[4] === 8) { // A-K-Q-J-10
      return { type: HAND_TYPES.ROYAL_FLUSH, value: 10000000, cards };
    }
    return { type: HAND_TYPES.STRAIGHT_FLUSH, value: 9000000 + ranks[0], cards };
  }
  
  if (counts[0] === 4) {
    return { type: HAND_TYPES.FOUR_KIND, value: 8000000 + ranks[0] * 1000, cards };
  }
  
  if (counts[0] === 3 && counts[1] === 2) {
    return { type: HAND_TYPES.FULL_HOUSE, value: 7000000 + ranks[0] * 1000, cards };
  }
  
  if (isFlush) {
    return { type: HAND_TYPES.FLUSH, value: 6000000 + ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4], cards };
  }
  
  if (isStraight) {
    return { type: HAND_TYPES.STRAIGHT, value: 5000000 + ranks[0], cards };
  }
  
  if (counts[0] === 3) {
    return { type: HAND_TYPES.THREE_KIND, value: 4000000 + ranks[0] * 1000, cards };
  }
  
  if (counts[0] === 2 && counts[1] === 2) {
    return { type: HAND_TYPES.TWO_PAIR, value: 3000000 + ranks[0] * 1000 + ranks[2] * 100, cards };
  }
  
  if (counts[0] === 2) {
    return { type: HAND_TYPES.PAIR, value: 2000000 + ranks[0] * 1000, cards };
  }
  
  return { type: HAND_TYPES.HIGH_CARD, value: 1000000 + ranks[0] * 10000 + ranks[1] * 1000 + ranks[2] * 100 + ranks[3] * 10 + ranks[4], cards };
}

// 评估手牌
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

// 测试用例
function runTests() {
  console.log('开始运行德州扑克游戏测试...');
  
  // 测试1：创建牌组
  console.log('\n测试1：创建牌组');
  const deck = createDeck();
  assert.strictEqual(deck.length, 52, '牌组应该有52张牌');
  console.log('✓ 牌组创建成功，包含52张牌');
  
  // 测试2：洗牌功能
  console.log('\n测试2：洗牌功能');
  const originalDeck = [...deck];
  const shuffledDeck = shuffleDeck(deck);
  assert.strictEqual(shuffledDeck.length, 52, '洗牌后应该仍有52张牌');
  
  // 检查是否真的洗牌了（概率性测试）
  let differentPositions = 0;
  for (let i = 0; i < 52; i++) {
    if (originalDeck[i].suit !== shuffledDeck[i].suit || originalDeck[i].rank !== shuffledDeck[i].rank) {
      differentPositions++;
    }
  }
  assert(differentPositions > 10, '洗牌应该改变大部分牌的位置');
  console.log(`✓ 洗牌成功，${differentPositions}张牌改变了位置`);
  
  // 测试3：皇家同花顺
  console.log('\n测试3：皇家同花顺识别');
  const royalFlush = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'hearts', rank: 'K' },
    { suit: 'hearts', rank: 'Q' },
    { suit: 'hearts', rank: 'J' },
    { suit: 'hearts', rank: '10' }
  ];
  const royalResult = evaluateFiveCards(royalFlush);
  assert.strictEqual(royalResult.type, HAND_TYPES.ROYAL_FLUSH, '应该识别为皇家同花顺');
  console.log('✓ 皇家同花顺识别正确');
  
  // 测试4：同花顺
  console.log('\n测试4：同花顺识别');
  const straightFlush = [
    { suit: 'spades', rank: '9' },
    { suit: 'spades', rank: '8' },
    { suit: 'spades', rank: '7' },
    { suit: 'spades', rank: '6' },
    { suit: 'spades', rank: '5' }
  ];
  const straightFlushResult = evaluateFiveCards(straightFlush);
  assert.strictEqual(straightFlushResult.type, HAND_TYPES.STRAIGHT_FLUSH, '应该识别为同花顺');
  console.log('✓ 同花顺识别正确');
  
  // 测试5：四条
  console.log('\n测试5：四条识别');
  const fourKind = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'diamonds', rank: 'A' },
    { suit: 'clubs', rank: 'A' },
    { suit: 'spades', rank: 'A' },
    { suit: 'hearts', rank: 'K' }
  ];
  const fourKindResult = evaluateFiveCards(fourKind);
  assert.strictEqual(fourKindResult.type, HAND_TYPES.FOUR_KIND, '应该识别为四条');
  console.log('✓ 四条识别正确');
  
  // 测试6：葫芦
  console.log('\n测试6：葫芦识别');
  const fullHouse = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'diamonds', rank: 'A' },
    { suit: 'clubs', rank: 'A' },
    { suit: 'spades', rank: 'K' },
    { suit: 'hearts', rank: 'K' }
  ];
  const fullHouseResult = evaluateFiveCards(fullHouse);
  assert.strictEqual(fullHouseResult.type, HAND_TYPES.FULL_HOUSE, '应该识别为葫芦');
  console.log('✓ 葫芦识别正确');
  
  // 测试7：同花
  console.log('\n测试7：同花识别');
  const flush = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'hearts', rank: 'J' },
    { suit: 'hearts', rank: '9' },
    { suit: 'hearts', rank: '7' },
    { suit: 'hearts', rank: '5' }
  ];
  const flushResult = evaluateFiveCards(flush);
  assert.strictEqual(flushResult.type, HAND_TYPES.FLUSH, '应该识别为同花');
  console.log('✓ 同花识别正确');
  
  // 测试8：顺子
  console.log('\n测试8：顺子识别');
  const straight = [
    { suit: 'hearts', rank: '10' },
    { suit: 'diamonds', rank: '9' },
    { suit: 'clubs', rank: '8' },
    { suit: 'spades', rank: '7' },
    { suit: 'hearts', rank: '6' }
  ];
  const straightResult = evaluateFiveCards(straight);
  assert.strictEqual(straightResult.type, HAND_TYPES.STRAIGHT, '应该识别为顺子');
  console.log('✓ 顺子识别正确');
  
  // 测试9：特殊顺子 A-2-3-4-5
  console.log('\n测试9：特殊顺子识别 (A-2-3-4-5)');
  const wheelStraight = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'diamonds', rank: '2' },
    { suit: 'clubs', rank: '3' },
    { suit: 'spades', rank: '4' },
    { suit: 'hearts', rank: '5' }
  ];
  const wheelResult = evaluateFiveCards(wheelStraight);
  assert.strictEqual(wheelResult.type, HAND_TYPES.STRAIGHT, '应该识别为顺子');
  console.log('✓ 特殊顺子识别正确');
  
  // 测试10：三条
  console.log('\n测试10：三条识别');
  const threeKind = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'diamonds', rank: 'A' },
    { suit: 'clubs', rank: 'A' },
    { suit: 'spades', rank: 'K' },
    { suit: 'hearts', rank: 'Q' }
  ];
  const threeKindResult = evaluateFiveCards(threeKind);
  assert.strictEqual(threeKindResult.type, HAND_TYPES.THREE_KIND, '应该识别为三条');
  console.log('✓ 三条识别正确');
  
  // 测试11：两对
  console.log('\n测试11：两对识别');
  const twoPair = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'diamonds', rank: 'A' },
    { suit: 'clubs', rank: 'K' },
    { suit: 'spades', rank: 'K' },
    { suit: 'hearts', rank: 'Q' }
  ];
  const twoPairResult = evaluateFiveCards(twoPair);
  assert.strictEqual(twoPairResult.type, HAND_TYPES.TWO_PAIR, '应该识别为两对');
  console.log('✓ 两对识别正确');
  
  // 测试12：一对
  console.log('\n测试12：一对识别');
  const pair = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'diamonds', rank: 'A' },
    { suit: 'clubs', rank: 'K' },
    { suit: 'spades', rank: 'Q' },
    { suit: 'hearts', rank: 'J' }
  ];
  const pairResult = evaluateFiveCards(pair);
  assert.strictEqual(pairResult.type, HAND_TYPES.PAIR, '应该识别为一对');
  console.log('✓ 一对识别正确');
  
  // 测试13：高牌
  console.log('\n测试13：高牌识别');
  const highCard = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'diamonds', rank: 'K' },
    { suit: 'clubs', rank: 'Q' },
    { suit: 'spades', rank: 'J' },
    { suit: 'hearts', rank: '9' }
  ];
  const highCardResult = evaluateFiveCards(highCard);
  assert.strictEqual(highCardResult.type, HAND_TYPES.HIGH_CARD, '应该识别为高牌');
  console.log('✓ 高牌识别正确');
  
  // 测试14：7张牌中选择最佳5张
  console.log('\n测试14：7张牌中选择最佳组合');
  const sevenCards = [
    { suit: 'hearts', rank: 'A' },
    { suit: 'diamonds', rank: 'A' },
    { suit: 'clubs', rank: 'A' },
    { suit: 'spades', rank: 'K' },
    { suit: 'hearts', rank: 'K' },
    { suit: 'diamonds', rank: '2' },
    { suit: 'clubs', rank: '3' }
  ];
  const sevenCardResult = evaluateHand(sevenCards);
  assert.strictEqual(sevenCardResult.type, HAND_TYPES.FULL_HOUSE, '应该从7张牌中识别出葫芦');
  console.log('✓ 7张牌最佳组合识别正确');
  
  // 测试15：牌型大小比较
  console.log('\n测试15：牌型大小比较');
  const hand1 = evaluateFiveCards(royalFlush);
  const hand2 = evaluateFiveCards(straightFlush);
  const hand3 = evaluateFiveCards(fourKind);
  
  assert(hand1.value > hand2.value, '皇家同花顺应该大于同花顺');
  assert(hand2.value > hand3.value, '同花顺应该大于四条');
  console.log('✓ 牌型大小比较正确');
  
  console.log('\n🎉 所有测试通过！游戏核心逻辑运行正常。');
}

// 性能测试
function performanceTest() {
  console.log('\n开始性能测试...');
  
  const iterations = 10000;
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    
    // 模拟发7张牌
    const cards = shuffled.slice(0, 7);
    const result = evaluateHand(cards);
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  const operationsPerSecond = Math.round((iterations / duration) * 1000);
  
  console.log(`性能测试结果：`);
  console.log(`- 执行${iterations}次牌型评估`);
  console.log(`- 总耗时：${duration}ms`);
  console.log(`- 平均每次：${(duration / iterations).toFixed(2)}ms`);
  console.log(`- 每秒操作数：${operationsPerSecond}`);
  
  if (operationsPerSecond > 1000) {
    console.log('✓ 性能测试通过');
  } else {
    console.log('⚠ 性能可能需要优化');
  }
}

// 运行所有测试
if (require.main === module) {
  try {
    runTests();
    performanceTest();
    console.log('\n✅ 所有测试完成！');
  } catch (error) {
    console.error('\n❌ 测试失败：', error.message);
    process.exit(1);
  }
}

module.exports = {
  createDeck,
  shuffleDeck,
  evaluateHand,
  evaluateFiveCards,
  HAND_TYPES,
  runTests,
  performanceTest
};