const CoreManager = require('./units/coreManager.js');
const NetworkManager = require('./units/networkManager.js');

// 1. 系统核心配置与初始化
const core = new CoreManager();
const network = new NetworkManager(core);

// 2. 启动整体业务
async function startApp() {
    try {
        // 第一步：启动库扫描与引擎预热
        await core.bootstrap();
        
        // 第二步：开启集中的网络总线 (所有路由节点集中于此)
        await network.start(6344);
        
        console.log("✨ Kroove 核心集群已就绪，网络节点已全面收拢。");
    } catch (e) {
        console.error("❌ 启动失败:", e);
    }
}

startApp();
