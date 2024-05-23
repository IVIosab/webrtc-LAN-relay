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
let conns = 0;

let mode = "normal";

let sockets = {};
let plannedConnections = {};
let establishedConnections = {};

let peerToOrder = {};

let idToInfo = {};

let leaders = {};

let ipToSize = {};

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

  console.debug(`[Server] Client ${socket.id} Connected`);

  console.debug("[Server] - Send - Client ID");
  socket.emit("clientID", {
    id: socket.id,
  });
}

io.sockets.on("connection", (socket) => {
  acceptNewClient(socket);

  socket.on("sendInformation", (config) =>
    handleSendInformation(socket, config)
  );

  socket.on("connectionEstablished", () => {
    let needed = (id - 1) * (id - 2);
    if (mode === "relay") {
      needed =
        Object.keys(ipToSize).length * (Object.keys(ipToSize).length - 1);
      for (let i = 0; i < Object.keys(ipToSize).length; i++) {
        needed +=
          ipToSize[Object.keys(ipToSize)[i]] *
          (ipToSize[Object.keys(ipToSize)[i]] - 1);
        needed +=
          (ipToSize[Object.keys(ipToSize)[i]] - 1) *
          (Object.keys(ipToSize).length - 1) *
          2;
      }
    }

    conns++;

    console.debug(`[Server] - Connection Established - ${conns}/${needed}`);

    if (mode === "relay" && conns === needed) {
      for (let i = 0; i < Object.keys(leaders).length; i++) {
        sockets[leaders[Object.keys(leaders)[i]]].emit("relay");
      }
    }
  });

  setInterval(() => {
    // console.debug(`[Server] - Send - Information`);
    handleRequestInformation(socket);
  }, 1000);

  socket.on("relaySessionDescription", (config) =>
    handleSessionDescription(socket, config)
  );
  socket.on("relayICECandidate", (config) =>
    handleIceCandidate(socket, config)
  );

  socket.on("initiateRelay", () => handleInitiateRelay(socket));
});

function handleSendInformation(socket, config) {
  const { ip } = config;
  if (!(ip in leaders)) {
    leaders[ip] = socket.id;
  }
  if (!(ip in ipToSize)) {
    ipToSize[ip] = 1;
  } else {
    ipToSize[ip] += 1;
  }
  if (!(socket.id in idToInfo)) {
    let ids = Object.keys(idToInfo);
    for (let i = 0; i < ids.length; i++) {
      handleBiConnection(socket.id, ids[i]);
    }
    idToInfo[socket.id] = [socket.id, ip, leaders[ip] === socket.id];
  }
  connectPlanned();
}

function handleRequestInformation(socket) {
  socket.emit("information", {
    idToInfo: idToInfo,
  });
}

function connectPlanned() {
  let ids1 = Object.keys(plannedConnections);
  for (let i = 0; i < ids1.length; i++) {
    let ids2 = Object.keys(plannedConnections[ids1[i]]);
    for (let j = 0; j < ids2.length; j++) {
      if (
        plannedConnections[ids1[i]][ids2[j]] &&
        plannedConnections[ids2[j]][ids1[i]] &&
        establishedConnections[ids1[i]][ids2[j]] !== true &&
        establishedConnections[ids2[j]][ids1[i]] !== true
      ) {
        biConnect(ids1[i], ids2[j]);
        establishedConnections[ids1[i]][ids2[j]] = true;
        establishedConnections[ids2[j]][ids1[i]] = true;
        plannedConnections[ids1[i]][ids2[j]] = false;
        plannedConnections[ids2[j]][ids1[i]] = false;
      } else if (
        plannedConnections[ids1[i]][ids2[j]] &&
        establishedConnections[ids1[i]][ids2[j]] !== true
      ) {
        uniConnect(ids1[i], ids2[j]);
        establishedConnections[ids1[i]][ids2[j]] = true;
        plannedConnections[ids1[i]][ids2[j]] = false;
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

function handleBiConnection(id1, id2) {
  if (!plannedConnections[id1]) plannedConnections[id1] = {};
  if (!plannedConnections[id2]) plannedConnections[id2] = {};
  if (!establishedConnections[id1]) establishedConnections[id1] = {};
  if (!establishedConnections[id2]) establishedConnections[id2] = {};
  plannedConnections[id1][id2] = true;
  plannedConnections[id2][id1] = true;
}

function handleUniConnection(id1, id2) {
  if (!plannedConnections[id1]) plannedConnections[id1] = {};
  if (!plannedConnections[id2]) plannedConnections[id2] = {};
  if (!establishedConnections[id1]) establishedConnections[id1] = {};
  if (!establishedConnections[id2]) establishedConnections[id2] = {};
  plannedConnections[id1][id2] = true;
}

function handleSessionDescription(socket, config) {
  if (!socket || !config || !config.peer_id || !config.session_description) {
    console.group("Unexpected undefined");
    console.error("socket: ", socket);
    console.error("config: ", config);
    console.groupEnd();
  }
  const { peer_id, session_description } = config;

  if (peer_id in sockets) {
    sockets[peer_id].emit("sessionDescription", {
      peer_id: socket.id,
      session_description: session_description,
    });
  } else {
    console.group("Peer Not Found");
    console.error("peer_id: ", peer_id);
    console.groupEnd();
  }
}

function handleIceCandidate(socket, config) {
  if (!socket || !config || !config.peer_id || !config.ice_candidate) {
    console.group("Unexpected undefined");
    console.error("socket: ", socket);
    console.error("config: ", config);
    console.groupEnd();
  }

  const { peer_id, ice_candidate } = config;

  if (peer_id in sockets) {
    sockets[peer_id].emit("iceCandidate", {
      peer_id: socket.id,
      ice_candidate: ice_candidate,
    });
  }
}

function handleInitiateRelay(socket) {
  console.log(`[Server] - Initiate Relay`);
  mode = "relay";
  let ids = Object.keys(idToInfo);
  for (let i = 0; i < ids.length; i++) {
    let ip = idToInfo[ids[i]][1];
    for (let j = i + 1; j < ids.length; j++) {
      let ip2 = idToInfo[ids[j]][1];
      if (
        !(leaders[ip] === ids[i] && leaders[ip2] === ids[j]) &&
        !(ip === ip2)
      ) {
        if (establishedConnections[ids[i]][ids[j]] === true) {
          stopConnection(ids[i], ids[j]);
          stopConnection(ids[j], ids[i]);
        } else if (establishedConnections[ids[j]][ids[i]] === true) {
          stopConnection(ids[j], ids[i]);
          stopConnection(ids[i], ids[j]);
        }
      }
    }
  }
  connectPlanned();
}

function stopConnection(id1, id2) {
  conns--;
  sockets[id1].emit("stopConnection", {
    peer_id: id2,
  });
  establishedConnections[id1][id2] = false;
  if (leaders[idToInfo[id2][1]] === id2) {
    handleUniConnection(id1, id2);
  }
}
