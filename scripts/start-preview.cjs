/* Cloud preview: plain HTTP on PORT (default 8080) behind a TLS-terminating proxy.
   Any HTTPS, LISTEN_HOST or PORT already in the environment wins. */
process.env.HTTPS ??= "0";
process.env.LISTEN_HOST ??= "0.0.0.0";
process.env.PORT ??= "8080";
// The smart-TV HTTP port defaults to 8080 too; a cloud preview has no TV on its LAN.
process.env.TV_PORT ??= "off";
require("../server/src/index.js");
