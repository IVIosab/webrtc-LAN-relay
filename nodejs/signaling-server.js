/**************/
/*** IMPORT ***/
/**************/
const express = require("express");
const https = require("https");
const fs = require("fs");
const socketIO = require("socket.io");

/*************/
/*** FLAGS ***/
/*************/
const DEBUG = false;

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

  console.log(`${peerToOrder[socket.id]} connection accepted`);

  // socket.on("sendIPs", () => handleSendIPs());
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
  if (!socket || !config || !config.peer_ip) {
    if (DEBUG) {
      console.group(`Unexpected undefined:`);
      console.error(`\tsocket: ${socket}`);
      console.error(`\tconfig: ${config}`);
      console.error(`\tconfig.peer_ip: ${config.peer_ip}`);
      console.groupEnd();
    }
    return;
  }

  let peerIP = config.peer_ip;

  let isLeader = updateIPs(socket.id, peerIP);

  if (!(socket.id in connections)) {
    connections[socket.id] = {};
  }

  socket.emit("sendIPInfo", {
    peerToIP: peerToIP,
  });

  if (isLeader) {
    console.log(`${peerToOrder[socket.id]} is the Leader of "${peerIP}"`);
    socket.emit("leader");
  }

  callback("Server finished processing IP");
}

function handleJoin(socket) {
  if (!socket || !peerToOrder[socket.id]) {
    if (DEBUG) {
      console.group(`Unexpected undefined:`);
      console.error(`\tsocket: ${socket}`);
      console.error(`\tpeerToOrder[socket.id]: ${peerToOrder[socket.id]}`);
      console.groupEnd();
    }
    return;
  }

  console.log(`${peerToOrder[socket.id]} joined "${CHANNEL}" chat`);
  connectLeaders();
  connectLANs();
}

function createPeerConnection(peer1, peer2, shouldCreateOffer) {
  if (!peer1 || !peer2 || !shouldCreateOffer) {
    if (DEBUG) {
      console.group(`Unexpected undefined:`);
      console.error(`\tpeer1: ${peer1}`);
      console.error(`\tpeer2: ${peer2}`);
      console.error(`\tshouldCreateOffer: ${shouldCreateOffer}`);
      console.groupEnd();
    }
    return;
  }
  if (peer1 === peer2) {
    if (DEBUG) {
      console.group(`Unexpected peer1 = peer2:`);
      console.error(`\tpeer1: ${peer1}`);
      console.error(`\tpeer2: ${peer2}`);
      console.groupEnd();
    }
    return;
  }

  console.log(`Connecting ${peerToOrder[peer1]} with ${peerToOrder[peer2]}`);

  connectPair(peer1, peer2, shouldCreateOffer);

  storeConnections(peer1, peer2);
}

function connectPair(peer1, peer2, shouldCreateOffer) {
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

/**
 * Store that peer1 and peer2 are connected with eachother in the adjacency matrix
 */
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

function handleSessionDescription(socket, config) {
  if (!socket || !config || !config.peer_id || !config.session_description) {
    console.group("Unexpected undefined:");
    console.error(`\tsocket: ${socket}`);
    console.error(`\tconfig: ${config}`);
    console.error(`\tconfig.peer_id: ${config.peer_id}`);
    console.error(
      `\tconfig.session_description: ${config.session_description}`
    );
    console.groupEnd();
  }

  const { peer_id, session_description } = config;

  console.log(
    `${peerToOrder[socket.id]} relaying session description to ${
      peerToOrder[peer_id]
    }`
  );

  if (peer_id in sockets) {
    sockets[peer_id].emit("sessionDescription", {
      peer_id: socket.id,
      session_description: session_description,
    });
  } else {
    console.error(
      `${peerToOrder[peer_id]} was not found in current connected peers`
    );
  }
}

function handleIceCandidate(socket, config) {
  if (!socket || !config || !config.peer_id || !config.ice_candidate) {
    console.group("Unexpected undefined:");
    console.error(`\tsocket: ${socket}`);
    console.error(`\tconfig: ${config}`);
    console.error(`\tconfig.peer_id: ${config.peer_id}`);
    console.error(`\tconfig.ice_candidate: ${config.ice_candidate}`);
    console.groupEnd();
  }

  const { peer_id, ice_candidate } = config;

  // console.log(
  //   `${peerToOrder[socket.id]} relaying ICE candidate to ${
  //     peerToOrder[peer_id]
  //   }`
  // );

  if (peer_id in sockets) {
    sockets[peer_id].emit("iceCandidate", {
      peer_id: socket.id,
      ice_candidate: ice_candidate,
    });
  }

  // addPeerIP(socket, ice_candidate);
}

// function addPeerIP(socket, ice_candidate) {
//   let split = ice_candidate.candidate.split(" ");

//   if (!split || split.length === 0 || split[7] === "host") {
//     return;
//   }

//   let externalIP = split[4];

//   updateIPs(socket, externalIP);

//   connectLANPeers(externalIP);
// }

function updateIPs(peer, IP) {
  if (!peer || !IP) {
    console.group("Unexpected undefined:");
    console.error(`\tpeer: ${peer}`);
    console.error(`\tIP: ${IP}`);
    console.groupEnd();
  }

  peerToIP[peer] = IP;

  let isLeader = false;

  if (!(IP in ipToPeers)) {
    ipToPeers[IP] = [];
    isLeader = true;
  }
  if (!ipToPeers[IP].includes(peer)) {
    ipToPeers[IP].push(peer);
  }
  if (!ipToLeader[IP]) {
    ipToLeader[IP] = peer;
  }

  return isLeader;
}

function connectLANs() {
  const IPs = Object.keys(ipToPeers);
  for (let i = 0; i < IPs.length; i++) {
    connectLANPeers(IPs[i]);
  }
}

function connectLANPeers(IP) {
  console.log(`Connecting peers within ${IP}`);
  connectList(ipToPeers[IP]);
}

function connectLeaders() {
  console.log("Connecting Leaders");
  let leaders = extractLeaderIDs();
  connectList(leaders);
}

function connectList(peers) {
  if (peers.length <= 1) {
    return;
  }
  for (let i = 0; i < peers.length; i++) {
    for (let j = i + 1; j < peers.length; j++) {
      if (!isConnected(peers[i], peers[j])) {
        createPeerConnection(peers[i], peers[j], true);
      }
    }
  }
}

function extractLeaderIDs() {
  let leaderIDs = [];

  const IPs = Object.keys(ipToLeader);

  for (let i = 0; i < IPs.length; i++) {
    if (!leaderIDs.includes(ipToLeader[IPs[i]])) {
      leaderIDs.push(ipToLeader[IPs[i]]);
    }
  }

  return leaderIDs;
}

function isConnected(peer1, peer2) {
  if (!peer1 || !peer2) {
    console.group(`Unexpected undefined:`);
    console.error(`\tpeer1: ${peer1}`);
    console.error(`\tpeer2: ${peer2}`);
    console.groupEnd();
    return;
  }

  if (!connections[peer1]) {
    connections[peer1] = {};
  }
  if (!connections[peer2]) {
    connections[peer2] = {};
  }

  return connections[peer1] && connections[peer1][peer2];
}

function handleDisconnect(socket) {
  removePeerIP(socket);

  console.log(`${peerToOrder[socket.id]} disconnected`);
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
