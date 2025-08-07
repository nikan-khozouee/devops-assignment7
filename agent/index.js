const fs = require('fs').promises;
const { createServer } = require('http');
const { Server } = require('socket.io');
const pm2 = require('pm2');
const pidusage = require('pidusage');

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
    
    async uptime() {
        return new Promise((resolve) => {
            pm2.connect(err => {
                if (err) {
                    console.error('PM2 connect error:', err);
                    return resolve(0);
                }
                
                pm2.list((err, list) => {
                    pm2.disconnect();
                    if (err) {
                        console.error('PM2 list error:', err);
                        return resolve(0);
                    }
                    
                    const serverProcess = list.find(p => p.name === 'server');
                    if (!serverProcess || !serverProcess.pid) {
                        console.error('Server process not found');
                        return resolve(0);
                    }
                    
                    const pid = serverProcess.pid;
                    
                    // Use pidusage to get process uptime
                    pidusage(pid, (err, stats) => {
                        if (err) {
                            console.error('Pidusage error:', err);
                            return resolve(0);
                        }
                        
                        // pidusage returns elapsed time in ms since process start
                        const processUptimeSeconds = Math.floor(stats.elapsed / 1000);
                        resolve(Math.max(0, processUptimeSeconds));
                    });
                });
            });
        });
    }   

    async requestsPerSecond() {
        try {
            const content = await fs.readFile('/tmp/server_requests', 'utf8');
            const [requestCount, timestamp] = content.trim().split(',');
            
            const fileTimestamp = parseInt(timestamp);
            const now = Date.now();
            
            // Check if file is stale (older than 3 seconds)
            if (now - fileTimestamp > 3000) {
                return -1; // Indicates server down/stale data
            }
            
            return parseInt(requestCount) || 0;
        } catch (error) {
            // File doesn't exist or can't read = server down
            return -1;
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
        const uptime = await agent.uptime();
        const requestsPerSecond = await agent.requestsPerSecond();
        console.log({ memoryLoad, cpuLoad, uptime, requestsPerSecond });
        socket.emit('monitoring-stats', { memoryLoad, cpuLoad, uptime, requestsPerSecond });
    }, 1000);
});

httpServer.listen(process.env.AGENT_PORT || 5001, () => {
    console.log('Agent listening on port ' + process.env.AGENT_PORT || 5001 + '!');
});
