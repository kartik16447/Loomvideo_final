// src/ui/player/player.ts
async function initPlayer() {
  const videoElement = document.getElementById("video-player");
  const infoElement = document.getElementById("video-info");
  const downloadBtn = document.getElementById("btn-download");
  console.log("[Player] Requesting buffer...");
  chrome.runtime.sendMessage({ type: "GET_RECORDING_BUFFER" }, (response) => {
    if (response?.buffer && response.buffer.byteLength > 100) {
      console.log("[Player] Received buffer, size:", response.buffer.byteLength);
      const blob = new Blob([response.buffer], { type: response.mimeType });
      const url = URL.createObjectURL(blob);
      videoElement.src = url;
      infoElement.textContent = `Type: ${response.mimeType} | Size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`;
      downloadBtn.onclick = () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = `screenvault-mock-${Date.now()}.webm`;
        a.click();
      };
    } else {
      const errorMsg = response?.buffer ? `Recording is too small (${response.buffer.byteLength} bytes). It likely contains no data.` : "No recording found in memory. Did you close the popup before it saved?";
      console.error("[Player]", errorMsg);
      infoElement.textContent = "Empty Recording: " + errorMsg;
      infoElement.style.color = "#ef4444";
    }
  });
}
document.addEventListener("DOMContentLoaded", initPlayer);
