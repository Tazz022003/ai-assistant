(function () {
  const chatUrl = document.body.dataset.chatUrl;
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

  const log = document.getElementById("log");
  const form = document.getElementById("composer");
  const input = document.getElementById("message");
  const sendBtn = document.getElementById("send");
  const clearBtn = document.getElementById("clear");
  const chips = document.querySelectorAll(".chip");
  const banner = document.getElementById("offline-banner");
  const status = document.getElementById("status");

  const greetingHtml = log.innerHTML; // remember the first assistant message
  let history = []; // previous messages, sent to the server for context
  let busy = false;

  function timeNow() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Escape HTML first, then allow only **bold** and line breaks
  function formatReply(text) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  }

  function addMessage(role, text, extraClass) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + role + (extraClass ? " " + extraClass : "");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent =
      (role === "user" ? "YOU" : "CLASS ASSISTANT") + " · " + timeNow();

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (role === "assistant" && !extraClass) {
      bubble.innerHTML = formatReply(text);
    } else {
      bubble.textContent = text;
    }

    wrap.append(meta, bubble);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function setBusy(state) {
    busy = state;
    sendBtn.textContent = state ? "Sending..." : "Send";
    refreshControls();
  }

  // Disable sending while a request is running or when there is no internet
  function refreshControls() {
    const blocked = busy || !navigator.onLine;
    sendBtn.disabled = blocked;
    chips.forEach((chip) => (chip.disabled = blocked));
  }

  // Offline detection: show a message when the connection is lost
  function updateOnlineStatus() {
    const online = navigator.onLine;
    banner.hidden = online;
    status.textContent = online ? "Online" : "Offline";
    status.classList.toggle("offline", !online);
    refreshControls();
  }

  async function sendMessage(text) {
    text = text.trim();
    if (!text || busy) return;
    if (!navigator.onLine) {
      updateOnlineStatus();
      return;
    }

    addMessage("user", text);
    input.value = "";
    setBusy(true);
    const thinking = addMessage("assistant", "Thinking...", "thinking");

    try {
      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ message: text, history: history }),
      });

      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        /* the server did not send JSON */
      }

      thinking.remove();

      if (!response.ok || !data.reply) {
        addMessage("assistant", data.error || "Something went wrong. Please try again.", "error");
      } else {
        addMessage("assistant", data.reply);
        history.push({ role: "user", text: text });
        history.push({ role: "model", text: data.reply });
      }
    } catch (err) {
      thinking.remove();
      addMessage("assistant", "Could not reach the server. Check your internet connection.", "error");
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage(input.value);
  });

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      sendMessage(chip.textContent);
    });
  });

  clearBtn.addEventListener("click", function () {
    history = [];
    log.innerHTML = greetingHtml;
    input.value = "";
    input.focus();
  });

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  // PWA: register the service worker so the app can be installed and open offline
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register(document.body.dataset.swUrl)
        .catch(function (err) {
          console.warn("Service worker registration failed:", err);
        });
    });
  }
})();