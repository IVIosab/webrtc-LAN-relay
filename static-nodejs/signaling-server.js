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
let plannedConnections = {};
let establishedConnections = {};

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

  socket.on("biConnect", handleBiConnection);
  socket.on("uniConnect", handleUniConnection);

  socket.on("relaySessionDescription", (config) =>
    handleSessionDescription(socket, config)
  );
  socket.on("relayICECandidate", (config) =>
    handleIceCandidate(socket, config)
  );
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

function handleStartSimulation() {
  connectPlanned();
}

function connectPlanned() {
  let ids1 = Object.keys(plannedConnections);
  for (let i = 0; i < ids1.length; i++) {
    let ids2 = Object.keys(plannedConnections[ids1[i]]);
    for (let j = 0; j < ids2.length; j++) {
      if (
        plannedConnections[ids1[i]][ids2[j]] &&
        plannedConnections[ids2[j]][ids1[i]]
      ) {
        biConnect(ids1[i], ids2[j]);
        establishedConnections[ids1[i]][ids2[j]] = true;
        establishedConnections[ids2[j]][ids1[i]] = true;
      } else if (plannedConnections[ids1[i]][ids2[j]]) {
        uniConnect(ids1[i], ids2[j]);
        establishedConnections[ids1[i]][ids2[j]] = true;
      }
    }
  }
}

function biConnect(id1, id2) {
  sockets[id1].emit("connectToPeer", {
    peer_id: id2,
    should_create_offer: true,
    bi_connection: true,
  });
  sockets[id2].emit("connectToPeer", {
    peer_id: id1,
    should_create_offer: false,
    bi_connection: true,
  });
}

function uniConnect(id1, id2) {
  sockets[id1].emit("connectToPeer", {
    peer_id: id2,
    should_create_offer: true,
    bi_connection: false,
  });
  sockets[id2].emit("connectToPeer", {
    peer_id: id1,
    should_create_offer: false,
    bi_connection: false,
  });
}

function handleStopSimulation() {}

function handleBiConnection(config) {
  const { id1, id2 } = config;
  if (!plannedConnections[id1]) plannedConnections[id1] = {};
  if (!plannedConnections[id2]) plannedConnections[id2] = {};
  if (!establishedConnections[id1]) establishedConnections[id1] = {};
  if (!establishedConnections[id2]) establishedConnections[id2] = {};
  plannedConnections[id1][id2] = true;
  plannedConnections[id2][id1] = true;
}

function handleUniConnection(config) {
  const { id1, id2 } = config;
  if (!plannedConnections[id1]) plannedConnections[id1] = {};
  if (!plannedConnections[id2]) plannedConnections[id2] = {};
  if (!establishedConnections[id1]) establishedConnections[id1] = {};
  if (!establishedConnections[id2]) establishedConnections[id2] = {};
  plannedConnections[id1][id2] = true;
}

function handleSessionDescription(socket, config) {
  if (!socket || !config || !config.peer_id || !config.session_description)
    logError("Unexpected undefined", [
      "socket",
      socket,
      "config",
      config,
      "config.peer_id",
      config.peer_id,
      "config.session_description",
      config.session_description,
    ]);

  const { peer_id, session_description } = config;

  if (peer_id in sockets) {
    sockets[peer_id].emit("sessionDescription", {
      peer_id: socket.id,
      session_description: session_description,
    });
  } else {
    logError("Peer not found", ["peer_id", peer_id]);
  }
}

function handleIceCandidate(socket, config) {
  if (!socket || !config || !config.peer_id || !config.ice_candidate)
    logError("Unexpected undefined", [
      "socket",
      socket,
      "config",
      config,
      "config.peer_id",
      config.peer_id,
      "config.ice_cadidate",
      config.ice_candidate,
    ]);

  const { peer_id, ice_candidate } = config;

  if (peer_id in sockets) {
    sockets[peer_id].emit("iceCandidate", {
      peer_id: socket.id,
      ice_candidate: ice_candidate,
    });
  }
}

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
