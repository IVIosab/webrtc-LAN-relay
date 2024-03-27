const PORT = 8080;

/**************/
/*** IMPORT ***/
/**************/
const express = require("express");
const https = require("https");
const fs = require("fs");
const socketIO = require("socket.io");
const credentials = {
  key: fs.readFileSync("ssl/server-key.pem", "utf8"),
  cert: fs.readFileSync("ssl/server-cert.pem", "utf8"),
};

/*************/
/*** SETUP ***/
/*************/
const app = express();
app.use(express.static(__dirname));
const server = https.createServer(credentials, app);
const io = socketIO.listen(server);

/***************/
/*** STORAGE ***/
/***************/
let id = 1;
let firstNodeID = "";

let sockets = {};
let connections = {};

let peerToOrder = {};
let peerToIP = {};

let ipToPeers = {}; // key: IP, value: list of peers with that IP
let ipToLeader = {}; // key: IP, value: the elected leader of the IP group

let idToInfo = {};

/**************/
/*** SERVER ***/
/**************/
server.listen(PORT, () =>
  console.log(
    `Listening on port ${PORT}
    Execute the following command in another terminal:
    \tngrok http https://127.0.0.1:${PORT}`
  )
);

function acceptNewClient(socket) {
  sockets[socket.id] = socket;
  peerToOrder[socket.id] = `[node-${id}]`;
  id++;

  logDebug("Connection accepted", [
    "ID",
    socket.id,
    "Peer",
    peerToOrder[socket.id],
  ]);

  socket.emit("clientID", {
    id: socket.id,
  });
}

io.sockets.on("connection", (socket) => {
  acceptNewClient(socket);

  socket.on("sendInformation", handleSendInformation);

  socket.on("requestInformation", () => handleRequestInformation(socket));
  socket.on("startSimulation", handleStartSimulation);
  socket.on("stopSimulation", handleStopSimulation);
});

function handleSendInformation(config) {
  const { id, ip, netmask, leader } = config;
  if (!(id in idToInfo)) {
    idToInfo[id] = [id, ip, netmask, leader];
  }
  console.log(idToInfo);
}

function handleRequestInformation(socket) {
  socket.emit("information", {
    idToInfo: idToInfo,
  });
}

function handleStartSimulation() {}

function handleStopSimulation() {}

/*************/
/*** UTILS ***/
/*************/

function logIpInfo(socket) {
  socket.emit("sendIPInfo", {
    peerToIP: peerToIP,
  });
  console.log("\n-------------------");
  const IPs = Object.keys(ipToPeers);
  for (let i = 0; i < IPs.length; i++) {
    console.log(`${IPs[i]}: `);
    for (let j = 0; j < ipToPeers[IPs[i]].length; j++) {
      console.log(`  #${j + 1}: ${peerToOrder[ipToPeers[IPs[i]][j]]}`);
    }
  }
  console.log("-------------------");
}

function logError(error, ...args) {
  console.group(`ERROR: ${error}`);
  for (let i = 0; i < args[0].length - 1; i = i + 2)
    console.error(`\t\t${args[0][i]}: ${args[0][i + 1]}`);
  console.groupEnd();
  throw new Error("Stopping execution...");
}

function logWarning(warning, ...args) {
  console.group(`WARNING: ${warning}`);
  for (let i = 0; i < args[0].length - 1; i = i + 2)
    console.warn(`\t\t${args[0][i]}: ${args[0][i + 1]}`);
  console.groupEnd();
}

function logDebug(debug, ...args) {
  console.group(`DEBUG: ${debug}`);
  for (let i = 0; i < args[0].length; i = i + 2)
    console.debug(`\t\t${args[0][i]}: ${args[0][i + 1]}`);
  console.groupEnd();
}
