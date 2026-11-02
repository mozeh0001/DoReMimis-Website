
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

const STATUS_INTERVAL_MS = 10000;
const MAX_STATUS_CHECKS = 360;

let activeGeneration = false;

// Check whether the user is logged in with GitHub.
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

      if (!activeGeneration) {
        statusText.textContent =
          `Welcome, ${data.login}! Select a song to get started.`;
      }
    } else {
      loggedOut.hidden = false;
      loggedIn.hidden = true;
      githubUsername.textContent = "";

      if (!activeGeneration) {
        statusText.textContent =
          "Please sign in with GitHub to get started.";
      }
    }
  } catch (error) {
    loggedOut.hidden = false;
    loggedIn.hidden = true;
    githubUsername.textContent = "";

    if (!activeGeneration) {
      statusText.textContent =
        "Could not check GitHub login: " + error.message;
    }
  }
}

// Wait between GitHub Actions status checks.
function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// Monitor GitHub Actions until generation finishes.
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
          throw new Error(
            "Your temporary audio upload has expired or was not found."
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
            "Generating your beatmap with MERT + DDPM. " +
            "This usually takes a few minutes...";
          break;

        case "completed":
          statusText.textContent =
            "Beatmap generation completed successfully! " +
            "Download buttons will be connected next.";

          console.log("Completed GitHub Actions run:", data.runId);
          return;

        case "failed":
          statusText.textContent =
            "Beatmap generation failed. Check GitHub Actions logs.";
          return;

        default:
          statusText.textContent =
            "Checking beatmap generation status...";
      }
    } catch (error) {
      // Authentication and expired uploads require user action.
      if (
        error.message.includes("login session expired") ||
        error.message.includes("not authorized") ||
        error.message.includes("audio upload has expired")
      ) {
        throw error;
      }

      consecutiveErrors++;

      if (consecutiveErrors >= 5) {
        throw new Error(
          "Unable to check generation status: " + error.message
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

// Handle song uploads and automatically start AI generation.
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (activeGeneration) {
    return;
  }

  results.hidden = true;

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
    statusText.textContent =
      "Please enter a valid offset.";
    return;
  }

  const MAX_FILE_SIZE = 2 * 1024 * 1024;

  if (audioFile.size === 0 || audioFile.size > MAX_FILE_SIZE) {
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

    const uploadResponse = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      credentials: "include",
      body: formData
    });

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

    // Step 2: Automatically trigger GitHub Actions.
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
          bpm: bpm,
          offset: offset
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

    // Step 3: Monitor GitHub Actions progress.
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

// Check GitHub login when the page loads.
checkGitHubLogin();
