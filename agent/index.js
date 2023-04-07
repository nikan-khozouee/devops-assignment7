const os = require('os');
const si = require('systeminformation');
const { createServer } = require('http');
const { Server } = require('socket.io');

class Agent {
    async memoryLoad() {
        console.log('memoryLoad', os.totalmem(), os.freemem());
        return 10;
    }

    async cpuLoad() {
        return 10;
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
        // console.log({ memoryLoad, cpuLoad });
        socket.emit('monitoring-stats', { memoryLoad, cpuLoad });
    }, 1000);
});

httpServer.listen(5001, () => {
    console.log('Agent listening on port 5001!');
});
