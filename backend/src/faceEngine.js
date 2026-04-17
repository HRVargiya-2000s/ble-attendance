/**
 * Face Recognition Engine using ONNX Runtime
 *
 * Uses OpenCV's YuNet (face detection) + SFace (face recognition) ONNX models.
 * - YuNet detects face bounding boxes in images
 * - SFace extracts 128-dim face embeddings
 * - Cosine similarity compares embeddings
 */

import ort from "onnxruntime-node";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Model paths
const YUNET_MODEL = path.join(__dirname, "..", "models", "yunet.onnx");
const SFACE_MODEL = path.join(__dirname, "..", "models", "sface.onnx");

// YuNet input size (model compiled for 640×640)
const YUNET_W = 640;
const YUNET_H = 640;

// SFace input size
const SFACE_W = 112;
const SFACE_H = 112;

let yunetSession = null;
let sfaceSession = null;
let engineReady = false;

// ─── Initialisation ───────────────────────────────────────────────────────────

async function initFaceEngine() {
  if (engineReady) return true;

  try {
    if (!fs.existsSync(YUNET_MODEL)) {
      console.error("[FaceEngine] YuNet model not found:", YUNET_MODEL);
      return false;
    }
    if (!fs.existsSync(SFACE_MODEL)) {
      console.error("[FaceEngine] SFace model not found:", SFACE_MODEL);
      return false;
    }

    console.log("[FaceEngine] Loading YuNet face detector...");
    yunetSession = await ort.InferenceSession.create(YUNET_MODEL, {
      executionProviders: ["cpu"],
      logSeverityLevel: 3,
    });
    console.log("[FaceEngine] YuNet loaded. Inputs:", yunetSession.inputNames, "Outputs:", yunetSession.outputNames);

    console.log("[FaceEngine] Loading SFace face recogniser...");
    sfaceSession = await ort.InferenceSession.create(SFACE_MODEL, {
      executionProviders: ["cpu"],
      logSeverityLevel: 3,
    });
    console.log("[FaceEngine] SFace loaded. Inputs:", sfaceSession.inputNames, "Outputs:", sfaceSession.outputNames);

    engineReady = true;
    console.log("[FaceEngine] ✓ Ready (YuNet + SFace)");
    return true;
  } catch (err) {
    console.error("[FaceEngine] Init failed:", err.message);
    return false;
  }
}

// ─── Image preprocessing ──────────────────────────────────────────────────────

/**
 * Decode image buffer → raw RGB float32 at a given size.
 * Returns { data: Float32Array (CHW, 0-255), width, height }
 */
async function imageToTensor(buf, w, h) {
  const { data, info } = await sharp(buf)
    .resize(w, h, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // data is HWC uint8; we need NCHW float32
  const floats = new Float32Array(3 * h * w);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        floats[c * h * w + y * w + x] = data[(y * w + x) * 3 + c];
      }
    }
  }
  return floats;
}

/**
 * Get the original image dimensions.
 */
async function getImageDims(buf) {
  const meta = await sharp(buf).metadata();
  return { width: meta.width, height: meta.height };
}

// ─── YuNet face detection ─────────────────────────────────────────────────────

/**
 * Detect faces in an image buffer using YuNet multi-scale output.
 *
 * YuNet outputs at strides 8, 16, 32:
 *   cls_{s}  [1, N, 1]  – classification score
 *   obj_{s}  [1, N, 1]  – objectness score
 *   bbox_{s} [1, N, 4]  – bounding-box offsets (cx, cy, w, h)
 *   kps_{s}  [1, N, 10] – 5 keypoints × 2
 *
 * Returns array of { x, y, w, h, confidence } in original-image coordinates.
 */
async function detectFaces(imageBuffer) {
  if (!yunetSession) throw new Error("YuNet not loaded");

  const { width: origW, height: origH } = await getImageDims(imageBuffer);
  const inputData = await imageToTensor(imageBuffer, YUNET_W, YUNET_H);

  const inputTensor = new ort.Tensor("float32", inputData, [1, 3, YUNET_H, YUNET_W]);
  const results = await yunetSession.run({ input: inputTensor });

  const faces = [];
  const strides = [8, 16, 32];

  for (const stride of strides) {
    const cls = results[`cls_${stride}`];
    const obj = results[`obj_${stride}`];
    const bbox = results[`bbox_${stride}`];

    if (!cls || !obj || !bbox) continue;

    const numAnchors = cls.dims[1]; // e.g. 6400, 1600, 400
    const fmW = YUNET_W / stride;
    const fmH = YUNET_H / stride;

    for (let i = 0; i < numAnchors; i++) {
      const score = cls.data[i] * obj.data[i]; // combined confidence
      if (score < 0.6) continue;

      // Grid position
      const row = Math.floor(i / fmW);
      const col = i % fmW;

      // Decode bbox: offset from grid cell
      const cx = (col + bbox.data[i * 4 + 0]) * stride;
      const cy = (row + bbox.data[i * 4 + 1]) * stride;
      const bw = Math.exp(bbox.data[i * 4 + 2]) * stride;
      const bh = Math.exp(bbox.data[i * 4 + 3]) * stride;

      // Convert from center to top-left, scale to original image
      const scaleX = origW / YUNET_W;
      const scaleY = origH / YUNET_H;

      faces.push({
        x: Math.max(0, Math.round((cx - bw / 2) * scaleX)),
        y: Math.max(0, Math.round((cy - bh / 2) * scaleY)),
        w: Math.round(bw * scaleX),
        h: Math.round(bh * scaleY),
        confidence: score,
      });
    }
  }

  // NMS – simple greedy non-maximum suppression
  faces.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  const used = new Set();
  for (let i = 0; i < faces.length; i++) {
    if (used.has(i)) continue;
    kept.push(faces[i]);
    for (let j = i + 1; j < faces.length; j++) {
      if (used.has(j)) continue;
      if (iou(faces[i], faces[j]) > 0.4) used.add(j);
    }
  }

  console.log(`[FaceEngine] YuNet detected ${kept.length} face(s)`);
  return kept;
}

/** Intersection-over-union for two {x,y,w,h} boxes */
function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

// ─── Face crop ────────────────────────────────────────────────────────────────

/**
 * Crop the face region from an image, with some padding.
 * Returns a Buffer of the cropped face image.
 */
async function cropFace(imageBuffer, face) {
  const { width, height } = await getImageDims(imageBuffer);

  // Add 20% padding around the face
  const pad = 0.2;
  const px = Math.round(face.w * pad);
  const py = Math.round(face.h * pad);

  const left = Math.max(0, face.x - px);
  const top = Math.max(0, face.y - py);
  const right = Math.min(width, face.x + face.w + px);
  const bottom = Math.min(height, face.y + face.h + py);

  return sharp(imageBuffer)
    .extract({ left, top, width: right - left, height: bottom - top })
    .toBuffer();
}

// ─── SFace embedding extraction ───────────────────────────────────────────────

/**
 * Extract a 128-dimensional face embedding from a face-cropped image buffer.
 */
async function extractEmbedding(faceImageBuffer) {
  if (!sfaceSession) throw new Error("SFace not loaded");

  const inputData = await imageToTensor(faceImageBuffer, SFACE_W, SFACE_H);
  const inputTensor = new ort.Tensor("float32", inputData, [1, 3, SFACE_H, SFACE_W]);

  const results = await sfaceSession.run({ data: inputTensor });
  const embedding = Array.from(results.fc1.data);

  // L2-normalise the embedding
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  return embedding.map((v) => v / norm);
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

// ─── High-level compare ──────────────────────────────────────────────────────

/**
 * Compare two face images end-to-end.
 *
 * 1. Detect faces with YuNet
 * 2. Crop the largest face from each image
 * 3. Extract SFace embeddings
 * 4. Compute cosine similarity
 *
 * Returns { success, similarity, message }
 */
async function compareFaces(capturedBuf, registeredBuf, threshold = 0.363) {
  // Identical buffers → instant match
  if (capturedBuf.equals(registeredBuf)) {
    return { success: true, similarity: 1.0, message: "Face verified (100.0% similarity) - Perfect match!" };
  }

  if (!engineReady) {
    return { success: false, similarity: 0, message: "Face recognition engine not ready" };
  }

  // 1. Detect faces
  let capturedFaces, registeredFaces;
  try {
    [capturedFaces, registeredFaces] = await Promise.all([
      detectFaces(capturedBuf),
      detectFaces(registeredBuf),
    ]);
  } catch (detectErr) {
    console.error("[FaceEngine] Detection error:", detectErr.message);
    // Fallback: treat entire image as face
    capturedFaces = [];
    registeredFaces = [];
  }

  // 2. Crop faces (or use full image if no face detected)
  let capturedFaceImg, registeredFaceImg;

  if (capturedFaces.length > 0) {
    capturedFaceImg = await cropFace(capturedBuf, capturedFaces[0]);
    console.log(`[FaceEngine] Captured: face at (${capturedFaces[0].x},${capturedFaces[0].y}) conf=${capturedFaces[0].confidence.toFixed(2)}`);
  } else {
    console.log("[FaceEngine] Captured: no face detected, using full image");
    capturedFaceImg = capturedBuf;
  }

  if (registeredFaces.length > 0) {
    registeredFaceImg = await cropFace(registeredBuf, registeredFaces[0]);
    console.log(`[FaceEngine] Registered: face at (${registeredFaces[0].x},${registeredFaces[0].y}) conf=${registeredFaces[0].confidence.toFixed(2)}`);
  } else {
    console.log("[FaceEngine] Registered: no face detected, using full image");
    registeredFaceImg = registeredBuf;
  }

  // 3. Extract embeddings
  const [capturedEmb, registeredEmb] = await Promise.all([
    extractEmbedding(capturedFaceImg),
    extractEmbedding(registeredFaceImg),
  ]);

  // 4. Cosine similarity
  const similarity = cosineSimilarity(capturedEmb, registeredEmb);
  const matched = similarity >= threshold;

  const message = matched
    ? `Face verified (${(similarity * 100).toFixed(1)}% similarity)`
    : `Face mismatch (${(similarity * 100).toFixed(1)}% similarity). This doesn't look like the registered face.`;

  console.log(`[FaceEngine] Similarity=${similarity.toFixed(4)} threshold=${threshold} matched=${matched}`);

  return { success: matched, similarity: parseFloat(similarity.toFixed(4)), message };
}

export { initFaceEngine, compareFaces, detectFaces, extractEmbedding, cosineSimilarity, engineReady };
