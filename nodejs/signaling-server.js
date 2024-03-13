const express = require("express");
const https = require("https");
const fs = require("fs");
const socketIO = require("socket.io");

/**************/
/*** CONFIG ***/
/**************/
const PORT = 8080;
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
const CHANNEL = "global";
let id = 1;
let firstNodeID = "";

let sockets = {};
let connections = {};

let peerToOrder = {};
let peerToIP = {};

let ipToPeers = {}; // key: IP, value: list of peers with that IP
let ipToLeader = {}; // key: IP, value: the elected leader of the IP group

/***************/
/*** SERVER ***/
/***************/
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
  id++;

  console.log(`${peerToOrder[socket.id]} connection accepted`);

  socket.on("join", () => handleJoin(socket));
  socket.on("relaySessionDescription", (config) =>
    handleSessionDescription(socket, config)
  );
  socket.on("relayICECandidate", (config) =>
    handleIceCandidate(socket, config)
  );
  socket.on("disconnect", () => handleDisconnect(socket));
});

/**
 * Handles the "join" event.
 * - Check if it is the first node to connect to the meeting, which is needed to connect other nodes to it (TODO: find a workaround)
 * -
 */
function handleJoin(socket) {
  console.log(`${peerToOrder[socket.id]} joined "${CHANNEL}" chat`);

  if (firstNodeID === "") {
    firstNodeID = socket.id;
  } else if (socket.id !== firstNodeID) {
    createPeerConnection(socket.id, firstNodeID, true);
  }
}

function createPeerConnection(peer1, peer2, shouldCreateOffer) {
  if (peer1 === peer2) {
    return;
  }

  console.log(`Connecting ${peerToOrder[peer1]} with ${peerToOrder[peer2]}`);

  //Tell peer1 to add peer2
  sockets[peer1].emit("addPeer", {
    peer_id: peer2,
    should_create_offer: shouldCreateOffer,
  });

  //Tell peer2 to add peer1
  sockets[peer2].emit("addPeer", {
    peer_id: peer1,
    should_create_offer: !shouldCreateOffer,
  });

  storeConnections(peer1, peer2);
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

function handleSessionDescription(socket, config) {
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

  addPeerIP(socket, ice_candidate);
}

function addPeerIP(socket, ice_candidate) {
  const IPs = ice_candidate.candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/g);
  if (!IPs || IPs.length === 0) {
    return;
  }

  const socketIP = IPs[0];

  peerToIP[socket.id] = socketIP;

  if (!(socketIP in ipToPeers)) {
    ipToPeers[socketIP] = [];
  }
  if (!ipToPeers[socketIP].includes(socket.id)) {
    ipToPeers[socketIP].push(socket.id);
  }
  if (!ipToLeader[socketIP]) {
    ipToLeader[socketIP] = socket.id;
  }

  connectLANPeers(socketIP);
}

function connectLANPeers(IP) {
  if (ipToPeers[IP].length <= 1) {
    connectLeaders();
    return;
  }

  // console.log(`Connecting peers within ${IP}`);

  connectList(ipToPeers[IP]);
}

function connectLeaders() {
  // console.log("Connecting leader peers");

  let leaders = extractLeaders();

  connectList(leaders);
}

function connectList(peers) {
  for (let i = 0; i < peers.length; i++) {
    for (let j = 0; j < peers.length; j++) {
      if (i !== j && !isConnected(peers[i], peers[j])) {
        createPeerConnection(peers[i], peers[j], CHANNEL, true);
      }
    }
  }
}

function extractLeaders() {
  let leaders = [];

  const IPs = Object.keys(ipToLeader);

  for (let i = 0; i < IPs.length; i++) {
    leaders.push(ipToLeader[IPs[i]]);
  }

  return leaders;
}

function isConnected(peer1, peer2) {
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
