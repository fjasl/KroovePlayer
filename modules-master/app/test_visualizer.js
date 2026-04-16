const { Engine } = require("./build/Release/ag_backend.node");
const path = require("path");

// 注意：请在运行前将此处改为你电脑上真实的歌曲路径
const TEST_AUDIO_PATH = process.argv[2] || "C:\\Your\\Music\\Test.mp3"; 

if (!TEST_AUDIO_PATH || TEST_AUDIO_PATH.includes("Your")) {
    console.log("请通过命令行传入歌曲路径: node test_visualizer.js \"D:\\Music\\test.mp3\"");
    process.exit(1);
}

const engine = new Engine();

// 1. 获取共享内存 Buffer 并建立频谱视图 (Offset: 72)
const sharedBuffer = engine.getSharedStatusBuffer();
const spectrum = new Float32Array(
    sharedBuffer.buffer, 
    sharedBuffer.byteOffset + 72, 
    256
);

console.log("🚀 正在验证音频可视化链路...");

// 2. 模拟加载和播放
try {
    const layout = engine.load(TEST_AUDIO_PATH, "");
    if (layout) {
        engine.play();
        engine.setVisualizerFrequency(60); 
        console.log("🎵 引擎已启动，正在播放:", TEST_AUDIO_PATH);

        const readline = require('readline');
        const VIEW_HEIGHT = 15; // 频谱图高度
        const VIEW_WIDTH = 60;  // 频谱图总宽度

        const timer = setInterval(() => {
            // 回到左上角，但不清屏，通过覆盖来消除频闪
            readline.cursorTo(process.stdout, 0, 0);
            
            let frame = "";
            frame += "============================================================\n";
            frame += "      🎶 KroovePlayer 纵向频谱验证 (零闪烁模式)             \n";
            frame += "============================================================\n";
            frame += ` 🎵 文件: ${path.basename(TEST_AUDIO_PATH).padEnd(40, " ")}\n\n`;
            
            // 按 60 个列进行非线性采样映射
            const numColumns = VIEW_WIDTH;
            const columnHeights = new Array(numColumns);

            for (let x = 0; x < numColumns; x++) {
                // 核心算法 1：非线性频率采样映射 (让低频占用更少列，高频占用更多列，即对数化分布)
                // 使用二次方曲线映射：index = x^2 / numColumns^2 * 256
                const startRatio = Math.pow(x / numColumns, 1.5);
                const endRatio = Math.pow((x + 1) / numColumns, 1.5);
                const startBin = Math.floor(startRatio * 256);
                const endBin = Math.max(startBin + 1, Math.floor(endRatio * 256));

                let rawVal = 0;
                for (let j = startBin; j < endBin && j < 256; j++) {
                    rawVal = Math.max(rawVal, spectrum[j]);
                }

                // 核心算法 2：感知补偿 (JS 层做 sqrt 增强和高频增益)
                let processedVal = Math.sqrt(rawVal) * 1.5; // 基础开方增强
                const freqWeight = 1.0 + (x / numColumns) * 3.5; // 为中高频提供 1x~4.5x 的视觉增益
                processedVal *= freqWeight;

                columnHeights[x] = Math.floor(Math.min(processedVal * 15, VIEW_HEIGHT));
            }

            // 从上往下逐行构建 (Y 轴从 VIEW_HEIGHT 递减到 1)
            for (let y = VIEW_HEIGHT; y >= 1; y--) {
                let line = "  ";
                for (let x = 0; x < numColumns; x++) {
                    if (columnHeights[x] >= y) {
                        // 根据高度设置颜色 (高位红色，低位绿色)
                        const color = y > 10 ? "\x1b[31m" : (y > 5 ? "\x1b[33m" : "\x1b[32m");
                        line += color + "█" + "\x1b[0m";
                    } else {
                        line += " ";
                    }
                }
                frame += line + "  \n";
            }

            frame += "  " + "-".repeat(numColumns) + "  \n";
            
            const totalEnergy = Array.from(spectrum).reduce((a, b) => a + b, 0);
            frame += ` 状态: ${totalEnergy > 0 ? "✅ 信号活跃" : "💤 等待信号..."}  [${totalEnergy.toFixed(2)}]      \n`;
            frame += "============================================================\n";

            process.stdout.write(frame);
        }, 33); // 降低到 ~30fps 提高稳定性 (33ms)

        // 60 秒后自动停止
        setTimeout(() => {
            clearInterval(timer);
            engine.stop();
            console.log("\n🏁 测试结束。");
            process.exit(0);
        }, 60000);
    } else {
        console.error("❌ 无法加载文件，请检查路径。");
    }
} catch (e) {
    console.error("❌ 运行时出错:", e);
}
