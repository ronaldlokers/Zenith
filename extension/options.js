import { getCredentials, setCredentials } from "./storage.js";

const $ = (id) => document.getElementById(id);

getCredentials().then(({ baseUrl, apiKey }) => {
  $("baseUrl").value = baseUrl || "";
  $("apiKey").value = apiKey || "";
});

$("save").addEventListener("click", async () => {
  await setCredentials($("baseUrl").value.trim(), $("apiKey").value.trim());
  $("saved").textContent = "Saved ✓";
  setTimeout(() => ($("saved").textContent = ""), 1500);
});
