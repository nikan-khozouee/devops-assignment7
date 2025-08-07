# DevOps Assignment 4
## Demo Screencast
You can find monitoring homework screencast [here](https://drive.google.com/file/d/1mkykgU0Bv9GGrhxbDYN-8ksQcsVZb2EU/view?usp=sharing).
## Setup Environment
### Setting Up Containers:
#### Server 1
In local terminal
```bash
docker run -dit --memory="1.0g" --cpus="1.0" --entrypoint sh --name server-01 --publish 4001:4001 --publish 5001:5001 node:alpine
docker exec -it server-01 sh
```
Then inide the container:
```bash
apk add git
apk add stress-ng

git clone https://github.com/nikan-khozouee/devops-assignment7
cd devops-assignment7
cd agent
npm install
cd ..
cd server
npm install

cd ..
npm run start-agent
npm run start-server
```

#### Server 2
In local terminal
```bash
docker run -dit --cap-add=NET_ADMIN --memory="1.0g" --cpus="1.0" --entrypoint sh --name server-02 --publish 4002:4001 --publish 5002:5001 node:alpine
docker exec -it server-02 sh
```
Then inide the container
```bash
apk add git
apk add stress-ng
# For choas testing
apk add iproute2 iptables coreutils

git clone https://github.com/nikan-khozouee/devops-assignment7
cd devops-assignment7
cd agent
npm install
cd ..
cd server
npm install

cd ..
npm run start-agent
npm run start-server
```
#### Server 3
In local terminal
```bash
docker run -dit --memory="1.0g" --cpus="1.0" --entrypoint sh --name server-03 --publish 4003:4001 --publish 5003:5001 node:alpine
docker exec -it server-03 sh
```
Then inide the container
```bash
apk add git
apk add stress-ng

git clone https://github.com/nikan-khozouee/devops-assignment7
cd devops-assignment7
cd agent
npm install
cd ..
cd server
npm install

cd ..
npm run start-agent
npm run start-server
```
### On the local machine
On the local machine, we will need to install the monitor dashboard. Let’s start by installing the dependencies and running monitor:

```bash
git clone https://github.com/nikan-khozouee/devops-assignment7
cd devops-assignment7
cd monitor
npm install
node index.js
```

Now you should be able to see a blank dashboard at http://localhost:3000.

## Questions
### discuss the results of the experiments and how your monitoring dashboard/metrics could help you detect the issues.
A lot of my opinions are disscussed in the screencast below. But, I think combination of these metrics can give you a good idea to identify the problem. For example if cpu usage and memory usage are not capped but your request per second has dropped, you can start your investigation with the network state. Latancy also can help in this example.

### Think about a scenario similar to the blue-green deployment’s proxy. Is your score accurate enough to decide when to failover when there is Chaos?
I think we need /health enpoints and deeper server checks to do an accurate automatic failover. For example (this was in the homework suggestions) 90th percentile latency could give us a better idea of the server response performance than a simple pinging time series. But for now and this simple setting, i think you can use memory and cpu usage, combined with the other factors like response time to activate failover. Even you can know for your application that how many requests per second your server can handle and if you monitor that the requests are exceeding that limit, you can do some kind of load balancing.