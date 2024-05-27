const SIGNALING_SERVER = `${location.protocol}//${location.hostname}${
  location.port ? `:${location.port}` : ""
}`;
const PORT = 8080;
const ICE_SERVERS = [{ url: "stun:stun.l.google.com:19302" }];

/***************/
/*** STORAGE ***/
/***************/
let RELAY = false;

let signalingSocket = null;

let localMediaStream = null;
let myID = "";
let myIP = "";

let peers = {};
let streams = {};
let idToInfo;

/**************/
/*** CLIENT ***/
/**************/
document.addEventListener("DOMContentLoaded", () => {
  init();

  let relayButton = document.getElementById("relay-button");
  relayButton.addEventListener("click", () => {
    relayButton.disabled = true;
    relayButton.classList.add("disabled");
    console.debug("[Client] - Send - Relay Request");
    signalingSocket.emit("initiateRelay");
  });
});

async function init() {
  console.debug(`[Client] Signaling server: ${SIGNALING_SERVER}`);
  console.debug("[Client] Setup Local Media");
  await setupLocalMedia();
  console.debug("[Client] Setup Peer IP");
  await getPeerIP();
  console.debug("[Client] Setup Signaling Socket");
  setupSignalingSocket();
}

function setupSignalingSocket() {
  signalingSocket = io(SIGNALING_SERVER);

  signalingSocket.on("connect", () => {
    console.debug("[Client] - Recieve - Socket Connection Confirmation");
  });

  signalingSocket.on("clientID", (config) => {
    console.debug("[Client] - Recieve - Client ID");
    handleClientID(config);
    console.debug(`[Client] - Send - IP(${myIP})`);
    signalingSocket.emit("sendInformation", {
      ip: myIP,
    });
  });

  signalingSocket.on("information", (config) => {
    // console.debug("[Client] - Recieve - Information");
    handleInformation(config);
  });

  signalingSocket.on("connectToPeer", (config) => {
    console.debug(
      `[Client] - Recieve - Start ${
        config.bi_connection ? "bi" : "uni"
      }-connection with ${config.peer_id}`
    );
    connectToPeer(config);
  });

  signalingSocket.on("stopConnection", (config) => {
    console.debug(
      `[Client] - Recieve - Stop Connection with ${config.peer_id}`
    );
    stopConnection(config);
  });

  signalingSocket.on("sessionDescription", (config) => {
    // console.debug("[Client] - Recieve - Session Description");
    handleSessionDescription(config);
  });

  signalingSocket.on("iceCandidate", (config) => {
    // console.debug("[Client] - Recieve - Ice Candidate");
    handleIceCandidate(config);
  });

  signalingSocket.on("relay", () => {
    console.debug("[Client] - Recieve - Relay request");
    handleRelay();
  });
}

function connectToPeer(config) {
  const { peer_id, should_create_offer, bi_connection } = config;
  if (peer_id in peers) return;

  let peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers[peer_id] = peerConnection;

  if (bi_connection || (!bi_connection && should_create_offer)) {
    localMediaStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localMediaStream);
    });
  }

  peerConnection.onnegotiationneeded = (event) => {
    if (RELAY) {
      handlePeerNegotiation(peer_id, peerConnection, true);
    } else {
      handlePeerNegotiation(peer_id, peerConnection, should_create_offer);
    }
  };

  peerConnection.onicecandidate = (event) => {
    handlePeerIceCandidate(peer_id, event.candidate);
  };

  peerConnection.ontrack = (event) => {
    handlePeerTrack(peer_id, event);
  };

  peerConnection.onconnectionstatechange = (event) => {
    if (event.target.connectionState === "connected") {
      signalingSocket.emit("connectionEstablished");
    }
  };
}

function handlePeerNegotiation(peer_id, peerConnection, shouldCreateOffer) {
  if (shouldCreateOffer) {
    createAndSendOffer(peer_id, peerConnection);
  }
}

function createAndSendOffer(peer_id, peerConnection) {
  peerConnection.createOffer().then((local_description) => {
    peerConnection.setLocalDescription(local_description).then(() => {
      signalingSocket.emit("relaySessionDescription", {
        peer_id,
        session_description: local_description,
      });
    });
  });
}

function handlePeerIceCandidate(peer_id, candidate) {
  if (candidate) {
    signalingSocket.emit("relayICECandidate", {
      peer_id,
      ice_candidate: candidate,
    });
  }
}

function handlePeerTrack(peer_id, event) {
  if (event.track.kind !== "video") return;
  createStreamCard(peer_id, "...", false, event.streams[0]);
}

function handleSessionDescription(config) {
  let peer_id = config.peer_id;
  let desc = new RTCSessionDescription(config.session_description);

  peers[peer_id].setRemoteDescription(desc).then(() => {
    if (desc.type == "offer") {
      peers[peer_id].createAnswer().then((local_description) => {
        peers[peer_id].setLocalDescription(local_description).then(() => {
          signalingSocket.emit("relaySessionDescription", {
            peer_id,
            session_description: local_description,
          });
        });
      });
    }
  });
}

function handleIceCandidate(config) {
  peers[config.peer_id].addIceCandidate(
    new RTCIceCandidate(config.ice_candidate)
  );
}

function stopConnection(config) {
  let peer_id = config.peer_id;
  if (peer_id in peers) {
    peers[peer_id].close();
    delete peers[peer_id];
    delete streams[peer_id];
    let streamCard = document.getElementById(`streamCard-${peer_id}`);
    streamCard.remove();
  }
}

function handleClientID(config) {
  const { id } = config;
  myID = id;
}

function handleInformation(config) {
  idToInfo = config.idToInfo;
  let ids = Object.keys(idToInfo);
  for (let i = 0; i < ids.length; i++) {
    if (idToInfo[ids[i]][0] == myID) {
      let streamCard = document.getElementById(`streamCard-`);
      if (streamCard) {
        streamCard.setAttribute("id", `streamCard-${ids[i]}`);
        let streamCardID = document.getElementById(`streamCard--id`);
        streamCardID.setAttribute("id", `streamCard-${ids[i]}-id`);
        streamCardID.innerText = idToInfo[ids[i]][0];
        let streamCardIP = document.getElementById(`streamCard--ip`);
        streamCardIP.setAttribute("id", `streamCard-${ids[i]}-ip`);
        streamCardIP.innerText = idToInfo[ids[i]][1];
        let streamCardIsLeader = document.getElementById(`streamCard--leader`);
        streamCardIsLeader.setAttribute("id", `streamCard-${ids[i]}-leader`);
        streamCardIsLeader.innerText = idToInfo[ids[i]][2];
      }
    } else {
      let streamCard = document.getElementById(`streamCard-${ids[i]}`);
      if (!streamCard) continue;
      let streamCardIP = document.getElementById(`streamCard-${ids[i]}-ip`);
      if (streamCardIP === idToInfo[ids[i]][1]) continue;
      else {
        streamCardIP.innerText = idToInfo[ids[i]][1];
      }
      let streamCardIsLeader = document.getElementById(
        `streamCard-${ids[i]}-leader`
      );
      if (streamCardIsLeader === idToInfo[ids[i]][2]) continue;
      else {
        streamCardIsLeader.innerText = idToInfo[ids[i]][2];
      }
    }
  }
}

function handleRelay() {
  let lanIDs = [];
  let ids = Object.keys(idToInfo);
  for (let i = 0; i < ids.length; i++) {
    let myLAN = myIP.split(".");
    myLAN = myLAN[0] + "." + myLAN[1] + "." + myLAN[2];
    let peerLAN = idToInfo[ids[i]][1].split(".");
    peerLAN = peerLAN[0] + "." + peerLAN[1] + "." + peerLAN[2];
    if (myLAN === peerLAN) {
      lanIDs.push(ids[i]);
    }
  }

  let streamsToRelay = [];
  let streamsIds = Object.keys(streams);
  for (let i = 0; i < streamsIds.length; i++) {
    let dec = true;
    for (let j = 0; j < lanIDs.length; j++) {
      if (streamsIds[i] !== lanIDs[j] && streamsIds[i] !== "") {
        continue;
      } else {
        dec = false;
      }
    }
    if (dec) {
      streamsToRelay.push(streams[streamsIds[i]]);
    }
  }

  RELAY = true;

  console.log(
    `relaying ${streamsToRelay.length} streams to ${lanIDs.length - 1} peers`
  );
  for (let i = 0; i < lanIDs.length; i++) {
    if (lanIDs[i] !== myID && lanIDs[i] !== "") {
      for (let j = 0; j < streamsToRelay.length; j++) {
        streamsToRelay[j].getTracks().forEach((track) => {
          peers[lanIDs[i]].addTrack(track, streamsToRelay[j]);
        });
      }
    }
  }
}

function setupLocalMedia() {
  if (localMediaStream) return;
  return new Promise((resolve, reject) => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        localMediaStream = stream;
        createStreamCard("", "", false, stream);
        resolve();
      });
  });
}

function createStreamCard(cardID, cardIP, cardIsLeader, stream) {
  streams[cardID] = stream;
  const container = document.getElementById("streamContainer");

  let StreamCard = document.createElement("div");
  StreamCard.classList.add("node-card"); // Add a class for potential styling
  StreamCard.setAttribute("id", `streamCard-${cardID}`);

  let mediaElement = createMediaElement();
  attachMediaStream(mediaElement, stream);
  StreamCard.appendChild(mediaElement); // Append the media element to the StreamCard

  let idContent = document.createElement("span");
  idContent.setAttribute("id", `streamCard-${cardID}-id`);
  idContent.innerHTML = `ID: ${cardID}`;
  let ipContent = document.createElement("span");
  ipContent.setAttribute("id", `streamCard-${cardID}-ip`);
  ipContent.innerHTML = `IP: ${cardIP}`;
  let leaderContent = document.createElement("span");
  leaderContent.setAttribute("id", `streamCard-${cardID}-leader`);
  leaderContent.innerHTML = `Leader: ${cardIsLeader}`;

  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(idContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(ipContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(leaderContent);
  StreamCard.appendChild(document.createElement("br"));

  container.appendChild(StreamCard); // Append the StreamCard to the body
}

function attachMediaStream(element, stream) {
  element.srcObject = stream;
}

function createMediaElement() {
  let mediaElement = document.createElement("video");
  mediaElement.autoplay = true;
  mediaElement.muted = true; // You might not want to mute if you want to hear the audio
  mediaElement.controls = true;
  return mediaElement;
}

function getPeerIP() {
  return new Promise((resolve, reject) => {
    let externalIP = "";
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.createDataChannel("");
    pc.createOffer().then((offer) => pc.setLocalDescription(offer));
    pc.onicecandidate = (ice) => {
      if (
        !ice ||
        !ice.candidate ||
        !ice.candidate.candidate ||
        externalIP !== ""
      ) {
        pc.close();
        myIP = externalIP;
        console.log("My IP: ", myIP);
        resolve(externalIP); // Resolve the promise here
        return;
      }
      let split = ice.candidate.candidate.split(" ");
      if (split[7] !== "host") {
        externalIP = split[4];
      }
    };
  });
}
