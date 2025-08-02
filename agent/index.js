const fs = require('fs').promises;
const { createServer } = require('http');
const { Server } = require('socket.io');

class Agent {
    constructor() {
        this.lastCpuCheck = Date.now();
        this.lastCpuUsage = 0;
    }
    
    async memoryLoad() {
        try {
            const current = await fs.readFile('/sys/fs/cgroup/memory.current', 'utf8');
            const max = await fs.readFile('/sys/fs/cgroup/memory.max', 'utf8');
            
            const currentBytes = parseInt(current.trim());
            const maxBytes = parseInt(max.trim());
            
            const percentage = Math.round((currentBytes / maxBytes) * 100);
            return percentage;
        } catch (error) {
            console.error('Error reading memory stats:', error);
            return 0;
        }
    }

    async cpuLoad() {
        try {
            const cpuStatContent = await fs.readFile('/sys/fs/cgroup/cpu.stat', 'utf8');
            const lines = cpuStatContent.trim().split('\n');
            
            let currentUsageUsec = 0;
            for (const line of lines) {
                if (line.startsWith('usage_usec ')) {
                    currentUsageUsec = parseInt(line.split(' ')[1]);
                    break;
                }
            }
            
            const currentTime = Date.now();
            
            if (this.lastCpuUsage === 0) {
                this.lastCpuUsage = currentUsageUsec;
                this.lastCpuCheck = currentTime;
                return 0;
            }
            
            const usageIncrease = currentUsageUsec - this.lastCpuUsage;
            const timeIncreaseMs = currentTime - this.lastCpuCheck;
            const timeIncreaseUsec = timeIncreaseMs * 1000; //convert millisecond to microsecond
            
            const cpuPercentage = Math.round((usageIncrease / timeIncreaseUsec) * 100);
            
            this.lastCpuUsage = currentUsageUsec;
            this.lastCpuCheck = currentTime;
            
            return Math.max(0, Math.min(100, cpuPercentage));
        } catch (error) {
            console.error('Error reading CPU stats:', error);
            return 0;
        }
    }
    
    // TODO: other metrics
}


const agent = new Agent();
const httpServer = createServer();
const io = new Server(httpServer, {
    transports: ['websocket']
});

io.on('connection', (socket) => {
    console.log('Agent connected to monitor')
    setInterval(async () => {
        const memoryLoad = await agent.memoryLoad();
        const cpuLoad = await agent.cpuLoad();
        console.log({ memoryLoad, cpuLoad });
        socket.emit('monitoring-stats', { memoryLoad, cpuLoad });
    }, 1000);
});

httpServer.listen(process.env.AGENT_PORT || 5001, () => {
    console.log('Agent listening on port ' + process.env.AGENT_PORT || 5001 + '!');
});
