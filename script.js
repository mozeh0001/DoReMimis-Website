
const API_BASE =
  "https://doremimis-api.magenmozeh1378.workers.dev";

const form = document.getElementById("beatmapForm");
const audioInput = document.getElementById("audio");
const bpmInput = document.getElementById("bpm");
const offsetInput = document.getElementById("offset");
const statusText = document.getElementById("status");
const generateBtn = document.getElementById("generateBtn");
const results = document.getElementById("results");

const loggedOut = document.getElementById("loggedOut");
const loggedIn = document.getElementById("loggedIn");
const githubUsername = document.getElementById("githubUsername");

const osuDownload = document.getElementById("osuDownload");
const csvDownload = document.getElementById("csvDownload");

const STATUS_INTERVAL_MS = 10000;
const MAX_STATUS_CHECKS = 360;
const STORAGE_KEY = "doremimis_latest_generation";

let activeGeneration = false;
let completedUploadId = null;
let cachedZipBlob = null;
let cachedZipUploadId = null;
let downloadInProgress = false;

// --------------------------------------------------
// DOWNLOAD BUTTONS
// --------------------------------------------------

const downloadBtn = document.createElement("button");
downloadBtn.type = "button";
downloadBtn.textContent = "Download Both Files (.zip)";
downloadBtn.hidden = true;

results.appendChild(downloadBtn);

function hideDownloads() {
  results.hidden = true;
  osuDownload.hidden = true;
  csvDownload.hidden = true;
  downloadBtn.hidden = true;

  completedUploadId = null;
  cachedZipBlob = null;
  cachedZipUploadId = null;
}

function showDownloads(uploadId) {
  completedUploadId = uploadId;

  results.hidden = false;
  osuDownload.hidden = false;
  csvDownload.hidden = false;
  downloadBtn.hidden = false;
}

function rememberGeneration(uploadId) {
  try {
    localStorage.setItem(STORAGE_KEY, uploadId);
  } catch (error) {
    console.warn("Could not save generation ID:", error);
  }
}

function getRememberedGeneration() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function forgetGeneration() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Browser storage may be unavailable.
  }
}

// Download the generated ZIP securely through Cloudflare.
async function fetchBeatmapZip(uploadId) {
  if (cachedZipBlob && cachedZipUploadId === uploadId) {
    return cachedZipBlob;
  }

  const response = await fetch(
    `${API_BASE}/api/download?uploadId=${encodeURIComponent(uploadId)}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    let message = `Download failed (HTTP ${response.status}).`;

    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // Keep HTTP error if response isn't JSON.
    }

    throw new Error(message);
  }

  const blob = await response.blob();

  if (blob.size < 4) {
    throw new Error("Downloaded ZIP is empty or invalid.");
  }

  const signature = new Uint8Array(
    await blob.slice(0, 4).arrayBuffer()
  );

  if (
    signature[0] !== 0x50 ||
    signature[1] !== 0x4b ||
    signature[2] !== 0x03 ||
    signature[3] !== 0x04
  ) {
    throw new Error("Server did not return a valid ZIP archive.");
  }

  cachedZipBlob = blob;
  cachedZipUploadId = uploadId;

  return blob;
}

// Trigger a browser download from a Blob.
function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 60000);
}

// Extract an individual file from the ZIP using JSZip.
async function extractBeatmapFile(zipBlob, extension) {
  if (typeof JSZip === "undefined") {
    throw new Error(
      "ZIP extraction library failed to load. Please refresh the page."
    );
  }

  const zip = await JSZip.loadAsync(zipBlob);

  const matchingFiles = Object.values(zip.files).filter(file =>
    !file.dir &&
    file.name.toLowerCase().endsWith(extension)
  );

  if (matchingFiles.length === 0) {
    throw new Error(
      `No ${extension} file was found in the generated ZIP.`
    );
  }

  if (matchingFiles.length > 1) {
    throw new Error(
      `Multiple ${extension} files were found. Download the ZIP instead.`
    );
  }

  const file = matchingFiles[0];

  return {
    blob: await file.async("blob"),
    filename: file.name.split("/").pop()
  };
}

// Prevent overlapping downloads.
async function handleDownload(downloadType) {
  if (!completedUploadId || downloadInProgress) {
    return;
  }

  downloadInProgress = true;

  osuDownload.style.pointerEvents = "none";
  csvDownload.style.pointerEvents = "none";
  downloadBtn.disabled = true;

  try {
    statusText.textContent = "Preparing your download...";

    const zipBlob = await fetchBeatmapZip(completedUploadId);

    if (downloadType === "zip") {
      saveBlob(
        zipBlob,
        `DoReMimis-${completedUploadId.slice(0, 8)}.zip`
      );
    } else {
      const file = await extractBeatmapFile(
        zipBlob,
        downloadType
      );

      saveBlob(file.blob, file.filename);
    }

    statusText.textContent = "Your beatmap download has started!";

  } catch (error) {
    statusText.textContent =
      "Download failed: " + error.message;

  } finally {
    downloadInProgress = false;
    osuDownload.style.pointerEvents = "";
    csvDownload.style.pointerEvents = "";
    downloadBtn.disabled = false;
  }
}

osuDownload.addEventListener("click", event => {
  event.preventDefault();
  handleDownload(".osu");
});

csvDownload.addEventListener("click", event => {
  event.preventDefault();
  handleDownload(".csv");
});

downloadBtn.addEventListener("click", () => {
  handleDownload("zip");
});


// github login

async function checkGitHubLogin() {
  try {
    const response = await fetch(`${API_BASE}/api/me`, {
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error("Unable to check GitHub login.");
    }

    const data = await response.json();

    if (data.authenticated) {
      loggedOut.hidden = true;
      loggedIn.hidden = false;
      githubUsername.textContent = data.login;

      statusText.textContent =
        `Welcome, ${data.login}! Checking your latest beatmap...`;

      await restoreGeneration();

    } else {
      loggedOut.hidden = false;
      loggedIn.hidden = true;
      githubUsername.textContent = "";

      hideDownloads();

      statusText.textContent =
        "Please sign in with GitHub to get started.";
    }

  } catch (error) {
    loggedOut.hidden = false;
    loggedIn.hidden = true;
    githubUsername.textContent = "";

    hideDownloads();

    statusText.textContent =
      "Could not check GitHub login: " + error.message;
  }
}

// restore previous generation

async function restoreGeneration() {
  const uploadId = getRememberedGeneration();

  if (!uploadId) {
    if (!activeGeneration) {
      statusText.textContent =
        "Select a song to generate your first beatmap.";
    }
    return;
  }

  if (!/^[0-9a-f]{64}$/.test(uploadId)) {
    forgetGeneration();
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/status?uploadId=${encodeURIComponent(uploadId)}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      if (response.status === 404 || response.status === 403) {
        forgetGeneration();
        hideDownloads();

        if (!activeGeneration) {
          statusText.textContent =
            "Your previous beatmap is no longer available. " +
            "You can generate a new one.";
        }
        return;
      }

      throw new Error(`Status check failed (${response.status}).`);
    }

    const data = await response.json();

    if (activeGeneration) return;

    if (data.status === "completed") {
      showDownloads(uploadId);

      statusText.textContent =
        "Your previous beatmap is ready! " +
        "Choose .osu, .csv, or .zip to download.";

    } else if (
      data.status === "queued" ||
      data.status === "generating"
    ) {
      statusText.textContent =
        "Your previous beatmap is still generating. " +
        "Resuming progress tracking...";

      activeGeneration = true;
      generateBtn.disabled = true;

      try {
        await monitorGeneration(uploadId);
      } finally {
        activeGeneration = false;
        generateBtn.disabled = false;
      }

    } else if (data.status === "failed") {
      forgetGeneration();

      statusText.textContent =
        "Your previous beatmap generation failed. " +
        "You can try again.";

    } else {
      statusText.textContent =
        "Unable to determine your previous beatmap status.";
    }

  } catch (error) {
    if (!activeGeneration) {
      statusText.textContent =
        "Could not restore your previous beatmap: " +
        error.message;
    }
  }
}

// generation status tracking

function wait(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

async function monitorGeneration(uploadId) {
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < MAX_STATUS_CHECKS; attempt++) {
    await wait(STATUS_INTERVAL_MS);

    try {
      const response = await fetch(
        `${API_BASE}/api/status?uploadId=${encodeURIComponent(uploadId)}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            "Your GitHub login session expired. Please sign in again."
          );
        }

        if (response.status === 403) {
          throw new Error(
            "You are not authorized to check this generation."
          );
        }

        if (response.status === 404) {
          forgetGeneration();
          throw new Error(
            "Your generation record has expired or was not found."
          );
        }

        if (response.status >= 500) {
          consecutiveErrors++;

          if (consecutiveErrors < 5) {
            statusText.textContent =
              "Status service temporarily unavailable. Retrying...";
            continue;
          }
        }

        throw new Error(
          data.error || "Unable to check generation status."
        );
      }

      consecutiveErrors = 0;

      switch (data.status) {
        case "queued":
          statusText.textContent =
            "Beatmap queued! Waiting for GitHub Actions...";
          break;

        case "generating":
          statusText.textContent =
            "Generating your beatmap with MERT + DDPM...";
          break;

        case "completed":
          showDownloads(uploadId);

          statusText.textContent =
            "Beatmap generation completed! " +
            "Choose your preferred download format.";

          console.log(
            "Completed GitHub Actions run:",
            data.runId
          );
          return;

        case "failed":
          forgetGeneration();

          statusText.textContent =
            "Beatmap generation failed. Check GitHub Actions logs.";
          return;

        default:
          statusText.textContent =
            "Checking beatmap generation status...";
      }

    } catch (error) {
      if (
        error.message.includes("login session expired") ||
        error.message.includes("not authorized") ||
        error.message.includes("generation record has expired")
      ) {
        throw error;
      }

      consecutiveErrors++;

      if (consecutiveErrors >= 5) {
        throw new Error(
          "Unable to check generation status: " +
          error.message
        );
      }

      statusText.textContent =
        "Connection interrupted. Retrying status check...";
    }
  }

  throw new Error(
    "Status monitoring timed out. " +
    "Check GitHub Actions for the latest result."
  );
}

// audio upload and AI generation

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (activeGeneration) {
    return;
  }

  hideDownloads();

  const audioFile = audioInput.files[0];
  const bpm = Number(bpmInput.value);
  const offset = Number(offsetInput.value);

  if (!audioFile) {
    statusText.textContent = "Please upload a song.";
    return;
  }

  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) {
    statusText.textContent =
      "Please enter a BPM between 30 and 300.";
    return;
  }

  if (!Number.isFinite(offset) || Math.abs(offset) > 600000) {
    statusText.textContent = "Please enter a valid offset.";
    return;
  }

  const MAX_FILE_SIZE = 2 * 1024 * 1024;

  if (
    audioFile.size === 0 ||
    audioFile.size > MAX_FILE_SIZE
  ) {
    statusText.textContent =
      "Please select an MP3 or WAV smaller than 2 MB.";
    return;
  }

  activeGeneration = true;
  generateBtn.disabled = true;

  let stage = "upload";

  try {
    // Step 1: Upload audio to Cloudflare.
    statusText.textContent =
      "Uploading your song to Cloudflare...";

    const formData = new FormData();
    formData.append("audio", audioFile);

    const uploadResponse = await fetch(
      `${API_BASE}/api/upload`,
      {
        method: "POST",
        credentials: "include",
        body: formData
      }
    );

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(
        uploadData.error || "Upload failed."
      );
    }

    if (!uploadData.uploadId) {
      throw new Error(
        "Cloudflare did not return an upload ID."
      );
    }

    // Step 2: Trigger GitHub Actions.
    stage = "generate";

    statusText.textContent =
      "Upload successful! Starting AI beatmap generation...";

    const generateResponse = await fetch(
      `${API_BASE}/api/generate`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          uploadId: uploadData.uploadId,
          bpm,
          offset
        })
      }
    );

    const generateData = await generateResponse.json();

    if (!generateResponse.ok) {
      throw new Error(
        generateData.error ||
        "Could not start AI beatmap generation."
      );
    }

    // Remember the generation only after GitHub accepts it.
    rememberGeneration(uploadData.uploadId);

    // Step 3: Monitor GitHub Actions.
    stage = "monitor";

    statusText.textContent =
      "AI generation started! Checking progress...";

    console.log("Beatmap generation requested:", {
      uploadId: uploadData.uploadId,
      filename: uploadData.filename,
      bpm,
      offset
    });

    await monitorGeneration(uploadData.uploadId);

  } catch (error) {
    const prefix =
      stage === "upload"
        ? "Upload failed: "
        : stage === "generate"
          ? "AI generation failed to start: "
          : "Generation status error: ";

    statusText.textContent =
      prefix + error.message;

  } finally {
    activeGeneration = false;
    generateBtn.disabled = false;
  }
});

// initialize website

hideDownloads();
checkGitHubLogin();
