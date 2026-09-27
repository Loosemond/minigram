// Online play settings.
export default {
  // the rooms server's WebSocket URL; "" = the server this page comes from
  // (tools/serve_web.py serves both). "?server=wss://..." in the URL overrides it.
  server: "",
  // the Mini App's link from @BotFather, "https://t.me/<bot>/<app>". Invites
  // then open the game straight in Telegram (with ?startapp=<room code>);
  // left empty, they link to this page instead.
  telegramApp: "",
};
