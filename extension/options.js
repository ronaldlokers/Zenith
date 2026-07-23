const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(["baseUrl", "apiKey"]).then(({ baseUrl, apiKey }) => {
  $("baseUrl").value = baseUrl || "";
  $("apiKey").value = apiKey || "";
});

$("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    baseUrl: $("baseUrl").value.trim(),
    apiKey: $("apiKey").value.trim(),
  });
  $("saved").textContent = "Saved ✓";
  setTimeout(() => ($("saved").textContent = ""), 1500);
});
