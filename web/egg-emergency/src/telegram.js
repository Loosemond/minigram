// Telegram Mini App glue. Everything here is optional: outside Telegram (or
// on an older client) the calls fall back or do nothing, so the same page runs
// in any browser. Docs: https://core.telegram.org/bots/webapps
const tg = window.Telegram && window.Telegram.WebApp;
const inside = !!(tg && tg.initData); // initData is empty outside Telegram
const atLeast = (v) => inside && tg.isVersionAtLeast(v);

function localGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function localSet(key, v) { try { localStorage.setItem(key, v); } catch { /* private mode */ } }

let backHandler = null;

export const telegram = {
  inside,
  platform: inside ? tg.platform : "web",
  userName: (inside && tg.initDataUnsafe?.user?.first_name) || null,
  userId: (inside && tg.initDataUnsafe?.user?.id) || null,
  // from a t.me/<bot>/<app>?startapp=... link: a room to join
  startParam: (inside && tg.initDataUnsafe?.start_param) || null,
  // Telegram's signed login, for the rooms server to check (it has the bot's token)
  initData: (inside && tg.initData) || "",

  init(color) {
    if (!inside) return;
    tg.ready();
    tg.expand(); // full height instead of the half-open sheet
    if (atLeast("7.7")) tg.disableVerticalSwipes(); // swiping down mustn't close the game mid-round
    if (atLeast("6.1")) { tg.setHeaderColor(color); tg.setBackgroundColor(color); }
    if (atLeast("7.10")) tg.setBottomBarColor(color);
  },

  onResize(fn) { if (inside) tg.onEvent("viewportChanged", fn); },

  // kind: light | medium | heavy | rigid | soft | success | warning | error | select
  haptic(kind) {
    if (!atLeast("6.1")) return;
    const h = tg.HapticFeedback;
    if (kind === "success" || kind === "warning" || kind === "error") h.notificationOccurred(kind);
    else if (kind === "select") h.selectionChanged();
    else h.impactOccurred(kind);
  },

  // show Telegram's back button while fn is set; null hides it
  back(fn) {
    if (!atLeast("6.1")) return;
    if (backHandler) tg.BackButton.offClick(backHandler);
    backHandler = fn;
    if (fn) { tg.BackButton.onClick(fn); tg.BackButton.show(); } else tg.BackButton.hide();
  },

  // Telegram's "share to a chat" picker; false outside Telegram
  share(url, text) {
    if (!atLeast("6.1")) return false;
    tg.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text));
    return true;
  },

  // the player's data follows them across devices in Telegram (CloudStorage),
  // and stays in localStorage elsewhere
  get(key) {
    if (!atLeast("6.9")) return Promise.resolve(localGet(key));
    return new Promise((resolve) => {
      const late = setTimeout(() => resolve(localGet(key)), 1500); // no answer: don't hang the game
      tg.CloudStorage.getItem(key, (err, v) => { clearTimeout(late); resolve(err || !v ? localGet(key) : v); });
    });
  },
  set(key, value) {
    localSet(key, String(value));
    if (atLeast("6.9")) tg.CloudStorage.setItem(key, String(value));
  },
};
