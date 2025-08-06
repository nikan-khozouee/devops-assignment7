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
    
    async uptime() {
        try {
            // Find process by server port using netstat
            const serverPort = process.env.SERVER_PORT || 4001;
            const { spawn } = require('child_process');
            
            return new Promise((resolve) => {
                const netstat = spawn('netstat', ['-tlnp']);
                let output = '';
                netstat.stdout.on('data', (data) => {
                    output += data.toString();
                });
                netstat.on('close', () => {
                    const lines = output.split('\n');
                    let serverPid = null;
                    
                    for (const line of lines) {
                        if (line.includes(`:${serverPort} `) && line.includes('LISTEN')) {
                            const match = line.match(/(\d+)\//);
                            if (match) {
                                serverPid = match[1];
                                break;
                            }
                        }
                    }
                    
                    if (!serverPid) {
                        resolve(0);
                        return;
                    }
                    
                    // Use /proc/PID/stat to get process start time
                    fs.readFile(`/proc/${serverPid}/stat`, 'utf8')
                        .then(statContent => {
                            const fields = statContent.trim().split(' ');
                            const starttime = parseInt(fields[21]); // Process start time in clock ticks
                            
                            // Get system clock ticks per second
                            return fs.readFile('/proc/stat', 'utf8')
                                .then(procStat => {
                                    // Get system uptime
                                    return fs.readFile('/proc/uptime', 'utf8')
                                        .then(uptimeContent => {
                                            const systemUptimeSeconds = parseFloat(uptimeContent.split(' ')[0]);
                                            // Get clock ticks per second dynamically
                                            const getconf = spawn('getconf', ['CLK_TCK']);
                                            let clockTicks = '';
                                            getconf.stdout.on('data', (data) => {
                                                clockTicks += data.toString();
                                            });
                                            getconf.on('close', () => {
                                                const clockTicksPerSecond = parseInt(clockTicks.trim()) || 100;
                                                const processStartSeconds = starttime / clockTicksPerSecond;
                                                const processUptimeSeconds = systemUptimeSeconds - processStartSeconds;
                                                
                                                resolve(Math.max(0, Math.floor(processUptimeSeconds)));
                                            });
                                        });
                                });
                        })
                        .catch(() => {
                            resolve(0);
                        });
                });
            });
        } catch (error) {
            console.error('Error reading uptime:', error);
            return 0;
        }
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
