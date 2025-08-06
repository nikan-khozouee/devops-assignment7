const express = require('express');
const app = express();
const httpServer = require('http').Server(app);
const {Server} = require('socket.io');
const { io } = require("socket.io-client");

app.use(express.static('www'));

// TODO: update these if you used different ports!
const servers = [
    // { name: "computer", url: `http://localhost`, port: 5005, serverPort: 4005, status: "#cccccc", scoreTrend: [] }, // you can also monitor your local machine
    { name: "server-01", url: `http://localhost`, port: 5001, serverPort: 4001, status: "#cccccc", scoreTrend: [0] },
    { name: "server-02", url: `http://localhost`, port: 5002, serverPort: 4002, status: "#cccccc", scoreTrend: [0] },
    { name: "server-03", url: `http://localhost`, port: 5003, serverPort: 4003, status: "#cccccc", scoreTrend: [0] }
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


// ==================================================
// Score calculation
// ==================================================

// TODO:
function updateHealth(server) {
    let score = 0;
    
    // CPU Load scoring (0-1 points)
    if (server.cpuLoad !== undefined) {
        if (server.cpuLoad <= 50) score += 1;
        else if (server.cpuLoad <= 75) score += 0.5;
        // 0 points if CPU > 75%
    }
    
    // Memory Load scoring (0-1 points)
    if (server.memoryLoad !== undefined) {
        if (server.memoryLoad <= 70) score += 1;
        else if (server.memoryLoad <= 85) score += 0.5;
        // 0 points if Memory > 85%
    }
    
    // Latency scoring (0-1 points)
    if (server.latency !== undefined) {
        if (server.latency === -1) {
            // Server unreachable
            score += 0;
        } else if (server.latency <= 100) {
            score += 1;
        } else if (server.latency <= 500) {
            score += 0.5;
        }
        // 0 points if latency > 500ms
    }
    
    // Status Code scoring (0-1 points)
    if (server.statusCode !== undefined) {
        if (server.statusCode >= 200 && server.statusCode < 300) {
            score += 1; // Success responses
        } else if (server.statusCode >= 300 && server.statusCode < 500) {
            score += 0.5; // Redirects or client errors
        }
        // 0 points for server errors (5xx) or no response (0)
    }

    server.status = score2color(score / 4);

    // console.log(`${server.name} ${score}`);
    console.log(server.scoreTrend)

    // Add score to trend data.
    server.scoreTrend.push((4 - score));
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
