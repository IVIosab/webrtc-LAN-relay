const SIGNALING_SERVER = `${location.protocol}//${location.hostname}${
  location.port ? `:${location.port}` : ""
}`;
const CHANNEL = "global";
const PORT = 8080;
const ICE_SERVERS = [
  { url: "stun:stun.l.google.com:19302" },
  { url: "stun:stun1.l.google.com:19302" },
  { url: "stun:stun2.l.google.com:19302" },
  { url: "stun:stun3.l.google.com:19302" },
  { url: "stun:stun4.l.google.com:19302" },
  { url: "stun:stun.ekiga.net" },
  { url: "stun:stun.ideasip.com" },
  { url: "stun:stun.rixtelecom.se" },
  { url: "stun:stun.schlund.de" },
];

/***************/
/*** STORAGE ***/
/***************/
let signalingSocket = null;

let localMediaStream = null;
let myID = "";
let myIP = "";
let isLeader = false;

let peers = {};
let idToInfo;

/**************/
/*** CLIENT ***/
/**************/
document.addEventListener("DOMContentLoaded", () => {
  const leaderButton = document.getElementById("Leader");
  leaderButton.addEventListener("click", () => {
    console.group("Leader Click");
    declareLeader();
    console.groupEnd();
  });

  const sendInfoButton = document.getElementById("SendInfo");
  sendInfoButton.addEventListener("click", () => {
    console.group("Send Click");
    sendInformation();
    console.groupEnd();
    leaderButton.remove();
    sendInfoButton.remove();
  });

  const getInfoButton = document.getElementById("GetInfo");
  getInfoButton.addEventListener("click", () => {
    console.group("Get Click");
    getInformation();
    console.groupEnd();
    getInfoButton.remove();
  });

  // const mediaButton = document.getElementById("Media");
  // mediaButton.addEventListener("click", () => {
  //   console.group("Media Click");
  //   setupLocalMedia();
  //   console.groupEnd();
  //   mediaButton.remove();
  // });

  const startButton = document.querySelector('button[id="Start"]');
  startButton.addEventListener("click", () => {
    console.group("Start Click");
    startSimulation();
    console.groupEnd();
  });

  const stopButton = document.getElementById("Stop");
  stopButton.addEventListener("click", () => {
    console.group("Stop Click");
    stopSimulation();
    console.groupEnd();
  });
});

function declareLeader() {
  isLeader = true;
}

function startSimulation() {
  console.log("Emitting startSimulation...");
  signalingSocket.emit("startSimulation");
}

function stopSimulation() {
  console.log("Emitting stopSimulation...");
  signalingSocket.emit("stopSimulation");
}

function sendInformation() {
  console.log("Emitting sendInformation...", {
    ip: myIP,
    id: myID,
    leader: isLeader,
  });
  signalingSocket.emit("sendInformation", {
    ip: myIP,
    id: myID,
    leader: isLeader,
  });
}

function getInformation() {
  console.log("Emitting requestInfomration...");
  signalingSocket.emit("requestInformation");
}

async function init() {
  await getPeerIP();
  setupSignalingSocket();
  // setupLocalMedia();
}

function setupSignalingSocket() {
  signalingSocket = io(SIGNALING_SERVER);

  signalingSocket.on("connect", () => {
    console.group("connect Event!");
    console.log("Connected to signaling server");
    console.groupEnd();
  });

  signalingSocket.on("clientID", (config) => {
    console.group("clientID Event!");
    handleClientID(config);
    console.groupEnd();
  });

  signalingSocket.on("information", (config) => {
    console.group("information Event!");
    handleInformation(config);
    console.groupEnd();
  });

  signalingSocket.on("connectToPeer", (config) => {
    console.group("connectToPeer Event!");
    connectToPeer(config);
    console.groupEnd();
  });

  signalingSocket.on("sessionDescription", (config) => {
    console.group("sessionDescription Event!");
    handleSessionDescription(config);
    console.groupEnd();
  });

  signalingSocket.on("iceCandidate", (config) => {
    console.group("iceCandidate Event!");
    handleIceCandidate(config);
    console.groupEnd();
  });

  signalingSocket.on("starting", () => {
    console.group("Starting Event!");
    const infoCards = document.getElementById("infoContainer");
    const startButton = document.querySelector('button[id="Start"]');
    startButton.remove();
    infoCards.remove();
    console.groupEnd();
  });

  signalingSocket.on("stopping", () => {
    console.group("Stopping Event!");
    const stopButton = document.getElementById("Stop");
    stopButton.remove();
    console.groupEnd();
  });

  signalingSocket.on("biConnSecond", (config) => {
    console.group("biConnSecond Event!");
    const infoCard = document.getElementById(`node-${config.id}`);
    infoCard.remove();
    console.groupEnd();
  });

  signalingSocket.on("uniConnSecond", (config) => {
    console.group("uniConnSecond Event!");
    const biButt = document.getElementById(`node-${config.id}-biButton`);
    biButt.remove();
    console.groupEnd();
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
    handlePeerNegotiation(peer_id, peerConnection, should_create_offer);
  };

  peerConnection.onicecandidate = (event) => {
    handlePeerIceCandidate(peer_id, event.candidate);
  };

  peerConnection.ontrack = (event) => {
    handlePeerTrack(peer_id, event);
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
  createStreamCard(peer_id, event.streams[0]);
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

function handleClientID(config) {
  const { id } = config;
  myID = id;
}

function handleInformation(config) {
  setupLocalMedia();
  idToInfo = config.idToInfo;
  createInfoCards(idToInfo);
}

async function setupLocalMedia() {
  if (localMediaStream) return;
  await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .then((stream) => {
      localMediaStream = stream;
      createStreamCard(myID, stream);
    });
}

function createStreamCard(id, stream) {
  let cardID = idToInfo[id][0];
  let cardIP = idToInfo[id][1];
  let cardIsLeader = idToInfo[id][2];
  const container = document.getElementById("streamContainer");

  let StreamCard = document.createElement("div");
  StreamCard.classList.add("node-card"); // Add a class for potential styling

  let mediaElement = createMediaElement();
  attachMediaStream(mediaElement, stream);
  StreamCard.appendChild(mediaElement); // Append the media element to the StreamCard

  let idContent = document.createTextNode(`ID: ${cardID}`);
  let ipContent = document.createTextNode(`IP: ${cardIP}`);
  let leaderContent = document.createTextNode(`Leader: ${cardIsLeader}`);

  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(idContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(ipContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(leaderContent);
  StreamCard.appendChild(document.createElement("br"));

  if (id != myID) {
    let relayButton = document.createElement("button");
    relayButton.textContent = "Relay";
    relayButton.addEventListener("click", () => handleRelay(cardID, stream));

    StreamCard.appendChild(relayButton);
  }
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

function createInfoCards(idToInfo) {
  // Find the container where you want to append the nodes
  const container = document.getElementById("infoContainer");

  Object.entries(idToInfo).forEach(([key, [id, ip, leader]]) => {
    if (id === myID) {
      return;
    }
    // Create the node card
    let infoCard = document.createElement("div");
    infoCard.id = `node-${id}`;
    infoCard.classList.add("node-card");

    // Create the info text nodes
    let idText = document.createTextNode(`ID: ${id}`);
    let ipText = document.createTextNode(`IP: ${ip}`);
    let leaderText = document.createTextNode(`Leader: ${leader}`);

    // Append the text nodes to the card with line breaks
    [idText, ipText, leaderText].forEach((textNode) => {
      infoCard.appendChild(textNode);
      infoCard.appendChild(document.createElement("br"));
    });

    // Create the buttons
    let uniButton = document.createElement("button");
    uniButton.textContent = "Uni-Connection";
    uniButton.id = `node-${id}-uniButton`;
    uniButton.addEventListener("click", () => {
      console.group("Uni Click");
      handleUniConnection(id);
      let element = document.getElementById(`node-${id}`);
      element.remove();
      console.groupEnd();
    });

    let biButton = document.createElement("button");
    biButton.textContent = "Bi-Connection";
    biButton.id = `node-${id}-biButton`;
    biButton.addEventListener("click", () => {
      console.group("Bi Click");
      handleBiConnection(id);
      let element = document.getElementById(`node-${id}`);
      element.remove();
      console.groupEnd();
    });

    // Append buttons to the node card
    infoCard.appendChild(uniButton);
    infoCard.appendChild(biButton);

    // Append the node card to the container
    container.appendChild(infoCard);
  });
}

function handleUniConnection(id) {
  console.log("Emitting uniConnect...", { id1: myID, id2: id });
  signalingSocket.emit("uniConnect", {
    id1: myID,
    id2: id,
  });
}

function handleBiConnection(id) {
  console.log("Emitting biConnect...", { id1: myID, id2: id });
  signalingSocket.emit("biConnect", {
    id1: myID,
    id2: id,
  });
}

function handleRelay(id, stream) {
  let ids = Object.keys(idToInfo);

  for (let i = 0; i < ids.length; i++) {
    let info = idToInfo[ids[i]];
    if (info[1] == myIP && info[0] !== myID) {
      stream.getTracks().forEach((track) => {
        console.log(info);
        console.log(info[0]);
        console.log(peers);
        console.log(peers[info[0]]);
        console.log(peers[ids[i]]);
        peers[info[0]].addTrack(track, stream);
      });
    }
  }
}

/*************/
/*** UTILS ***/
/*************/

function getPeerIP() {
  return new Promise((resolve, reject) => {
    console.log("Getting Peer IP");
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
        resolve(externalIP); // Resolve the promise here
      }
      let split = ice.candidate.candidate.split(" ");
      if (split[7] !== "host") {
        externalIP = split[4];
      }
    };
  });
}

init(); // Start the initialization process
