const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const database = require('../config/database');

// 数据库初始化脚本
class DatabaseInitializer {
  constructor() {
    this.db = database;
  }

  async initialize() {
    try {
      console.log('开始初始化数据库...');
      
      // 连接数据库
      await this.db.connect();
      console.log('数据库连接成功');
      
      // 创建管理员账户
      await this.createAdminUser();
      
      // 创建测试用户
      await this.createTestUsers();
      
      console.log('数据库初始化完成');
      
    } catch (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    } finally {
      await this.db.disconnect();
    }
  }

  async createAdminUser() {
    try {
      // 检查是否已存在管理员
      const existingAdmin = await User.findOne({ isAdmin: true });
      if (existingAdmin) {
        console.log('管理员账户已存在:', existingAdmin.username);
        return;
      }

      // 创建默认管理员
      const adminUser = new User({
        username: 'admin',
        email: 'admin@poker.com',
        password: 'admin123',
        totalChips: 100000,
        isAdmin: true,
        avatar: '/avatars/admin.png'
      });

      await adminUser.save();
      console.log('管理员账户创建成功: admin / admin123');
      
    } catch (error) {
      console.error('创建管理员账户失败:', error);
      throw error;
    }
  }

  async createTestUsers() {
    try {
      const testUsers = [
        {
          username: 'player1',
          email: 'player1@poker.com',
          password: 'password123',
          totalChips: 5000,
          avatar: '/avatars/player1.png'
        },
        {
          username: 'player2',
          email: 'player2@poker.com',
          password: 'password123',
          totalChips: 3000,
          avatar: '/avatars/player2.png'
        },
        {
          username: 'player3',
          email: 'player3@poker.com',
          password: 'password123',
          totalChips: 2000,
          avatar: '/avatars/player3.png'
        }
      ];

      for (const userData of testUsers) {
        const existingUser = await User.findOne({ username: userData.username });
        if (!existingUser) {
          const user = new User(userData);
          await user.save();
          console.log(`测试用户创建成功: ${userData.username}`);
        } else {
          console.log(`测试用户已存在: ${userData.username}`);
        }
      }
      
    } catch (error) {
      console.error('创建测试用户失败:', error);
      throw error;
    }
  }

  async resetDatabase() {
    try {
      console.log('开始重置数据库...');
      
      await this.db.connect();
      
      // 清空所有集合
      await User.deleteMany({});
      console.log('用户数据已清空');
      
      // 重新初始化
      await this.createAdminUser();
      await this.createTestUsers();
      
      console.log('数据库重置完成');
      
    } catch (error) {
      console.error('数据库重置失败:', error);
      throw error;
    } finally {
      await this.db.disconnect();
    }
  }
}

// 命令行执行
if (require.main === module) {
  const initializer = new DatabaseInitializer();
  
  const command = process.argv[2];
  
  if (command === 'reset') {
    initializer.resetDatabase()
      .then(() => {
        console.log('数据库重置成功');
        process.exit(0);
      })
      .catch((error) => {
        console.error('数据库重置失败:', error);
        process.exit(1);
      });
  } else {
    initializer.initialize()
      .then(() => {
        console.log('数据库初始化成功');
        process.exit(0);
      })
      .catch((error) => {
        console.error('数据库初始化失败:', error);
        process.exit(1);
      });
  }
}

module.exports = DatabaseInitializer;