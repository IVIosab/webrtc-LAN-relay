/**************/
/*** IMPORT ***/
/**************/
const express = require("express");
const https = require("https");
const fs = require("fs");
const socketIO = require("socket.io");

/**************/
/*** CONFIG ***/
/**************/
const PORT = 8080;
const CHANNEL = "global";
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

io.sockets.on("connection", (socket) => {
  sockets[socket.id] = socket;

  peerToOrder[socket.id] = `[node-${id}]`;

  if (id === 1) {
    firstNodeID = socket.id;
  }

  id++;

  logDebug("Connection accepted", ["Peer", peerToOrder[socket.id]]);

  socket.on("sendPeerIP", (config, callback) =>
    handlePeerIP(socket, config, callback)
  );
  socket.on("join", () => handleJoin(socket));
  socket.on("relaySessionDescription", (config) =>
    handleSessionDescription(socket, config)
  );
  socket.on("relayICECandidate", (config) =>
    handleIceCandidate(socket, config)
  );
  socket.on("disconnect", () => handleDisconnect(socket));
  socket.on("logIpInfo", () => logIpInfo(socket));
});

function handlePeerIP(socket, config, callback) {
  if (!socket || !config || !config.peer_ip)
    logError("Unexpected undefined", [
      "socket",
      socket,
      "config",
      config,
      "config.peer_ip",
      config.peer_ip,
    ]);

  let peerIP = config.peer_ip;

  let isLeader = updateIPs(socket.id, peerIP);

  if (!(socket.id in connections)) {
    connections[socket.id] = {};
  }

  socket.emit("sendIPInfo", {
    peerToIP: peerToIP,
  });

  if (isLeader) {
    logDebug("Leader declaration", [
      "peer",
      peerToOrder[socket.id],
      "IP",
      peerIP,
    ]);
    socket.emit("leader");
  }

  callback("Server finished processing IP");
}

function updateIPs(peer, IP) {
  if (!peer || !IP) logError("Unexpected undefined", ["peer", peer, "IP", IP]);

  peerToIP[peer] = IP;

  let isLeader = false;

  if (!(IP in ipToPeers)) {
    ipToPeers[IP] = [];
    isLeader = true;
  }
  if (!ipToPeers[IP].includes(peer)) ipToPeers[IP].push(peer);

  if (!ipToLeader[IP]) ipToLeader[IP] = peer;

  return isLeader;
}

function handleJoin(socket) {
  if (!socket || !peerToOrder[socket.id])
    logError("Unexpected undefined", [
      "socket",
      socket,
      "peerToOrder[socket.id]",
      peerToOrder[socket.id],
    ]);

  logDebug("Peer joined", ["peer", peerToOrder[socket.id], "Channel", CHANNEL]);

  connectLeaders();
  connectLANs();
}

function connectLeaders() {
  logDebug("Connecting Leaders", []);

  let leaders = extractLeaderIDs();
  connectList(leaders);
}

function extractLeaderIDs() {
  let leaderIDs = [];

  const IPs = Object.keys(ipToLeader);

  for (let i = 0; i < IPs.length; i++) {
    if (!leaderIDs.includes(ipToLeader[IPs[i]]))
      leaderIDs.push(ipToLeader[IPs[i]]);
  }

  return leaderIDs;
}

function connectList(peers) {
  if (peers.length <= 1) return;

  for (let i = 0; i < peers.length; i++) {
    for (let j = i + 1; j < peers.length; j++) {
      if (!isConnected(peers[i], peers[j]))
        createPeerConnection(peers[i], peers[j], true);
    }
  }
}

function isConnected(peer1, peer2) {
  if (!peer1 || !peer2)
    logError("Unexpected undefiend", ["peer1", peer1, "peer2", peer2]);

  if (!connections[peer1]) connections[peer1] = {};
  if (!connections[peer2]) connections[peer2] = {};

  return connections[peer1] && connections[peer1][peer2];
}
function createPeerConnection(peer1, peer2, shouldCreateOffer) {
  if (!peer1 || !peer2 || !shouldCreateOffer)
    logError("Unexpected undefined", [
      "peer1",
      peer1,
      "peer2",
      peer2,
      "shouldCreateOffer",
      shouldCreateOffer,
    ]);
  if (peer1 === peer2) {
    logWarning("Peer1 === Peer2", ["peer1", peer1, "peer2", peer2]);
    return;
  }

  connectPair(peer1, peer2, shouldCreateOffer);

  storeConnections(peer1, peer2);
}

function connectPair(peer1, peer2, shouldCreateOffer) {
  logDebug("Connecting pair of peers", [
    "peer1",
    peerToOrder[peer1],
    "peer2",
    peerToOrder[peer2],
  ]);

  sockets[peer1].emit("addPeer", {
    peer_id: peer2,
    should_create_offer: shouldCreateOffer,
    peer_ip: peerToIP[peer2],
  });
  sockets[peer2].emit("addPeer", {
    peer_id: peer1,
    should_create_offer: !shouldCreateOffer,
    peer_ip: peerToIP[peer1],
  });
}

function storeConnections(peer1, peer2) {
  if (!(peer1 in connections)) {
    connections[peer1] = {};
  }
  if (!(peer2 in connections)) {
    connections[peer2] = {};
  }
  connections[peer1][peer2] = true;
  connections[peer2][peer1] = true;
}

function connectLANs() {
  const IPs = Object.keys(ipToPeers);
  for (let i = 0; i < IPs.length; i++) {
    connectLANPeers(IPs[i]);
  }
}

function connectLANPeers(IP) {
  logDebug("Connecting peers within LAN", ["IP", IP]);

  connectList(ipToPeers[IP]);
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

  // logDebug("Relaying session description", [
  //   "From",
  //   peerToOrder[socket.id],
  //   "To",
  //   peerToOrder[peer_id],
  // ]);

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

  // logDebug("Relaying ICE candidate", [
  //   "From",
  //   peerToOrder[socket.id],
  //   "To",
  //   peerToOrder[peer_id],
  // ]);

  if (peer_id in sockets) {
    sockets[peer_id].emit("iceCandidate", {
      peer_id: socket.id,
      ice_candidate: ice_candidate,
    });
  }
}

function handleDisconnect(socket) {
  removePeerIP(socket);

  logDebug("Peer disconnection", ["Peer", peerToOrder[socket.id]]);

  delete sockets[socket.id];
}

function removePeerIP(socket) {
  const socketIP = peerToIP[socket.id];

  const peerIndex = ipToPeers[socketIP].indexOf(socket.id);
  if (peerIndex > -1) {
    ipToPeers[socketIP].splice(peerIndex, 1);
  }

  if (ipToPeers[socketIP].length === 0) {
    delete ipToPeers[socketIP];
    delete ipToLeader[socketIP];
  } else {
    if (ipToLeader[socketIP] === socket.id) {
      ipToLeader[socketIP] = ipToPeers[socketIP][0];
    }
  }

  delete peerToIP[socket.id];
}

/*************/
/*** UTILS ***/
/*************/

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
