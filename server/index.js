const { spawn, spawnSync } = require('child_process');
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/memory-load', (req, res) => {
    spawn('stress-ng --vm 4 --vm-bytes 300M --timeout 30s --metrics-brief', { shell: true });
    res.send('Memory stress-ng, started for 30 seconds');
});

app.get('/cpu-load', (req, res) => {
    spawn('stress-ng --cpu 1 --cpu-ops 900000 --timeout 30s --metrics-brief', { shell: true });
    res.send('CPU stress-ng, started for 30 seconds');
});

app.get('/max-load', (req, res) => {
    spawn('stress-ng --cpu 4 --cpu-ops 1800000 --vm 8 --vm-bytes 500M --timeout 60s --metrics-brief', { shell: true });
    res.send('Max stress-ng, started for 60 seconds');
});

// ensure stress-ng is installed
spawnSync('apt update && apt install -y stress-ng', { shell: true });

app.listen(process.env.PORT || 80, () => {
    console.log('Server listening on port 3001!');
});
