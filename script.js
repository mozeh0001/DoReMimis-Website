
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

      statusText.textContent =
        `Welcome, ${data.login}! Select a song to get started.`;
    } else {
      loggedOut.hidden = false;
      loggedIn.hidden = true;
      githubUsername.textContent = "";

      statusText.textContent =
        "Please sign in with GitHub to get started.";
    }
  } catch (error) {
    loggedOut.hidden = false;
    loggedIn.hidden = true;
    githubUsername.textContent = "";

    statusText.textContent =
      "Could not check GitHub login: " + error.message;
  }
}

// Handle song uploads and automatically start AI generation.
form.addEventListener("submit", async (event) => {
  event.preventDefault();

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
    statusText.textContent = "Please enter a valid offset.";
    return;
  }

  const MAX_FILE_SIZE = 2 * 1024 * 1024;

  if (audioFile.size === 0 || audioFile.size > MAX_FILE_SIZE) {
    statusText.textContent =
      "Please select an MP3 or WAV smaller than 2 MB.";
    return;
  }

  generateBtn.disabled = true;

  let uploadCompleted = false;

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
      throw new Error(uploadData.error || "Upload failed.");
    }

    if (!uploadData.uploadId) {
      throw new Error("Cloudflare did not return an upload ID.");
    }

    uploadCompleted = true;

    // Step 2: Automatically trigger GitHub Actions.
    statusText.textContent =
      "Upload successful! Starting AI beatmap generation...";

    const generateResponse = await fetch(`${API_BASE}/api/generate`, {
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
    });

    const generateData = await generateResponse.json();

    if (!generateResponse.ok) {
      throw new Error(
        generateData.error ||
        "Could not start AI beatmap generation."
      );
    }

    // Step 3: Confirm GitHub Actions was triggered.
    statusText.textContent =
      "AI beatmap generation started! " +
      "GitHub Actions is processing your song. " +
      "Generation usually takes a few minutes.";

    console.log("Beatmap generation requested:", {
      uploadId: uploadData.uploadId,
      filename: uploadData.filename,
      bpm,
      offset
    });

  } catch (error) {
    statusText.textContent =
      (uploadCompleted
        ? "AI generation failed to start: "
        : "Upload failed: ") +
      error.message;

  } finally {
    generateBtn.disabled = false;
  }
});

// Check GitHub login when the page loads.
checkGitHubLogin();
