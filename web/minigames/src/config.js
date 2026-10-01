// Online play settings.
export default {
  // the rooms server's WebSocket URL; "" = the server this page comes from
  // (tools/serve_web.py serves both). When testing, "?server=wss://..." in the
  // URL overrides it.
  server: "",
  // the Mini App's link from @BotFather: "https://t.me/<bot>" for the bot's
  // main Mini App, or "https://t.me/<bot>/<app>" for one made with /newapp.
  // Invites sent from inside Telegram then open the game straight in Telegram
  // (with ?startapp=<room code>); from a browser, or left empty, they link to
  // this page.
  telegramApp: "",
  // ?debug (window.egg in the console) and ?server= work on localhost only;
  // true: everywhere, e.g. to test on a phone
  debug: false,
};
