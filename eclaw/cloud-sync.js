/**
 * cloud-sync.js - 数据库连接配置模块
 *
 * 所有配置通过环境变量注入，默认连接本地 MySQL。
 * 部署前请复制 .env.example 为 .env 并修改数据库配置。
 *
 * 首次部署需手动创建数据库：
 *   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS wclaw_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
 */

// ====== 数据库连接配置（从环境变量读取） ======
const DB_CONFIG = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'wclaw_db',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

/**
 * 获取 MySQL 连接配置
 */
function getCloudDbConfig() {
    return { ...DB_CONFIG };
}

module.exports = {
    startTunnel: () => Promise.resolve(),
    stopTunnel: () => {},
    getCloudDbConfig,
    syncFavorite: async () => {},
    unsyncFavorite: async () => {}
};
