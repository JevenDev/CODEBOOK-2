// hand censorship (pixelation), face box, eye censorship (pixelation), blinking detection that spawns eyes around face
// uses ml5.js handpose and facemesh models
// uses p5.js for drawing and video capture
// inspiration from: @bonnie2.0.0 on instagram who did something similar in tough designer https://www.instagram.com/p/DD7D6Z6xP6H/

let video;
let handPose, hands = [];
let faceMesh, faces = [];

let spawnedEyes = [];
let blinkCooldown = 0;
let eyeCounter = 1;

const CONF_hand = 0.10;

// display size
const DISPLAY_MAX_WIDTH = 1080;
let CAM_WIDTH = 640;
let CAM_HEIGHT = 480;

// helpers for hand keypoints
const FINGERS = {
    index: { 
        PIP: 6, 
        TIP: 8 
        },
    middle: { 
        PIP: 10, 
        TIP: 12 
    },
    ring: { 
        PIP: 14, 
        TIP: 16 
    },
    pinky: { 
        PIP: 18, 
        TIP: 20 
    },
};

const WRIST = 0;

function preload() {
    handPose = ml5.handPose({ flipped: false });
    faceMesh = ml5.faceMesh({ flipped: false, maxFaces: 1 });
}

// p5.js setup
function setup() {

    // create empty stage wrapper first
    let parentDiv = select("#stage");
    if (!parentDiv) {
        parentDiv = createDiv();
        parentDiv.id("stage");
    }

    parentDiv.style("display", "inline-block");
    parentDiv.style("position", "relative");  // does not affect centering
    parentDiv.style("width", DISPLAY_MAX_WIDTH + "px"); // fixed width container

    // create video capture
    video = createCapture(VIDEO, () => {
        console.log("video ready"); // when camera starts streaming, metadata becomes available
    });

    video.hide();

    // wait for metadata before creating canvas
    video.elt.onloadedmetadata = () => {

        CAM_WIDTH = video.elt.videoWidth;
        CAM_HEIGHT = video.elt.videoHeight;

        // create canvas at the real size
        const cnv = createCanvas(CAM_WIDTH, CAM_HEIGHT);
        // attach canvas to stage
        cnv.parent(parentDiv);

        // scale canvas to fit display max width
        cnv.style("width", DISPLAY_MAX_WIDTH + "px");
        cnv.style("height", (DISPLAY_MAX_WIDTH * CAM_HEIGHT) / CAM_WIDTH + "px");

        // start detection after canvas exists
        handPose.detectStart(video, r => hands = r || []);
        faceMesh.detectStart(video, r => faces = r || []);

        textFont("Helvetica");
    };
}

// p5.js draw loop
function draw() {
    background(0);
    image(video, 0, 0, width, height);

    // HAND PIXELATION
    if (hands.length > 0) {
        for (let hand of hands) {
            if (hand.confidence > CONF_hand) {
                pixelateHand(hand.keypoints, 18);
            }
        }
    }

    let faceBox = null;

    // FACE BOX + EYES CENSOR + BLINK SPAWN
    if (faces.length > 0) {
    const f = faces[0];

    faceBox = getFaceBox(f);
    pixelateEyes(f); // censor eyes first

    const blinking = isBlinking(f);
    if (blinking && blinkCooldown <= 0) {

    setTimeout(() => {
        spawnEye(f, faceBox);
    }, 150); // slight delay before spawning eye to avoid catching mid-blink

    blinkCooldown = 20;
    }

    if (blinkCooldown > 0) blinkCooldown--;
    }

    // draw spawned eyes behind face box
    drawSpawnedEyes(faceBox);

    // draw face box on top of spawned eyes
    if (faces.length > 0) {
        drawFaceBox(faces[0]);
    }

    // ear debug for blink detection
    // if (window._EAR !== undefined) {
    //     fill(255);
    //     textSize(16);
    //     text("EAR: " + nf(window._EAR, 1, 3), 10, 20);
    // }

    // hand debug to show keypoints when 'D' is held
    if (keyIsDown(68)) drawHandDots();
}

// HAND PIXELATION
function pixelateHand(keypoints, px) {
    let minX = width, minY = height, maxX = 0, maxY = 0;

    // hand keypoints bounding box
    for (let kp of keypoints) {
        if (!kp) continue;
        minX = min(minX, kp.x);
        minY = min(minY, kp.y);
        maxX = max(maxX, kp.x);
        maxY = max(maxY, kp.y);
    }

    const pad = 20;
    minX = max(0, minX - pad);
    minY = max(0, minY - pad);
    maxX = min(width, maxX + pad);
    maxY = min(height, maxY + pad);

    const w = maxX - minX;
    const h = maxY - minY;

    if (w > 0 && h > 0) {
        const dw = ceil(w / px), dh = ceil(h / px);
        let small = createGraphics(dw, dh);
        small.noSmooth();
        small.image(video, 0, 0, dw, dh, minX, minY, w, h);

        push();
        noSmooth();
        image(small, minX, minY, w, h);
        pop();

        small.remove();
    }
}

// GET FACE BOX
function getFaceBox(face) {
    const mesh = face.scaledMesh || face.mesh || face.keypoints;
    if (!mesh) return null;

    const xs = mesh.map(p => p.x);
    const ys = mesh.map(p => p.y);

    let minX = min(xs) - 40;
    let minY = min(ys) - 40;
    let maxX = max(xs) + 40;
    let maxY = max(ys) + 40;

    minX = max(0, minX);
    minY = max(0, minY);
    maxX = min(width, maxX);
    maxY = min(height, maxY);

    return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
    };
}

// DRAW FACE BOX
function drawFaceBox(face) {
    const mesh = face.scaledMesh || face.mesh || face.keypoints;
    if (!mesh) return null;

    const xs = mesh.map(p => p.x);
    const ys = mesh.map(p => p.y);

    let minX = min(xs) - 40;
    let minY = min(ys) - 40;
    let maxX = max(xs) + 40;
    let maxY = max(ys) + 40;

    minX = max(0, minX);
    minY = max(0, minY);
    maxX = min(width, maxX);
    maxY = min(height, maxY);

    const box = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
    };

    // draw box
    noFill();
    stroke(255, 255, 0);
    strokeWeight(3);
    rect(box.x, box.y, box.w, box.h, 12);

    // label
    noStroke();
    fill(255, 255, 0);
    textSize(18);
    textStyle(BOLD);
    text("face detected: 001", box.x, box.y + box.h + 28);

    return box;
}

// EYE PIXELATION
function pixelateEyes(face, px = 15) {
    const mesh = face.scaledMesh || face.mesh || face.keypoints;
    if (!mesh) return;

    // https://archive-docs.ml5js.org/#/reference/facemesh
    // https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection#keypoint-diagram
    // eye landmarks from facemesh
    const leftEyeIdx = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173];
    const rightEyeIdx = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398];

    const leftPts = leftEyeIdx.map(i => mesh[i]);
    const rightPts = rightEyeIdx.map(i => mesh[i]);

    const all = leftPts.concat(rightPts);
    const xs = all.map(p => p.x);
    const ys = all.map(p => p.y);

    let minX = min(xs) - 20;
    let minY = min(ys) - 20;
    let maxX = max(xs) + 20;
    let maxY = max(ys) + 20;

    minX = max(0, minX);
    minY = max(0, minY);
    maxX = min(width, maxX);
    maxY = min(height, maxY);

    const w = maxX - minX;
    const h = maxY - minY;

    const dw = ceil(w / px), dh = ceil(h / px);

    let small = createGraphics(dw, dh);
    small.noSmooth();
    small.image(video, 0, 0, dw, dh, minX, minY, w, h);

    push();
    noSmooth();
    image(small, minX, minY, w, h);
    pop();

    small.remove();
}

// BLINK DETECTION
function isBlinking(face) {
    if (!face) return false;

    const mesh = face.scaledMesh || face.mesh || face.keypoints;
    if (!mesh) return false;

    // LEFT EYE
    const L_top = mesh[159];
    const L_bottom = mesh[145];
    const L_left = mesh[33];
    const L_right = mesh[133];

    // RIGHT EYE
    const R_top = mesh[386];
    const R_bottom = mesh[374];
    const R_left = mesh[263];
    const R_right = mesh[362];

    if (!L_top || !L_bottom || !L_left || !L_right ||
        !R_top || !R_bottom || !R_left || !R_right)
        return false;

    const leftEAR =
        dist(L_top.x, L_top.y, L_bottom.x, L_bottom.y) /
        dist(L_left.x, L_left.y, L_right.x, L_right.y);

    const rightEAR =
        dist(R_top.x, R_top.y, R_bottom.x, R_bottom.y) /
        dist(R_left.x, R_left.y, R_right.x, R_right.y);

    const EAR = (leftEAR + rightEAR) / 2;

    window._EAR = EAR;

    // threshold for blink detection
    return EAR < 0.26;
}

// SPAWN EYE
function spawnEye(face, faceBox) {
    if (!face || !faceBox) return;

    const mesh = face.scaledMesh || face.mesh || face.keypoints;

    const idx = random() < 0.5 ? [33, 133] : [263, 362];
    const p1 = xy(mesh[idx[0]]);
    const p2 = xy(mesh[idx[1]]);

    // eye spawn area
    let minX = min(p1.x, p2.x) - 20;
    let minY = min(p1.y, p2.y) - 20;
    let w = abs(p1.x - p2.x) + 40;
    let h = abs(p1.y - minY) + 40;

    // take a snapshot of the eye
    let g = createGraphics(w, h);
    g.image(video, 0, 0, w, h, minX, minY, w, h);

    // corner spawning radius and chance
    if (random() < 0.20) {
        const offset = 25;
        const jitter = 25;

        let corner = floor(random(4));
        let relX, relY;

        // top-left
        if (corner === 0) {
        relX = -w - offset + random(-jitter, jitter);
        relY = -h - offset + random(-jitter, jitter);
        }
        // top-right
        else if (corner === 1) {
        relX = faceBox.w + offset + random(-jitter, jitter);
        relY = -h - offset + random(-jitter, jitter);
        }
        else if (corner === 2) {
        // bottom-left
        relX = -w - offset + random(-jitter, jitter);
        relY = faceBox.h + offset + random(-jitter, jitter);
        }
        else {
        // bottom-right
        relX = faceBox.w + offset + random(-jitter, jitter);
        relY = faceBox.h + offset + random(-jitter, jitter);
        }

        spawnedEyes.push({
        img: g,
        relX: relX,
        relY: relY,
        w: w,
        h: h,
        id: nf(eyeCounter++, 3)
        });

        return;
    }

    // normal left, right, top, bottom spawning
    // 0 = left, 1 = right, 2 = top, 3 = bottom
    let zone = floor(random(4));
    let relX, relY;

    const edgeOffset = 20;
    const edgeJitter = 30;

    if (zone === 0) {
        relX = -w - edgeOffset;
        relY = random(-edgeJitter, faceBox.h + edgeJitter);
    }
    else if (zone === 1) {
        relX = faceBox.w + edgeOffset;
        relY = random(-edgeJitter, faceBox.h + edgeJitter);
    }
    else if (zone === 2) {
        relX = random(-edgeJitter, faceBox.w + edgeJitter);
        relY = -h - edgeOffset;
    }
    else {
        relX = random(-edgeJitter, faceBox.w + edgeJitter);
        relY = faceBox.h + edgeOffset;
    }

    spawnedEyes.push({
        img: g,
        relX: relX,
        relY: relY,
        w: w,
        h: h,
        id: nf(eyeCounter++, 3)
    });
}

// DRAW SPAWNED EYES
function drawSpawnedEyes(faceBox) {
    if (!faceBox) return;

    for (let e of spawnedEyes) {
        let drawX = faceBox.x + e.relX;
        let drawY = faceBox.y + e.relY;

        // draw the eye
        image(e.img, drawX, drawY, e.w, e.h);

        // draw yellow border around eye
        push();
        noFill();
        stroke(255, 255, 0);
        strokeWeight(3);
        rect(drawX, drawY, e.w, e.h, 6);
        pop();

        // add a label above eye
        push();
        textAlign(CENTER, CENTER);
        textSize(16);
        stroke(255, 255, 0);
        strokeWeight(3);
        fill(0);
        text(e.id, drawX + e.w / 2, drawY - 14);
        pop();
    }
}

// debug hand keypoints
function drawHandDots() {
    noStroke();
    for (let h of hands) {
        if (h.confidence < CONF_hand) continue;
        fill(h.handedness === "Left" ? color(255, 0, 255) : color(255, 255, 0));
        for (let kp of h.keypoints) circle(kp.x, kp.y, 8);
    }
}

function xy(p) {
    if (!p) return null;
    if (Array.isArray(p)) return { x: p[0], y: p[1] };
    return { x: p.x, y: p.y };
}