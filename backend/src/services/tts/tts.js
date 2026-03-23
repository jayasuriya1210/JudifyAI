const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const AUDIO_DIR = path.resolve(__dirname, "../../../audio");
const PROJECT_ROOT = path.resolve(__dirname, "../../../../");

function resolveEnvPath(envValue, fallbackAbsolutePath) {
  if (!envValue) return fallbackAbsolutePath;
  return path.isAbsolute(envValue) ? envValue : path.resolve(process.cwd(), envValue);
}

const defaultPiperPath = path.resolve(PROJECT_ROOT, "backend/piper/piper.exe");
const defaultPiperModelPath = path.resolve(PROJECT_ROOT, "backend/models/en_US-amy-medium.onnx");

const PIPER_ENABLED = process.env.PIPER_ENABLED !== "false";
const PIPER_PATH = resolveEnvPath(process.env.PIPER_PATH, defaultPiperPath);
const PIPER_MODEL_PATH = resolveEnvPath(process.env.PIPER_MODEL_PATH, defaultPiperModelPath);
const PIPER_CONFIG_PATH = process.env.PIPER_CONFIG_PATH
  ? resolveEnvPath(process.env.PIPER_CONFIG_PATH, "")
  : `${PIPER_MODEL_PATH}.json`;
const PIPER_MAX_CHARS_PER_CHUNK = Number(process.env.PIPER_MAX_CHARS_PER_CHUNK || 380);
const PIPER_LENGTH_SCALE = String(process.env.PIPER_LENGTH_SCALE || "1.0");
const PIPER_NOISE_SCALE = String(process.env.PIPER_NOISE_SCALE || "0.667");
const PIPER_NOISE_W = String(process.env.PIPER_NOISE_W || "0.8");
const PIPER_RETRY_COUNT = Math.max(0, Number(process.env.PIPER_RETRY_COUNT || 1));
const TTS_MAX_INPUT_CHARS = Math.max(2000, Number(process.env.TTS_MAX_INPUT_CHARS || 26000));
const TTS_DYNAMIC_MIN_INPUT_CHARS = Math.max(2000, Number(process.env.TTS_DYNAMIC_MIN_INPUT_CHARS || 10000));
const TTS_DYNAMIC_MAX_INPUT_CHARS = Math.max(TTS_DYNAMIC_MIN_INPUT_CHARS, Number(process.env.TTS_DYNAMIC_MAX_INPUT_CHARS || 90000));
const TTS_DYNAMIC_CHARS_PER_WORD = Math.max(2, Number(process.env.TTS_DYNAMIC_CHARS_PER_WORD || 6.5));
const TTS_WORDS_PER_CHUNK = Math.max(80, Number(process.env.TTS_WORDS_PER_CHUNK || 140));
const TTS_MIN_CHUNKS = Math.max(1, Number(process.env.TTS_MIN_CHUNKS || 4));
const TTS_MAX_CHUNKS = Math.max(TTS_MIN_CHUNKS, Number(process.env.TTS_MAX_CHUNKS || 120));

const TTS_ALLOW_EDGE_FALLBACK = process.env.TTS_ALLOW_EDGE_FALLBACK === "true";
const EDGE_VOICE = process.env.TTS_EDGE_VOICE || "en-US-AriaNeural";
const EDGE_RATE = process.env.TTS_EDGE_RATE || "+10%";
const EDGE_PITCH = process.env.TTS_EDGE_PITCH || "default";
const EDGE_MAX_CHARS_PER_CHUNK = Number(process.env.EDGE_MAX_CHARS_PER_CHUNK || 900);

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[*_`#>-]/g, " ")
    .trim();
}

function clampForTTS(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const stop = Math.max(sliced.lastIndexOf("."), sliced.lastIndexOf("?"), sliced.lastIndexOf("!"));
  if (stop > Math.floor(maxChars * 0.6)) return sliced.slice(0, stop + 1);
  return sliced;
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function resolveMaxInputChars(sourceWordCount) {
  const words = Number(sourceWordCount || 0);
  if (!Number.isFinite(words) || words <= 0) {
    return TTS_MAX_INPUT_CHARS;
  }
  const targetChunks = Math.max(
    TTS_MIN_CHUNKS,
    Math.min(TTS_MAX_CHUNKS, Math.ceil(words / TTS_WORDS_PER_CHUNK))
  );
  const dynamic = Math.floor(targetChunks * PIPER_MAX_CHARS_PER_CHUNK);
  const wordBased = Math.floor(words * TTS_DYNAMIC_CHARS_PER_WORD);
  return Math.max(
    TTS_DYNAMIC_MIN_INPUT_CHARS,
    Math.min(TTS_DYNAMIC_MAX_INPUT_CHARS, Math.max(dynamic, wordBased))
  );
}

function splitIntoChunks(text, maxChars) {
  const clean = String(text || "").trim();
  if (!clean) return [];

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!sentences.length) return [clean.slice(0, maxChars)];

  const chunks = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      const words = sentence.split(/\s+/).filter(Boolean);
      let wordBuffer = "";
      for (const word of words) {
        if (!wordBuffer) {
          wordBuffer = word;
          continue;
        }
        if ((wordBuffer.length + word.length + 1) <= maxChars) {
          wordBuffer += ` ${word}`;
        } else {
          chunks.push(wordBuffer);
          wordBuffer = word;
        }
      }
      if (wordBuffer) chunks.push(wordBuffer);
      continue;
    }

    if (!buffer) {
      buffer = sentence;
      continue;
    }

    if ((buffer.length + sentence.length + 1) <= maxChars) {
      buffer += ` ${sentence}`;
    } else {
      chunks.push(buffer);
      buffer = sentence;
    }
  }

  if (buffer) chunks.push(buffer);
  return chunks;
}

async function mergeWavFiles(inputPaths, outputPath) {
  if (!inputPaths.length) throw new Error("No chunk files to merge");

  const wavBuffers = await Promise.all(inputPaths.map((filePath) => fs.promises.readFile(filePath)));
  if (!wavBuffers.length) throw new Error("Audio generation failed");
  if (wavBuffers.length === 1) {
    await fs.promises.copyFile(inputPaths[0], outputPath);
    return;
  }

  const first = wavBuffers[0];
  if (first.length < 44) throw new Error("Invalid WAV header in first chunk");

  const header = Buffer.from(first.subarray(0, 44));
  const pcmParts = wavBuffers.map((buf, idx) => {
    if (buf.length < 44) {
      throw new Error(`Invalid WAV chunk at index ${idx}`);
    }
    return buf.subarray(44);
  });
  const totalDataSize = pcmParts.reduce((sum, part) => sum + part.length, 0);
  header.writeUInt32LE(36 + totalDataSize, 4);
  header.writeUInt32LE(totalDataSize, 40);

  const merged = Buffer.concat([header, ...pcmParts]);
  await fs.promises.writeFile(outputPath, merged);
}

async function runPiperChunk(chunkText, outputFile) {
  const args = [
    "--model", PIPER_MODEL_PATH,
    "--output_file", outputFile,
    "--length_scale", PIPER_LENGTH_SCALE,
    "--noise_scale", PIPER_NOISE_SCALE,
    "--noise_w", PIPER_NOISE_W,
  ];

  if (PIPER_CONFIG_PATH && fs.existsSync(PIPER_CONFIG_PATH)) {
    args.push("--config", PIPER_CONFIG_PATH);
  }

  const executeOnce = () => new Promise((resolve, reject) => {
    const child = spawn(PIPER_PATH, args, {
      cwd: path.dirname(PIPER_PATH),
      stdio: ["pipe", "ignore", "pipe"],
      env: { ...process.env },
    });

    let stderr = "";

    child.stderr.on("data", (buf) => {
      stderr += String(buf || "");
    });
    child.on("error", (error) => reject(new Error(`Failed to start Piper: ${error.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Piper exited with code ${code}: ${stderr.trim()}`));
      }
      resolve();
    });

    child.stdin.write(`${chunkText}\n`);
    child.stdin.end();
  });

  let lastError;
  for (let attempt = 0; attempt <= PIPER_RETRY_COUNT; attempt += 1) {
    try {
      await executeOnce();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < PIPER_RETRY_COUNT) {
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    }
  }

  throw lastError || new Error("Piper chunk generation failed");
}

async function runPiperHealthCheck() {
  const tempOut = path.join(os.tmpdir(), `piper_health_${Date.now()}.wav`);
  try {
    await runPiperChunk("Health check", tempOut);
  } finally {
    fs.promises.unlink(tempOut).catch(() => {});
  }
}

async function generateWithPiper(text) {
  if (!PIPER_ENABLED) throw new Error("Piper disabled");
  if (!PIPER_PATH) throw new Error("Piper binary path is missing");
  if (!PIPER_MODEL_PATH) throw new Error("Piper model path is missing");
  if (!fs.existsSync(PIPER_PATH)) throw new Error(`Piper binary not found: ${PIPER_PATH}`);
  if (!fs.existsSync(PIPER_MODEL_PATH)) throw new Error(`Piper model not found: ${PIPER_MODEL_PATH}`);

  await fs.promises.mkdir(AUDIO_DIR, { recursive: true });

  const chunks = splitIntoChunks(text, PIPER_MAX_CHARS_PER_CHUNK);
  if (!chunks.length) throw new Error("No text for Piper generation");

  const baseStamp = Date.now();
  const mergedFileName = `tts_${baseStamp}.wav`;
  const mergedAbsolutePath = path.join(AUDIO_DIR, mergedFileName);
  const createdFiles = [];

  try {
    for (let i = 0; i < chunks.length; i += 1) {
      const fileName = `tts_${baseStamp}_${i + 1}.wav`;
      const absolutePath = path.join(AUDIO_DIR, fileName);
      await runPiperChunk(chunks[i], absolutePath);
      createdFiles.push(absolutePath);
    }
    await mergeWavFiles(createdFiles, mergedAbsolutePath);
  } catch (error) {
    await fs.promises.unlink(mergedAbsolutePath).catch(() => {});
    await Promise.all(createdFiles.map((file) => fs.promises.unlink(file).catch(() => {})));
    throw error;
  }
  await Promise.all(createdFiles.map((file) => fs.promises.unlink(file).catch(() => {})));

  const mergedUrl = `/audio/${mergedFileName}`;

  return {
    audioURL: mergedUrl,
    audioURLs: [mergedUrl],
    provider: "piper",
  };
}

async function generateWithEdge(text) {
  const { EdgeTTS } = require("node-edge-tts");

  await fs.promises.mkdir(AUDIO_DIR, { recursive: true });
  const chunks = splitIntoChunks(text, EDGE_MAX_CHARS_PER_CHUNK);
  if (!chunks.length) throw new Error("No text for Edge generation");

  const tts = new EdgeTTS({
    voice: EDGE_VOICE,
    lang: "en-US",
    outputFormat: "riff-24khz-16bit-mono-pcm",
    timeout: 10000,
    rate: EDGE_RATE,
    pitch: EDGE_PITCH,
    volume: "default",
  });

  const baseStamp = Date.now();
  const mergedFileName = `tts_${baseStamp}.wav`;
  const mergedAbsolutePath = path.join(AUDIO_DIR, mergedFileName);
  const createdFiles = [];

  try {
    for (let i = 0; i < chunks.length; i += 1) {
      const fileName = `tts_${baseStamp}_${i + 1}.wav`;
      const absolutePath = path.join(AUDIO_DIR, fileName);
      await tts.ttsPromise(chunks[i], absolutePath);
      createdFiles.push(absolutePath);
    }
    await mergeWavFiles(createdFiles, mergedAbsolutePath);
  } catch (error) {
    await fs.promises.unlink(mergedAbsolutePath).catch(() => {});
    await Promise.all(createdFiles.map((file) => fs.promises.unlink(file).catch(() => {})));
    throw error;
  }
  await Promise.all(createdFiles.map((file) => fs.promises.unlink(file).catch(() => {})));

  const mergedUrl = `/audio/${mergedFileName}`;

  return {
    audioURL: mergedUrl,
    audioURLs: [mergedUrl],
    provider: "edge-tts",
  };
}

async function getTTSHealth() {
  const health = {
    timestamp: new Date().toISOString(),
    piper: {
      enabled: PIPER_ENABLED,
      ready: false,
      checks: {
        binaryExists: Boolean(PIPER_PATH) && fs.existsSync(PIPER_PATH),
        modelExists: Boolean(PIPER_MODEL_PATH) && fs.existsSync(PIPER_MODEL_PATH),
        configExists: Boolean(PIPER_CONFIG_PATH) && fs.existsSync(PIPER_CONFIG_PATH),
      },
      error: "",
    },
    edge: {
      enabled: TTS_ALLOW_EDGE_FALLBACK,
      ready: TTS_ALLOW_EDGE_FALLBACK,
      error: TTS_ALLOW_EDGE_FALLBACK ? "" : "Edge fallback disabled",
    },
    googleFallbackEnabled: false,
  };

  if (PIPER_ENABLED) {
    const staticOk = health.piper.checks.binaryExists && health.piper.checks.modelExists;
    if (!staticOk) {
      health.piper.error = "Piper path checks failed";
    } else {
      try {
        await runPiperHealthCheck();
        health.piper.ready = true;
      } catch (error) {
        health.piper.error = error.message || "Piper healthcheck failed";
      }
    }
  } else {
    health.piper.error = "Piper disabled";
  }

  return health;
}

async function generateTTS(text, options = {}) {
  const clean = normalizeText(text);
  if (!clean) throw new Error("No text available to generate audio.");
  const sourceWordCount = Number(options.sourceWordCount || countWords(clean));
  const maxChars = resolveMaxInputChars(sourceWordCount);
  const safeText = clampForTTS(clean, maxChars);

  if (PIPER_ENABLED) {
    try {
      return await generateWithPiper(safeText);
    } catch (error) {
      if (!TTS_ALLOW_EDGE_FALLBACK) {
        throw new Error(`Piper TTS failed: ${error.message}`);
      }
    }
  }

  if (TTS_ALLOW_EDGE_FALLBACK) {
    return generateWithEdge(safeText);
  }

  throw new Error("TTS is unavailable. Enable Piper or edge fallback.");
}

module.exports = { generateTTS, getTTSHealth };
