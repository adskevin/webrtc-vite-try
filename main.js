import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAPVZKKc4H1zACexxcZDzgmbEI74VxYgNA",
  authDomain: "watch-party-3ac5d.firebaseapp.com",
  databaseURL: "https://watch-party-3ac5d-default-rtdb.firebaseio.com",
  projectId: "watch-party-3ac5d",
  storageBucket: "watch-party-3ac5d.appspot.com",
  messagingSenderId: "922059772135",
  appId: "1:922059772135:web:27199c96392ecb4d665242",
  measurementId: "G-Q6H0JVBLB1"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const selectMediaButton = document.getElementById('selectMediaButton');
const previewVideo = document.getElementById('previewVideo');
const createStreamButton = document.getElementById('createStreamButton');
const sessionInput = document.getElementById('sessionInput');
const joinButton = document.getElementById('joinButton');
const endButton = document.getElementById('endButton');

// 1. Setup media sources

selectMediaButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: {
      width: { min: 1280 },
      height: { min: 720 }
    }
  });
  console.log(localStream);

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    console.log(track.getSettings());
    pc.addTrack(track, localStream);
  });

  previewVideo.srcObject = localStream;

  createStreamButton.disabled = false;
  joinButton.disabled = true;
  selectMediaButton.disabled = true;
};

// 2. Create an offer
createStreamButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const sessionDoc = firestore.collection('calls').doc();
  const offerCandidates = sessionDoc.collection('offerCandidates');
  const answerCandidates = sessionDoc.collection('answerCandidates');

  sessionInput.value = sessionDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await sessionDoc.set({ offer });

  // Listen for remote answer
  sessionDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  endButton.disabled = false;
};

// 3. Answer the call with the unique ID
joinButton.onclick = async () => {
  const sessionInputId = sessionInput.value;
  const sessionDoc = firestore.collection('calls').doc(sessionInputId);
  const answerCandidates = sessionDoc.collection('answerCandidates');
  const offerCandidates = sessionDoc.collection('offerCandidates');

  remoteStream = new MediaStream();

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  previewVideo.srcObject = remoteStream;

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const sessionData = (await sessionDoc.get()).data();

  const offerDescription = sessionData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await sessionDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};
