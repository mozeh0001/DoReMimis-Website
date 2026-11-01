
const form = document.getElementById("beatmapForm");
const audioInput = document.getElementById("audio");
const bpmInput = document.getElementById("bpm");
const offsetInput = document.getElementById("offset");
const statusText = document.getElementById("status");
const generateBtn = document.getElementById("generateBtn");
const results = document.getElementById("results");

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

  generateBtn.disabled = true;
  statusText.textContent = "Preparing your beatmap request...";

  // A secure backend will be connected here later.
  // Never put a GitHub access token in browser JavaScript.

  statusText.textContent =
    "Website interface ready! Cloud generation is not connected yet.";

  generateBtn.disabled = false;
});
