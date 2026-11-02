
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

    statusText.textContent =
      "Could not check GitHub login: " + error.message;
  }
}

// Handle song uploads.
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

  if (!Number.isFinite(bpm) || bpm <= 0) {
    statusText.textContent = "Please enter a valid BPM.";
    return;
  }

  if (!Number.isFinite(offset)) {
    statusText.textContent = "Please enter a valid offset.";
    return;
  }

  // Temporary limit while using Cloudflare Workers KV.
  const MAX_FILE_SIZE = 2 * 1024 * 1024;

  if (audioFile.size > MAX_FILE_SIZE) {
    statusText.textContent =
      "Please select an MP3 or WAV smaller than 2 MB.";
    return;
  }

  generateBtn.disabled = true;
  statusText.textContent = "Uploading your song to Cloudflare...";

  try {
    const formData = new FormData();
    formData.append("audio", audioFile);

    const response = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      credentials: "include",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Upload failed.");
    }

    statusText.textContent =
      `Upload successful! ${data.filename || audioFile.name} ` +
      `was stored temporarily. ` +
      `Upload ID: ${data.uploadId || "not returned"}. ` +
      `AI generation will be connected next.`;

  } catch (error) {
    statusText.textContent =
      "Upload failed: " + error.message;

  } finally {
    generateBtn.disabled = false;
  }
});

// Check GitHub login when the page loads.
checkGitHubLogin();
