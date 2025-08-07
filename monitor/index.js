const express = require('express');
const app = express();
const httpServer = require('http').Server(app);
const {Server} = require('socket.io');
const { io } = require("socket.io-client");

app.use(express.static('www'));

// TODO: update these if you used different ports!
const servers = [
    // { name: "computer", url: `http://localhost`, port: 5005, serverPort: 4005, status: "#cccccc", scoreTrend: [] }, // you can also monitor your local machine
    { name: "server-01", url: `http://localhost`, port: 5001, serverPort: 4001, status: "#cccccc", scoreTrend: [0], lastResponseTime: Date.now() },
    { name: "server-02", url: `http://localhost`, port: 5002, serverPort: 4002, status: "#cccccc", scoreTrend: [0], lastResponseTime: Date.now() },
    { name: "server-03", url: `http://localhost`, port: 5003, serverPort: 4003, status: "#cccccc", scoreTrend: [0], lastResponseTime: Date.now() }
];

// ==================================================
// Connect to the Agent websocket servers
// ==================================================

for (const server of servers) {
    const agentSocket = io(server.url + ':' + server.port, { transports: ['websocket'] })
    console.log('Server connected:', server.name);
    agentSocket.on('monitoring-stats', async (data) => {
        console.log('monitoring-stats', data);
        // process.exit(1);
        // update servers array to set this server status.
        server.memoryLoad = data.memoryLoad;
        server.cpuLoad = data.cpuLoad;
        server.uptime = data.uptime;
        server.requestsPerSecond = data.requestsPerSecond;
        server.lastResponseTime = Date.now();
        updateHealth(server);
    });
}

// ==================================================
// Monitor socket to send data to the dashboard front-end
// ==================================================

const monitorSocket = new Server(httpServer, {
    transports: ['websocket'],
    cors: {
        origin: "https://example.com",
        methods: ["GET", "POST"]
    }
});
monitorSocket.on('connection', socket => {
    console.log('Monitoring dashboard connected');
    const heartbeatInterval = setInterval(() => {
        socket.emit('heartbeat', { servers });
    }, 1000);

    socket.on('disconnect', () => {
        clearInterval(heartbeatInterval);
    });
});

// ==================================================
// Latency calculation
// ==================================================

async function checkServerHealth() {
    for (const server of servers) {
        server.statusCode = 0; // Default to unreachable
        server.latency = -1; // Default to unreachable
        
        try {
            const startTime = Date.now();
            const response = await fetch(`${server.url}:${server.serverPort}/`);
            const endTime = Date.now();
            
            server.latency = endTime - startTime;
            server.statusCode = response.status;
            console.log(`${server.name} - SUCCESS: ${response.status}, latency: ${server.latency}ms`);
        } catch (error) {
            console.log(`${server.name} - ERROR: ${error.message}, statusCode remains 0`);
        }
    }
}

// Check server health every 5 seconds
setInterval(checkServerHealth, 5000);
checkServerHealth(); // Initial check

// Check for stale agent data and reset to zero if no response
function checkStaleAgentData() {
    const staleThreshold = 6000;
    const now = Date.now();
    
    for (const server of servers) {
        if (now - server.lastResponseTime > staleThreshold) {
            console.log(`${server.name} - No agent response for ${(now - server.lastResponseTime) / 1000}s, resetting metrics to zero`);
            server.memoryLoad = -1;
            server.cpuLoad = -1;
            server.uptime = -1;
            server.requestsPerSecond = -1;
            server.statusCode = -1;
            updateHealth(server);
        }
    }
}

// Check for stale agent data every 5 seconds
setInterval(checkStaleAgentData, 5000);


// ==================================================
// Score calculation
// ==================================================

function updateHealth(server) {
    let score = 0;
    const maxScore = 6; // Updated max score for 6 metrics
    
    // Check if server data is stale (agent not responding)
    if (server.cpuLoad === -1 || server.memoryLoad === -1 || server.uptime === -1 || 
        server.requestsPerSecond === -1 || server.statusCode === -1) {
        // Server is stale/unresponsive - give it a zero score
        server.status = score2color(0);
        if (server.scoreTrend.length > 100) {
            server.scoreTrend.shift();
        }
        return;
    }
    
    // CPU Load scoring (0-2 points) - Higher weight as it's critical
    if (server.cpuLoad !== undefined && server.cpuLoad >= 0) {
        if (server.cpuLoad <= 50) score += 2;        // Excellent: <= 50%
        else if (server.cpuLoad <= 70) score += 1.5; // Good: 50-70%
        else if (server.cpuLoad <= 85) score += 1;   // Fair: 70-85%
        else if (server.cpuLoad <= 95) score += 0.5; // Poor: 85-95%
        // Critical: > 95% = 0 points
    }
    
    // Memory Load scoring (0-2 points) - Higher weight as it's critical
    if (server.memoryLoad !== undefined && server.memoryLoad >= 0) {
        if (server.memoryLoad <= 60) score += 2;        // Excellent: <= 60%
        else if (server.memoryLoad <= 75) score += 1.5; // Good: 60-75%
        else if (server.memoryLoad <= 85) score += 1;   // Fair: 75-85%
        else if (server.memoryLoad <= 95) score += 0.5; // Poor: 85-95%
        // Critical: > 95% = 0 points
    }
    
    // Latency scoring (0-1 points) - Response time is user-facing
    if (server.latency !== undefined) {
        if (server.latency === -1) {
            score += 0; // Unreachable
        } else if (server.latency <= 50) {
            score += 1;   // Excellent: <= 50ms
        } else if (server.latency <= 200) {
            score += 0.75; // Good: 50-200ms
        } else if (server.latency <= 500) {
            score += 0.5;  // Fair: 200-500ms
        } else if (server.latency <= 1000) {
            score += 0.25; // Poor: 500ms-1s
        }
        // Critical: > 1s = 0 points
    }
    
    // Status Code scoring (0-1 points)
    if (server.statusCode !== undefined) {
        if (server.statusCode >= 200 && server.statusCode < 300) {
            score += 1; // Success responses
        } else if (server.statusCode >= 300 && server.statusCode < 400) {
            score += 0.75; // Redirects
        } else if (server.statusCode >= 400 && server.statusCode < 500) {
            score += 0.25; // Client errors
        }
        // Server errors (5xx) or no response = 0 points
    }
    
    // Uptime bonus (0-0.5 points) - Reward stability
    if (server.uptime !== undefined && server.uptime >= 0) {
        const uptimeHours = server.uptime / 3600;
        if (uptimeHours >= 24) score += 0.5;      // Excellent: 24+ hours
        else if (uptimeHours >= 12) score += 0.35; // Good: 12-24 hours  
        else if (uptimeHours >= 1) score += 0.2;   // Fair: 1-12 hours
        // < 1 hour = 0 bonus points
    }
    
    // Requests handling capability (0-0.5 points)
    if (server.requestsPerSecond !== undefined && server.requestsPerSecond >= 0) {
        if (server.requestsPerSecond >= 100) score += 0.5;      // High load handling
        else if (server.requestsPerSecond >= 50) score += 0.35; // Medium load
        else if (server.requestsPerSecond >= 10) score += 0.2;  // Low load
        else if (server.requestsPerSecond >= 1) score += 0.1;   // Minimal activity
        // 0 requests = 0 points (could indicate issues)
    }

    // Calculate final health percentage
    const healthPercentage = Math.min(score / maxScore, 1);
    server.status = score2color(healthPercentage);

    console.log(`${server.name} health score: ${score.toFixed(2)}/${maxScore} (${(healthPercentage * 100).toFixed(1)}%)`);

    // Add inverted score to trend data (higher values = worse health for chart display)
    server.scoreTrend.push(maxScore - score);
    if (server.scoreTrend.length > 100) {
        server.scoreTrend.shift();
    }
}

function score2color(score) {
    if (score <= 0.25) return "#ff0000";
    if (score <= 0.50) return "#ffcc00";
    if (score <= 0.75) return "#00cc00";
    return "#00ff00";
}

// ==================================================

httpServer.listen(3000, () => {
    console.log('Example app listening on port 3000!');
});
