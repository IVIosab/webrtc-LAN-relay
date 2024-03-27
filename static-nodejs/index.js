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
}

function handleClientID(config) {
  const { id } = config;
  myID = id;
}

function handleInformation(config) {
  idToInfo = config.idToInfo;
  console.log(idToInfo);
  createInfoCards(idToInfo);
}

async function setupLocalMedia() {
  if (localMediaStream) return;
  await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .then((stream) => {
      localMediaStream = stream;
      createStreamCard(stream);
    })
    .catch((err) => {
      logError(`Error getting local media {${err}}`, []);
    });
}

function createStreamCard(stream) {
  const container = document.getElementById("streamContainer");

  let StreamCard = document.createElement("div");
  StreamCard.classList.add("node-card"); // Add a class for potential styling

  let mediaElement = createMediaElement();
  attachMediaStream(mediaElement, stream);
  StreamCard.appendChild(mediaElement); // Append the media element to the StreamCard

  let idContent = document.createTextNode(`ID: ${myID}`);
  let ipContent = document.createTextNode(`IP: ${myIP}`);
  let netmaskContent = document.createTextNode(`Netmask: ${myNetMask}`);
  let leaderContent = document.createTextNode(`Leader: ${isLeader}`);

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
  console.log(`Uni-Connection for ID: ${id}`);
  // Implement the uni-connection logic here
}

function handleBiConnection(id) {
  console.log(`Bi-Connection for ID: ${id}`);
  // Implement the bi-connection logic here
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
