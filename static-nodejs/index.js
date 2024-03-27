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
let myNetMask = "";
let isLeader = false;

let peers = {};
let idToInfo;

/**************/
/*** CLIENT ***/
/**************/
document.addEventListener("DOMContentLoaded", () => {
  const submitButton = document.querySelector('button[type="button"]');
  submitButton.addEventListener("click", submitNetmask);

  const mediaButton = document.getElementById("Media");
  mediaButton.addEventListener("click", setupLocalMedia);

  const leaderButton = document.getElementById("Leader");
  leaderButton.addEventListener("click", declareLeader);

  const sendInfoButton = document.getElementById("SendInfo");
  sendInfoButton.addEventListener("click", sendInformation);

  const getInfoButton = document.getElementById("GetInfo");
  getInfoButton.addEventListener("click", getInformation);

  const startButton = document.querySelector('button[id="Start"]');
  startButton.addEventListener("click", startSimulation);

  const stopButton = document.getElementById("Stop");
  stopButton.addEventListener("click", stopSimulation);
});

function submitNetmask() {
  const inputElement = document.querySelector(".netmask-input");
  myNetMask = inputElement.value;
  removeElement("footer");
}

function declareLeader() {
  isLeader = true;
}

function getInformation() {
  signalingSocket.emit("requestInformation");
}

function startSimulation() {
  signalingSocket.emit("startSimulation");
}

function stopSimulation() {
  signalingSocket.emit("stopSimulation");
}

function sendInformation() {
  signalingSocket.emit("sendInformation", {
    ip: myIP,
    id: myID,
    netmask: myNetMask,
    leader: isLeader,
  });
}

async function init() {
  await getPeerIP();
  setupSignalingSocket();
}

function setupSignalingSocket() {
  signalingSocket = io(SIGNALING_SERVER);
  signalingSocket.on("connect", () => {
    console.log("Connected to signaling server");
  });
  signalingSocket.on("clientID", handleClientID);
  signalingSocket.on("information", handleInformation);

  signalingSocket.on("connectToPeer", connectToPeer);
  signalingSocket.on("sessionDescription", handleSessionDescription);
  signalingSocket.on("iceCandidate", handleIceCandidate);
}

function connectToPeer(config) {
  const { peer_id, should_create_offer } = config;
  if (peer_id in peers) return;

  let peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers[peer_id] = peerConnection;

  localMediaStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localMediaStream);
  });

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
  // .catch((err) => {
  //   logError(`Error getting local media {${err}}`, []);
  // });
}

function createStreamCard(id, stream) {
  let cardID = idToInfo[id][0];
  let cardIP = idToInfo[id][1];
  let cardNetmask = idToInfo[id][2];
  let cardIsLeader = idToInfo[id][3];

  const container = document.getElementById("streamContainer");

  let StreamCard = document.createElement("div");
  StreamCard.classList.add("node-card"); // Add a class for potential styling

  let mediaElement = createMediaElement();
  attachMediaStream(mediaElement, stream);
  StreamCard.appendChild(mediaElement); // Append the media element to the StreamCard

  let idContent = document.createTextNode(`ID: ${cardID}`);
  let ipContent = document.createTextNode(`IP: ${cardIP}`);
  let netmaskContent = document.createTextNode(`Netmask: ${cardNetmask}`);
  let leaderContent = document.createTextNode(`Leader: ${cardIsLeader}`);

  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(idContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(ipContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(netmaskContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(leaderContent);

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

  Object.entries(idToInfo).forEach(([key, [id, ip, netmask, leader]]) => {
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
    let netmaskText = document.createTextNode(`Netmask: ${netmask}`);
    let leaderText = document.createTextNode(`Leader: ${leader}`);

    // Append the text nodes to the card with line breaks
    [idText, ipText, netmaskText, leaderText].forEach((textNode) => {
      infoCard.appendChild(textNode);
      infoCard.appendChild(document.createElement("br"));
    });

    // Create the buttons
    let uniButton = document.createElement("button");
    uniButton.textContent = "Uni-Connection";
    uniButton.addEventListener("click", () => handleUniConnection(id));

    let biButton = document.createElement("button");
    biButton.textContent = "Bi-Connection";
    biButton.addEventListener("click", () => handleBiConnection(id));

    // Append buttons to the node card
    infoCard.appendChild(uniButton);
    infoCard.appendChild(biButton);

    // Append the node card to the container
    container.appendChild(infoCard);
  });
}

function handleUniConnection(id) {
  signalingSocket.emit("uniConnect", {
    id1: myID,
    id2: id,
  });
}

function handleBiConnection(id) {
  signalingSocket.emit("biConnect", {
    id1: myID,
    id2: id,
  });
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

function removeElement(classname) {
  const element = document.querySelector(`.${classname}`);
  element.remove();
}

init(); // Start the initialization process
