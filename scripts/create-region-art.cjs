// Bold flat territory art, one scene per Syrian region, generated locally with
// no external image requests. Each scene keeps its resource's palette so the
// resource reads at a glance, and adds the landmark its region is known for.
// Composition note: tiles are pointy-top hexes cropped from the 320px square;
// the resource badge sits at the top centre and the name label across the
// middle, so landmarks live in the upper left/right and the lower band.
const fs = require("node:fs");
const path = require("node:path");
const target = path.join(__dirname, "../client/public/terrain/regions");
fs.mkdirSync(target, { recursive: true });

const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, "-");
const svg = (sky, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="${sky}"/>${body}</svg>`;

// ---- Shared flat motifs -------------------------------------------------
const sun = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const pine = (x, y, s, c, trunk = "#5b4632") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-3" y="0" width="6" height="12" fill="${trunk}"/><path d="M0-46 18-18H10L24 2H-24L-10-18H-18Z" fill="${c}"/></g>`;
const cypress = (x, y, s, c) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-50C9-30 9-8 0 4-9-8-9-30 0-50Z" fill="${c}"/></g>`;
const olive = (x, y, s, c, trunk = "#6b5640") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-2 0h4l2 14h-8z" fill="${trunk}"/><ellipse cx="0" cy="-8" rx="17" ry="11" fill="${c}"/><ellipse cx="-9" cy="-14" rx="9" ry="7" fill="${c}"/><ellipse cx="8" cy="-15" rx="10" ry="7" fill="${c}"/></g>`;
const roundTree = (x, y, s, c, trunk = "#6b5640") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2.5" y="-4" width="5" height="16" fill="${trunk}"/><circle cx="0" cy="-14" r="14" fill="${c}"/></g>`;
const sheep = (x, y, s, flip = false) =>
  `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><path d="M-11 6v10M-3 6v10M5 6v10M11 6v10" stroke="#3b3326" stroke-width="3.2"/><ellipse cx="0" cy="0" rx="17" ry="11" fill="#fbf6e9"/><circle cx="-9" cy="-6" r="7" fill="#fbf6e9"/><circle cx="6" cy="-7" r="8" fill="#fbf6e9"/><ellipse cx="19" cy="-3" rx="6" ry="7.5" fill="#3b3326"/></g>`;
const camel = (x, y, s, c) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"><path d="M-22 0c0-10 6-16 12-16 4 0 6-8 12-8s8 8 10 10l6-6c3-3 8-2 8 2l-4 4-6 10c-2 4-4 6-8 6H-18z"/><path d="M-18 0h3v20h-3zM-8 0h3v20h-3zM6 0h3v20H6zM14 0h3v20h-3z"/></g>`;
const palm = (x, y, s, c, trunk = "#8a6a44") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-2 0q-2-26 2-46h3q-2 22 1 46Z" fill="${trunk}"/><g fill="${c}"><path d="M1-46q-20-6-30 8 14-4 30-6Z"/><path d="M1-46q20-6 30 8-14-4-30-6Z"/><path d="M1-46q-12-16-28-12 16 2 28 14Z"/><path d="M1-46q12-16 28-12-16 2-28 14Z"/><path d="M1-46q-2-14 4-20 0 10-2 20Z"/></g></g>`;
const jar = (x, y, s, c) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-7-30h14v5q12 6 12 18 0 10-8 17H-11q-8-7-8-17 0-12 12-18Z" fill="${c}"/><path d="M-13-6h26" stroke="#f0cfb0" stroke-width="2.5" opacity=".7"/></g>`;
const waves = (y, c, amp = 6) =>
  `<path d="M-10 ${y}q20 -${amp} 40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
const wheatRows = (y0, c1, c2) =>
  [0, 1, 2, 3, 4]
    .map(
      (i) =>
        `<path d="M-10 ${y0 + i * 26}Q160 ${y0 - 18 + i * 26} 330 ${y0 + i * 26}V${y0 + 14 + i * 26}Q160 ${y0 - 4 + i * 26} -10 ${y0 + 14 + i * 26}Z" fill="${i % 2 ? c1 : c2}"/>`,
    )
    .join("");
const stalks = (x, y, c) =>
  `<g fill="${c}" transform="translate(${x} ${y})"><rect x="-1" y="-24" width="2" height="24"/><ellipse cx="0" cy="-27" rx="2.6" ry="5"/><ellipse cx="-4" cy="-19" rx="2.4" ry="4.4" transform="rotate(-30 -4 -19)"/><ellipse cx="4" cy="-19" rx="2.4" ry="4.4" transform="rotate(30 4 -19)"/><ellipse cx="-4" cy="-11" rx="2.4" ry="4.4" transform="rotate(-30 -4 -11)"/><ellipse cx="4" cy="-11" rx="2.4" ry="4.4" transform="rotate(30 4 -11)"/></g>`;
const bricks = (x, y, w, h, c, mortar) => {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  for (let row = 0, yy = y + 8; yy < y + h; row++, yy += 8) {
    out += `<path d="M${x} ${yy}h${w}" stroke="${mortar}" stroke-width="1.5"/>`;
  }
  return out;
};
const noria = (x, y, r, wood, water) => {
  let spokes = "";
  for (let a = 0; a < 180; a += 22.5) {
    const rad = (a * Math.PI) / 180;
    spokes += `<path d="M${x - r * Math.cos(rad)} ${y - r * Math.sin(rad)}L${x + r * Math.cos(rad)} ${y + r * Math.sin(rad)}" stroke="${wood}" stroke-width="3"/>`;
  }
  let buckets = "";
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    buckets += `<rect x="${x + r * Math.cos(rad) - 3.5}" y="${y + r * Math.sin(rad) - 3.5}" width="7" height="7" fill="${wood}"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${wood}" stroke-width="7"/><circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="none" stroke="${wood}" stroke-width="3"/>${spokes}${buckets}<circle cx="${x}" cy="${y}" r="7" fill="${wood}"/><path d="M${x + r - 6} ${y - r * 0.6}l18 -4" stroke="${water}" stroke-width="5" stroke-linecap="round"/>`;
};

// ---- Scenes -------------------------------------------------------------
const scenes = {
  // Wheat: gold palettes.
  Idlib: () =>
    svg(
      "#f3dc8e",
      `${sun(250, 70, 26, "#fff1bf")}
<path d="M0 150Q80 110 170 140T330 130V330H0Z" fill="#d9b54f"/>
${wheatRows(190, "#e8c862", "#c99c34")}
<!-- Dead Cities: a ruined Byzantine arch and columns -->
<g fill="#d8c7a0"><path d="M40 140V78h52v62H80v-30a14 14 0 0 0-28 0v30Z"/><rect x="36" y="72" width="60" height="8"/><rect x="100" y="96" width="8" height="44"/><rect x="96" y="92" width="16" height="6"/></g>
<path d="M52 140v-30a14 14 0 0 1 28 0v30" fill="#b99f6c"/>
${olive(222, 140, 1.25, "#7d8a3c")}${olive(272, 136, 1, "#6b7a32")}
${stalks(40, 300, "#a57c22")}${stalks(280, 304, "#a57c22")}`,
    ),
  Hama: () =>
    svg(
      "#f1d78a",
      `<path d="M0 140Q90 112 180 136T330 126V330H0Z" fill="#cfa847"/>
${wheatRows(214, "#e6c35c", "#c1962f")}
<!-- The Orontes and its norias -->
<path d="M-10 168Q120 150 180 176T330 168V206Q200 214 150 196T-10 204Z" fill="#4f93a0"/>
${waves(186, "#8cc7cc", 4)}
<rect x="60" y="148" width="14" height="40" fill="#8a6a40"/>
${noria(66, 112, 46, "#7a5a33", "#bfe4e6")}
${noria(258, 124, 32, "#7a5a33", "#bfe4e6")}
<rect x="254" y="146" width="10" height="30" fill="#8a6a40"/>
${stalks(150, 306, "#9a7320")}${stalks(196, 300, "#9a7320")}`,
    ),
  Daraa: () =>
    svg(
      "#f2d58c",
      `${sun(70, 64, 22, "#fff2c4")}
<path d="M0 150Q110 120 200 140T330 136V330H0Z" fill="#c9a246"/>
${wheatRows(200, "#e2bd58", "#bb8f2c")}
<!-- Bosra's Roman theatre in black Hauran basalt -->
<g transform="translate(-26 0)"><path d="M196 146a72 60 0 0 1 124 -6v6Z" fill="#3a3a3f"/>
<path d="M206 146a62 50 0 0 1 108 -4v4Z" fill="#55555c"/>
<path d="M218 146a50 38 0 0 1 86 -2" fill="none" stroke="#2a2a2e" stroke-width="3"/>
<path d="M228 146a40 28 0 0 1 68 -2" fill="none" stroke="#2a2a2e" stroke-width="3"/></g>
<g fill="#2e2e33" transform="translate(16 0)"><rect x="22" y="104" width="10" height="42"/><rect x="42" y="104" width="10" height="42"/><rect x="62" y="104" width="10" height="42"/><rect x="16" y="98" width="62" height="8"/></g>
${stalks(60, 304, "#93701f")}${stalks(268, 302, "#93701f")}`,
    ),
  Hasakah: () =>
    svg(
      "#f5df9a",
      `${sun(160, 40, 18, "#fff4cc")}
${wheatRows(150, "#ebc95f", "#c99d30")}
<path d="M0 150h330v12H0z" fill="#d8b04a"/>
<!-- Grain silos of the Jazira and the Khabur river -->
<g fill="#e9e1cc"><rect x="34" y="62" width="22" height="88" rx="4"/><rect x="58" y="62" width="22" height="88" rx="4"/><rect x="82" y="62" width="22" height="88" rx="4"/></g>
<rect x="30" y="56" width="78" height="10" fill="#b8ad92"/><rect x="106" y="96" width="26" height="54" fill="#cfc4a8"/>
<path d="M200 150q20-40 50-44t50 44Z" fill="#c69b4a"/>
<path d="M-10 238Q100 222 170 246T330 236V256Q220 262 160 252T-10 258Z" fill="#4d8f99"/>
${stalks(250, 306, "#9b741f")}${stalks(70, 308, "#9b741f")}`,
    ),
  // Wood: greens, with the coast in blue.
  Latakia: () =>
    svg(
      "#a9d3cf",
      `<path d="M0 70Q60 40 120 66T230 58 330 80V330H0Z" fill="#2f6b4f"/>
${pine(40, 108, 1.2, "#1f5440")}${pine(78, 100, 1, "#2b6a4a")}${pine(250, 104, 1.1, "#1f5440")}${pine(288, 96, 1.2, "#2b6a4a")}
<path d="M0 160Q80 140 160 162T330 150V330H0Z" fill="#3e8257"/>
<!-- The Mediterranean shore and the old lighthouse -->
<path d="M-10 230Q140 214 330 236V330H-10Z" fill="#2c7f98"/>
${waves(252, "#7fc6d6")}${waves(282, "#7fc6d6")}
<path d="M220 232l6-58h14l6 58Z" fill="#f2ead8"/><rect x="222" y="196" width="22" height="7" fill="#c9433a"/><rect x="224" y="168" width="18" height="10" fill="#e9b949"/><path d="M220 168l13-10 13 10Z" fill="#c9433a"/>
${pine(110, 214, 0.8, "#1f5440")}`,
    ),
  Tartus: () =>
    svg(
      "#b5d8d2",
      `<path d="M0 60Q90 30 180 54T330 46V330H0Z" fill="#3a7650"/>
${pine(46, 96, 1, "#245a42")}${pine(84, 88, 1.15, "#2c6a4b")}${pine(240, 92, 1, "#245a42")}${pine(282, 84, 1.15, "#2c6a4b")}
<path d="M0 150Q120 128 330 150V330H0Z" fill="#2d7e96"/>
${waves(176, "#82c8d6")}${waves(298, "#82c8d6")}
<!-- Arwad island fortress off the port -->
<path d="M200 236h104l-8 18h-88Z" fill="#c9b78f"/>
<rect x="212" y="200" width="80" height="36" fill="#d8c79e"/><g fill="#d8c79e"><rect x="212" y="192" width="10" height="10"/><rect x="230" y="192" width="10" height="10"/><rect x="248" y="192" width="10" height="10"/><rect x="266" y="192" width="10" height="10"/><rect x="282" y="192" width="10" height="10"/></g>
<rect x="244" y="214" width="14" height="22" fill="#8a7550"/>
<!-- A wooden boat from the boatyards -->
<path d="M30 270h70l-12 16H42Z" fill="#8b5a33"/><path d="M62 270V226l26 40Z" fill="#f4ecd8"/>`,
    ),
  "Jabal Ansariyah": () =>
    svg(
      "#c5ddd2",
      `<path d="M-10 150L60 50l40 50 50-80 60 90 50-60 60 80v220H-10Z" fill="#4c7d68"/>
<path d="M150 20l18 26-10-4-8 10-8-10-10 4Z" fill="#eef2ea"/>
<path d="M-10 190L70 120l60 50 60-70 70 80 70-50v200H-10Z" fill="#2f6a4c"/>
${pine(30, 128, 1.1, "#1d5038")}${pine(64, 118, 1.25, "#245c42")}${pine(258, 118, 1.2, "#1d5038")}${pine(292, 128, 1.05, "#245c42")}
<!-- Mountain stream through the forest -->
<path d="M150 190q-12 40 6 70t-10 70h22q20-40 0-70t6-70Z" fill="#6fb4c4"/>
${pine(70, 270, 1.4, "#173f2d")}${pine(110, 290, 1.1, "#1d5038")}${pine(220, 284, 1.3, "#173f2d")}${pine(262, 296, 1.1, "#1d5038")}`,
    ),
  "Afrin Highlands": () =>
    svg(
      "#d6e3c2",
      `${sun(264, 54, 20, "#f6f2d6")}
<path d="M0 120Q80 80 160 110T330 96V330H0Z" fill="#8aa95c"/>
<!-- Terraced olive groves -->
<path d="M0 170Q160 140 330 168V330H0Z" fill="#6f924a"/>
<path d="M0 220Q160 194 330 220V330H0Z" fill="#5c8240"/>
<path d="M0 270Q160 248 330 272V330H0Z" fill="#4b6f35"/>
${olive(40, 116, 1, "#4f6b2c")}${olive(86, 106, 0.9, "#5b7a33")}${olive(232, 106, 0.9, "#4f6b2c")}${olive(280, 112, 1, "#5b7a33")}
${olive(56, 214, 1.05, "#35521f")}${olive(262, 214, 1.05, "#35521f")}
${olive(40, 264, 1.1, "#2f4a1c")}${olive(110, 260, 0.9, "#35521f")}${olive(212, 262, 0.9, "#35521f")}${olive(284, 266, 1.1, "#2f4a1c")}`,
    ),
  // Stone: greys and limestone.
  Damascus: () =>
    svg(
      "#d5dde2",
      `<!-- Mount Qasioun behind the old city -->
<path d="M-10 130L80 60l60 30 60-46 70 40 70-10v266H-10Z" fill="#9aa3a7"/>
<path d="M-10 170h340v160H-10Z" fill="#c2bba9"/>
<!-- The Umayyad Mosque: dome and minarets in dressed stone -->
<rect x="196" y="120" width="110" height="52" fill="#e7dfc9"/>
<path d="M226 120a25 25 0 0 1 50 0Z" fill="#7c8a8f"/>
<rect x="246" y="86" width="10" height="10" fill="#7c8a8f"/><path d="M251 72l5 14h-10Z" fill="#7c8a8f"/>
<rect x="196" y="58" width="14" height="66" fill="#efe8d5"/><path d="M193 58h20l-10-18Z" fill="#7c8a8f"/>
<rect x="292" y="70" width="12" height="54" fill="#efe8d5"/><path d="M289 70h18l-9-16Z" fill="#7c8a8f"/>
<g fill="#b9ae93"><rect x="206" y="140" width="10" height="20" rx="5"/><rect x="226" y="140" width="10" height="20" rx="5"/><rect x="266" y="140" width="10" height="20" rx="5"/><rect x="286" y="140" width="10" height="20" rx="5"/></g>
<rect x="40" y="96" width="12" height="76" fill="#efe8d5"/><path d="M37 96h18l-9-18Z" fill="#7c8a8f"/>
<!-- Ablaq: striped black and white masonry in the foreground -->
<g>${[0, 1, 2, 3, 4].map((i) => `<rect x="-10" y="${236 + i * 16}" width="340" height="8" fill="#3d4246"/><rect x="-10" y="${244 + i * 16}" width="340" height="8" fill="#e7dfc9"/>`).join("")}</g>`,
    ),
  "Rif Dimashq": () =>
    svg(
      "#d9e0e3",
      `<!-- Maaloula: a village tucked into the limestone cliffs -->
<path d="M-10 40h120l20 120-30 170H-10Z" fill="#a39c8b"/>
<path d="M330 30H210l-24 130 34 170h110Z" fill="#8f897a"/>
<path d="M110 40l20 120-30 170h120L186 160l24-130Z" fill="#cfc6b0"/>
<g fill="#7da7c4"><rect x="20" y="70" width="26" height="20"/><rect x="58" y="96" width="22" height="18"/><rect x="24" y="118" width="30" height="20"/><rect x="236" y="62" width="26" height="20"/><rect x="270" y="92" width="28" height="20"/><rect x="242" y="118" width="22" height="18"/></g>
<g fill="#f1ece0"><rect x="64" y="58" width="22" height="18"/><rect x="40" y="94" width="14" height="14"/><rect x="214" y="90" width="20" height="18"/><rect x="284" y="62" width="20" height="16"/></g>
<g fill="#4c5459"><rect x="28" y="76" width="6" height="8"/><rect x="66" y="102" width="6" height="8"/><rect x="246" y="68" width="6" height="8"/><rect x="280" y="98" width="6" height="8"/></g>
<path d="M-10 250Q160 230 330 254V330H-10Z" fill="#b3ab97"/>
<g fill="#e6dfcd"><rect x="40" y="262" width="34" height="18"/><rect x="80" y="268" width="30" height="16"/><rect x="220" y="264" width="36" height="18"/><rect x="262" y="270" width="28" height="14"/></g>`,
    ),
  "Palmyra Foothills": () =>
    svg(
      "#ead9b8",
      `${sun(270, 50, 22, "#f8ecd0")}
<path d="M-10 120l60-50 40 30 50-40 50 40 60-30 80 50v210H-10Z" fill="#b8a07d"/>
<!-- Qalat ibn Maan on the ridge -->
<rect x="66" y="74" width="40" height="22" fill="#9a7f5a"/><rect x="74" y="62" width="10" height="14" fill="#9a7f5a"/><rect x="92" y="66" width="10" height="10" fill="#9a7f5a"/>
<path d="M-10 160h340v170H-10Z" fill="#d6be93"/>
<!-- The great colonnade and the monumental arch -->
<g fill="#efdcb5">${[196, 220, 244, 292].map((x) => `<rect x="${x}" y="104" width="10" height="64"/><rect x="${x - 3}" y="98" width="16" height="7"/>`).join("")}</g>
<path d="M254 168v-60h34v60h-8v-26a9 9 0 0 0-18 0v26Z" fill="#e4cc9e"/><rect x="250" y="100" width="42" height="9" fill="#e4cc9e"/>
<g fill="#e8d3a9"><rect x="22" y="128" width="10" height="40"/><rect x="40" y="136" width="10" height="32"/><rect x="58" y="124" width="10" height="44"/></g>
<path d="M-10 250Q160 226 330 252V330H-10Z" fill="#c4a578"/>
<g fill="#a6875c"><path d="M40 268l14-10 18 4 6 12-20 6-16-4Z"/><path d="M240 272l16-12 22 6 4 12-22 4Z"/></g>`,
    ),
  // Clay / brick: terracotta.
  Aleppo: () =>
    svg(
      "#f0cfb0",
      `<!-- The Citadel of Aleppo on its glacis -->
<path d="M150 170l40-80h100l40 80Z" fill="#c4875f"/>
<rect x="196" y="56" width="88" height="36" fill="#d9a579"/>
<g fill="#d9a579"><rect x="196" y="48" width="12" height="10"/><rect x="216" y="48" width="12" height="10"/><rect x="236" y="48" width="12" height="10"/><rect x="256" y="48" width="12" height="10"/><rect x="274" y="48" width="10" height="10"/></g>
<rect x="232" y="64" width="16" height="28" fill="#8a5739"/>
<!-- The stepped bridge and gate tower -->
<path d="M90 170l40-60h24l-4 60Z" fill="#b97a54"/><rect x="104" y="82" width="34" height="34" fill="#d9a579"/><rect x="114" y="94" width="14" height="22" fill="#8a5739"/>
<path d="M-10 170h340v160H-10Z" fill="#cf9168"/>
<!-- Souk domes -->
${[20, 70, 120, 170, 220, 270].map((x) => `<path d="M${x} 252a24 22 0 0 1 48 0Z" fill="#e2b088"/><rect x="${x}" y="252" width="48" height="16" fill="#b9774f"/>`).join("")}
${bricks(-10, 280, 340, 50, "#a85f3c", "#cf9168")}`,
    ),
  "Deir ez-Zor": () =>
    svg(
      "#f2d6b0",
      `${sun(70, 60, 20, "#fbebcf")}
<path d="M-10 150h340v180H-10Z" fill="#d79b68"/>
<!-- The suspension bridge over the Euphrates -->
<path d="M-10 196Q160 182 330 200V232Q160 220 -10 232Z" fill="#3f8a9a"/>
${waves(214, "#86c3cd", 3)}
<rect x="60" y="90" width="12" height="110" fill="#7a4a30"/><rect x="250" y="90" width="12" height="110" fill="#7a4a30"/>
<path d="M-10 100Q66 96 66 96T256 96 330 100" fill="none" stroke="#7a4a30" stroke-width="4"/>
<path d="M66 96Q160 176 256 96" fill="none" stroke="#7a4a30" stroke-width="4"/>
<path d="M-10 182h340v8H-10Z" fill="#8a5838"/>
<g stroke="#7a4a30" stroke-width="2">${[90, 110, 130, 150, 170, 190, 210, 230].map((x) => `<path d="M${x} ${x < 160 ? 114 + (x - 66) * 0.6 : 114 + (256 - x) * 0.6}V182"/>`).join("")}</g>
<!-- Mud-brick houses and a kiln on the bank -->
${bricks(20, 256, 70, 40, "#b8693f", "#d79b68")}${bricks(100, 266, 50, 30, "#c47a4c", "#d79b68")}
<path d="M220 296v-34a26 26 0 0 1 52 0v34Z" fill="#a85d38"/><path d="M238 296v-18a8 8 0 0 1 16 0v18Z" fill="#4a2a1c"/><rect x="241" y="226" width="10" height="16" fill="#a85d38"/>`,
    ),
  Manbij: () =>
    svg(
      "#f3d5b4",
      `<path d="M0 150Q100 130 200 150T330 142V330H0Z" fill="#d7976a"/>
<!-- Beehive mud-brick houses and kilns at the crossroads -->
${[
  [44, 160, 1.15],
  [96, 150, 1],
  [236, 152, 1.05],
  [286, 160, 1.2],
]
  .map(
    ([x, y, s]) =>
      `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-22 0C-22-30-10-56 0-62 10-56 22-30 22 0Z" fill="#e2b088"/><path d="M-22 0C-22-30-10-56 0-62L0 0Z" fill="#c98e63"/><path d="M-6 0v-14a6 6 0 0 1 12 0V0Z" fill="#5a3422"/></g>`,
  )
  .join("")}
<path d="M-10 214h340v116H-10Z" fill="#c07a50"/>
<path d="M160 214l-60 116h120Z" fill="#e3b78c"/><path d="M-10 262h340v20H-10Z" fill="#e3b78c"/>
${bricks(10, 288, 80, 32, "#9e5534", "#c07a50")}${bricks(232, 288, 80, 32, "#9e5534", "#c07a50")}`,
    ),
  // Sheep: pasture greens.
  Homs: () =>
    svg(
      "#cfe2c9",
      `<!-- Krak des Chevaliers above the pastures -->
<path d="M-10 140L70 70l70 40 50-30 140 70v180H-10Z" fill="#8fae6b"/>
<path d="M30 96h86v38H30Z" fill="#cbbf9f"/><path d="M40 96V72h66v24Z" fill="#ddd2b4"/>
<g fill="#ddd2b4"><rect x="24" y="80" width="18" height="54"/><rect x="104" y="80" width="18" height="54"/><rect x="62" y="56" width="20" height="18"/></g>
<g fill="#cbbf9f"><rect x="24" y="74" width="6" height="8"/><rect x="36" y="74" width="6" height="8"/><rect x="104" y="74" width="6" height="8"/><rect x="116" y="74" width="6" height="8"/></g>
<path d="M-10 170Q160 140 330 170V330H-10Z" fill="#a9c47e"/>
<path d="M-10 236Q160 210 330 240V330H-10Z" fill="#8bab61"/>
${sheep(220, 120, 1.1)}${sheep(282, 134, 0.9, true)}${sheep(60, 262, 1.15)}${sheep(250, 276, 1.2, true)}${sheep(150, 300, 0.9)}`,
    ),
  Suwayda: () =>
    svg(
      "#dfe3c4",
      `<!-- Jabal al-Arab: volcanic hills, basalt walls and vineyards -->
<path d="M-10 130l60-70 50 50 50-60 60 60 50-40 80 70v190H-10Z" fill="#6f7d58"/>
<path d="M200 60l16-6 14 6-8 10Z" fill="#4a4f45"/>
<path d="M-10 170Q160 146 330 172V330H-10Z" fill="#a5bd73"/>
<g stroke="#3f4440" stroke-width="7" stroke-linecap="round"><path d="M10 206h120M190 210h130"/></g>
<g fill="#7d4a6b">${[30, 60, 90, 210, 240, 270, 300].map((x) => `<circle cx="${x}" cy="194" r="5"/><circle cx="${x + 5}" cy="199" r="4"/>`).join("")}</g>
<rect x="24" y="96" width="30" height="34" fill="#4a4f45"/><rect x="32" y="110" width="10" height="20" fill="#2c302b"/>
<rect x="262" y="104" width="34" height="28" fill="#4a4f45"/>
<path d="M-10 236Q160 214 330 240V330H-10Z" fill="#88a35c"/>
${sheep(70, 270, 1.15)}${sheep(250, 268, 1.1, true)}${sheep(160, 300, 0.95)}
${roundTree(240, 150, 0.8, "#5f7a3a")}${roundTree(84, 150, 0.8, "#5f7a3a")}`,
    ),
  "Raqqa Steppe": () =>
    svg(
      "#ece0b8",
      `${sun(60, 60, 20, "#f9f0d4")}
<!-- Qal'at Ja'bar on the lake shore, far across the steppe -->
<path d="M-10 140h340v14H-10Z" fill="#4f93a0"/>
<path d="M210 140l14-32h50l14 32Z" fill="#b98e5e"/><rect x="232" y="88" width="34" height="22" fill="#c9a06c"/><rect x="242" y="72" width="12" height="18" fill="#c9a06c"/>
<path d="M-10 154h340v176H-10Z" fill="#c8c483"/>
<!-- A black goat-hair tent -->
<path d="M40 196l30-34 30 34 26-26 26 26Z" fill="#3d342b"/><rect x="40" y="196" width="112" height="8" fill="#2b241e"/>
<path d="M-10 230Q160 214 330 236V330H-10Z" fill="#a9ae6a"/>
${sheep(220, 200, 0.95, true)}${sheep(270, 214, 0.9)}${sheep(70, 270, 1.1)}${sheep(170, 292, 1.05, true)}${sheep(262, 284, 1)}`,
    ),
  "Quneitra Plains": () =>
    svg(
      "#cfe0de",
      `<!-- Mount Hermon, snow-capped, above the Golan plains -->
<path d="M-10 160L120 40l70 50 40-24 100 94Z" fill="#8a9a94"/>
<path d="M120 40l26 24-10-2-16 12-14-10-12 4Z" fill="#f4f6f2"/>
<path d="M230 66l22 20-14-4-10 6-8-6-8 2Z" fill="#f4f6f2"/>
<!-- Volcanic tells dot the plain -->
<path d="M20 170q30-40 60 0Z" fill="#6f8a5e"/><path d="M250 172q30-34 60 0Z" fill="#6f8a5e"/>
<path d="M-10 168Q160 150 330 170V330H-10Z" fill="#9fc07a"/>
<path d="M-10 226Q160 204 330 230V330H-10Z" fill="#84a85f"/>
<g stroke="#3f4440" stroke-width="5" stroke-linecap="round"><path d="M0 220h80M240 224h90"/></g>
${sheep(60, 264, 1.15)}${sheep(250, 262, 1.1, true)}${sheep(150, 296, 1)}${sheep(280, 304, 0.85)}`,
    ),
  // The desert.
  Badiya: () =>
    svg(
      "#f3d9a8",
      `${sun(250, 70, 30, "#fff0c8")}
<path d="M-10 170Q80 110 180 160T330 130V330H-10Z" fill="#e2b273"/>
<path d="M-10 220Q120 160 330 210V330H-10Z" fill="#d39c5c"/>
<path d="M-10 270Q160 220 330 280V330H-10Z" fill="#c18648"/>
<!-- A camel caravan crossing the dunes -->
${camel(56, 150, 1.1, "#7a5432")}${camel(110, 156, 0.9, "#7a5432")}${camel(260, 214, 1.2, "#5e3f24")}
<path d="M30 300q20-10 40 0M210 306q24-10 48 0" fill="none" stroke="#e8c088" stroke-width="3" stroke-linecap="round"/>`,
    ),
  // ---- Regions of the 30-territory map for five and six players ----------
  Qamishli: () =>
    svg(
      "#f4dd96",
      `${sun(70, 60, 20, "#fff3c8")}
${wheatRows(150, "#e9c65d", "#c79a2f")}
<path d="M0 148h330v10H0z" fill="#d4ab45"/>
<!-- Qamishli's railway station on the old Baghdad line -->
<rect x="196" y="92" width="96" height="56" fill="#e7d9b6"/><path d="M190 94l54-26 54 26Z" fill="#b8693f"/>
<g fill="#7b5a3a"><rect x="208" y="108" width="14" height="22" rx="7"/><rect x="236" y="108" width="14" height="22" rx="7"/><rect x="264" y="108" width="14" height="22" rx="7"/></g>
<rect x="232" y="56" width="22" height="16" fill="#e7d9b6"/><circle cx="243" cy="64" r="5" fill="#fff8e6" stroke="#7b5a3a" stroke-width="2"/>
<path d="M20 146h150" stroke="#6d5a46" stroke-width="3"/><path d="M20 140h150" stroke="#6d5a46" stroke-width="2" stroke-dasharray="4 6"/>
${stalks(60, 306, "#9a7320")}${stalks(262, 304, "#9a7320")}`,
    ),
  "Al-Ghab Plain": () =>
    svg(
      "#ecd892",
      `<path d="M0 96Q60 50 120 84T200 70 330 92V160H0Z" fill="#5e8a52"/>
<path d="M0 120Q90 96 170 118T330 108V180H0Z" fill="#4a7440"/>
<!-- The drained valley floor: dark rich soil between gold fields -->
${wheatRows(176, "#e4c05a", "#5b4a33")}
<path d="M-10 160Q120 150 330 164V174Q150 160 -10 172Z" fill="#4f93a0"/>
${olive(44, 128, 0.9, "#6f8a3a")}${olive(282, 124, 0.95, "#6f8a3a")}
${stalks(150, 306, "#9a7320")}${stalks(196, 300, "#9a7320")}`,
    ),
  "Kessab Forest": () =>
    svg(
      "#c6e0d6",
      `<path d="M0 120L70 50 120 96 180 30 250 100 330 60V330H0Z" fill="#7a9488"/>
<path d="M158 52l22-22 22 22-10 4-12-8-12 8Z" fill="#f4f7f2"/>
${pine(30, 150, 1.3, "#1f5440")}${pine(74, 142, 1.1, "#2b6a4a")}${pine(244, 146, 1.2, "#1f5440")}${pine(290, 138, 1.35, "#2b6a4a")}
<path d="M0 180Q80 160 160 176T330 168V330H0Z" fill="#3e8257"/>
<!-- An Armenian church roof among the pines -->
<rect x="128" y="226" width="64" height="42" fill="#efe5cf"/><path d="M122 228l38-24 38 24Z" fill="#b8693f"/><rect x="154" y="182" width="12" height="26" fill="#efe5cf"/><path d="M150 184l10-12 10 12Z" fill="#b8693f"/>
${pine(40, 300, 1, "#245a42")}${pine(290, 304, 1.1, "#245a42")}${pine(92, 310, 0.8, "#1f5440")}`,
    ),
  "Slenfeh Woods": () =>
    svg(
      "#d5e4e4",
      `<path d="M0 160Q80 140 160 152T330 146V330H0Z" fill="#e8eeee" opacity=".7"/>
<path d="M0 90Q90 40 170 80T330 70V330H0Z" fill="#2f6b4f"/>
${pine(36, 120, 1.25, "#1f5440")}${pine(80, 106, 1, "#2b6a4a")}${pine(242, 112, 1.1, "#1f5440")}${pine(288, 100, 1.3, "#2b6a4a")}
<!-- Summer haze over the mountain resort -->
<path d="M-10 150Q100 132 200 150T340 144V172Q220 168 120 176T-10 170Z" fill="#eef4f2" opacity=".85"/>
<path d="M0 200Q80 186 160 198T330 192V330H0Z" fill="#3e8257"/>
${roundTree(60, 270, 1.2, "#5f9c6b")}${roundTree(262, 266, 1.3, "#5f9c6b")}
${pine(150, 312, 0.9, "#245a42")}${pine(200, 304, 1, "#1f5440")}`,
    ),
  Salamiyah: () =>
    svg(
      "#dbe9c4",
      `${sun(250, 60, 22, "#fff6d4")}
<path d="M0 150Q100 124 200 146T330 138V330H0Z" fill="#bcd57e"/>
<!-- The Ismaili castle mound of Shmemis above the steppe edge -->
<path d="M20 150q30-60 64-64t64 64Z" fill="#a39a7e"/>
<g fill="#cdbf98"><rect x="54" y="80" width="64" height="26"/><rect x="50" y="74" width="10" height="10"/><rect x="70" y="74" width="10" height="10"/><rect x="90" y="74" width="10" height="10"/><rect x="110" y="74" width="10" height="10"/></g>
<path d="M0 220Q120 200 330 222V330H0Z" fill="#8bab61"/>
${sheep(62, 262, 1.1)}${sheep(250, 258, 1.15, true)}${sheep(160, 298, 1)}${sheep(290, 304, 0.8, true)}`,
    ),
  Jarabulus: () =>
    svg(
      "#d4e7c8",
      `<path d="M0 120Q100 98 200 116T330 108V330H0Z" fill="#a9c873"/>
<!-- The ancient tell of Carchemish above the upper Euphrates -->
<path d="M180 124q40-62 80-64t76 64Z" fill="#b8a77e"/><path d="M206 92h70" stroke="#93845e" stroke-width="4"/>
${roundTree(40, 120, 1, "#5f8f4a")}${roundTree(76, 116, 0.85, "#6fa058")}
<path d="M-10 156Q120 140 180 160T340 150V190Q200 200 140 184T-10 192Z" fill="#4f93a0"/>
${waves(172, "#9fd1d4", 4)}
<path d="M0 214Q140 198 330 216V330H0Z" fill="#8bab61"/>
${sheep(60, 262, 1.1)}${sheep(236, 258, 1.15, true)}${sheep(150, 300, 1)}`,
    ),
  "Bosra Basalt": () =>
    svg(
      "#e2dcc8",
      `${sun(64, 60, 20, "#fff6dc")}
<path d="M0 150Q100 130 200 146T330 140V330H0Z" fill="#7c8a8f"/>
<!-- The basalt citadel that wraps Bosra's theatre -->
<g transform="translate(-30 0)"><g fill="#2e2e33"><rect x="186" y="76" width="112" height="72"/><rect x="176" y="62" width="30" height="86"/><rect x="278" y="62" width="30" height="86"/></g>
<g fill="#55555c"><rect x="176" y="56" width="8" height="8"/><rect x="190" y="56" width="8" height="8"/><rect x="278" y="56" width="8" height="8"/><rect x="292" y="56" width="8" height="8"/></g>
<rect x="228" y="110" width="28" height="38" rx="14" fill="#1b1b1f"/></g>
<!-- Black and white basalt blocks in the field -->
<g fill="#3a3a3f"><rect x="24" y="226" width="40" height="22"/><rect x="70" y="236" width="30" height="16"/><rect x="232" y="240" width="46" height="24"/></g>
<g fill="#e7dfc9"><rect x="40" y="276" width="34" height="18"/><rect x="250" y="282" width="38" height="18"/></g>`,
    ),
  Maaloula: () =>
    svg(
      "#d8e2ea",
      `<path d="M0 30L100 40 112 330H0Z" fill="#cbbf9f"/><path d="M330 30L220 44 208 330H330Z" fill="#cbbf9f"/>
<path d="M100 40 112 330H140L124 60Z" fill="#a89a77"/><path d="M220 44 208 330H180L198 62Z" fill="#a89a77"/>
<!-- Cream and pale blue houses stacked on the Qalamoun cliffs -->
<g fill="#f2ecdc"><rect x="16" y="70" width="28" height="22"/><rect x="50" y="84" width="30" height="24"/><rect x="22" y="104" width="26" height="22"/><rect x="242" y="78" width="30" height="24"/><rect x="278" y="64" width="28" height="22"/><rect x="250" y="112" width="30" height="22"/></g>
<g fill="#9fc3dc"><rect x="56" y="58" width="22" height="20"/><rect x="286" y="96" width="24" height="20"/><rect x="18" y="138" width="28" height="18"/></g>
<g fill="#5f6f80"><rect x="24" y="78" width="6" height="8"/><rect x="60" y="92" width="6" height="8"/><rect x="250" y="86" width="6" height="8"/><rect x="286" y="72" width="6" height="8"/></g>
<path d="M140 330V250q20-24 40 0v80Z" fill="#e7dfc9"/>
<path d="M0 270h112M208 280h122" stroke="#8a7d5e" stroke-width="3"/>`,
    ),
  "Al-Mayadin": () =>
    svg(
      "#f2d6bb",
      `${sun(70, 58, 20, "#fff1dc")}
<path d="M0 130Q100 112 200 128T330 122V170H0Z" fill="#dd9572"/>
<!-- The Rahba castle on its mound above the Euphrates mud banks -->
<g transform="translate(-24 0)"><path d="M180 132q44-66 82-68t70 68Z" fill="#c98a5e"/>
<g fill="#a85e38"><rect x="214" y="70" width="72" height="30"/><rect x="208" y="60" width="16" height="40"/><rect x="276" y="60" width="16" height="40"/></g></g>
<path d="M-10 166Q120 152 200 170T340 160V196Q220 206 140 192T-10 200Z" fill="#4f93a0"/>
${waves(180, "#9fd1d4", 4)}
${bricks(24, 228, 120, 48, "#b8693f", "#f0cfb0")}
<g fill="#b8693f"><rect x="214" y="240" width="22" height="12"/><rect x="240" y="240" width="22" height="12"/><rect x="266" y="240" width="22" height="12"/><rect x="227" y="226" width="22" height="12"/><rect x="253" y="226" width="22" height="12"/></g>`,
    ),
  Douma: () =>
    svg(
      "#f1d3b6",
      `<path d="M0 140Q100 120 200 136T330 130V330H0Z" fill="#dd9572"/>
<!-- Ghouta orchards and the domed brick kilns -->
${roundTree(34, 132, 1.05, "#6f9a52")}${roundTree(72, 126, 0.9, "#7fab5f")}${roundTree(108, 134, 0.95, "#6f9a52")}
<path d="M210 140v-34a34 34 0 0 1 68 0v34Z" fill="#b8693f"/><path d="M234 140v-18a10 10 0 0 1 20 0v18Z" fill="#5a2e1a"/>
<rect x="274" y="70" width="12" height="44" fill="#9a5434"/><path d="M280 60q-10-14 4-26" fill="none" stroke="#c9b8a6" stroke-width="5" stroke-linecap="round"/>
<path d="M0 214Q140 198 330 216V330H0Z" fill="#c98258"/>
${bricks(30, 238, 100, 40, "#a85e38", "#f0cfb0")}
<g fill="#b8693f"><rect x="210" y="258" width="24" height="12"/><rect x="238" y="258" width="24" height="12"/><rect x="266" y="258" width="24" height="12"/><rect x="224" y="244" width="24" height="12"/><rect x="252" y="244" width="24" height="12"/><rect x="238" y="230" width="24" height="12"/></g>`,
    ),
  "Al-Hamad": () =>
    svg(
      "#f2d7a6",
      `${sun(250, 64, 26, "#fff0c8")}
<path d="M-10 150h340V330H-10Z" fill="#d7a96a"/>
<!-- A flat stony plateau: mesas, scattered stones and a lone caravan -->
<path d="M14 150l14-40h70l14 40Z" fill="#b97f45"/><path d="M28 110h70v8H28z" fill="#a46d38"/>
<path d="M-10 214h340V330H-10Z" fill="#c8915a"/>
<g fill="#8d6239"><ellipse cx="40" cy="236" rx="12" ry="5"/><ellipse cx="120" cy="252" rx="8" ry="4"/><ellipse cx="210" cy="240" rx="10" ry="4"/><ellipse cx="290" cy="262" rx="12" ry="5"/><ellipse cx="70" cy="290" rx="9" ry="4"/><ellipse cx="180" cy="300" rx="12" ry="5"/></g>
${camel(240, 140, 0.9, "#6b4a2c")}${camel(286, 144, 0.75, "#6b4a2c")}`,
    ),
  // ---- Tunisian cities that join the 44-territory map for 7 and 8 players ----
  Beja: () =>
    svg(
      "#f3dc8e",
      `${sun(256, 62, 24, "#fff1bf")}
<path d="M0 132Q70 92 150 124T330 112V330H0Z" fill="#d9b54f"/>
<!-- Rolling hills of the Tunisian breadbasket, with a Roman bridge over the wadi -->
<g fill="#d8c7a0"><path d="M18 136V104h104v32h-8v-12a14 14 0 0 0-28 0v12h-12v-12a14 14 0 0 0-28 0v12Z"/><rect x="14" y="98" width="112" height="8"/></g>
<path d="M-10 146Q60 138 140 148" fill="none" stroke="#4f93a0" stroke-width="7"/>
${wheatRows(178, "#e8c862", "#c99c34")}
${olive(268, 132, 0.9, "#7d8a3c")}
${stalks(46, 304, "#a57c22")}${stalks(276, 300, "#a57c22")}`,
    ),
  Jendouba: () =>
    svg(
      "#f1d78a",
      `<path d="M0 120Q90 96 180 116T330 108V330H0Z" fill="#cfa847"/>
<!-- Bulla Regia's column stumps above the Medjerda valley wheat -->
<g fill="#e3d3ae"><rect x="26" y="70" width="12" height="50"/><rect x="50" y="84" width="12" height="36"/><rect x="74" y="64" width="12" height="56"/><rect x="20" y="64" width="72" height="8"/></g>
${olive(250, 118, 1.1, "#7d8a3c")}${olive(292, 112, 0.85, "#6b7a32")}
<path d="M-10 156Q120 140 180 158T340 150V176Q200 186 140 172T-10 180Z" fill="#4f93a0"/>
${waves(166, "#9fd1d4", 3)}
${wheatRows(200, "#e8c862", "#c99c34")}
${stalks(150, 310, "#a57c22")}`,
    ),
  "Le Kef": () =>
    svg(
      "#f4dd96",
      `${sun(254, 58, 20, "#fff3c8")}
<!-- The kasbah walls of Le Kef on its rocky hill above the high plains -->
<path d="M0 150Q20 70 80 64T170 150Z" fill="#b8a07a"/>
<g fill="#e3cfa4"><rect x="34" y="70" width="96" height="30"/><rect x="28" y="56" width="20" height="44"/><rect x="116" y="56" width="20" height="44"/></g>
<g fill="#c9b07e"><rect x="28" y="50" width="6" height="8"/><rect x="42" y="50" width="6" height="8"/><rect x="116" y="50" width="6" height="8"/><rect x="130" y="50" width="6" height="8"/></g>
<path d="M0 148h330V330H0Z" fill="#d4ab45"/>
${wheatRows(170, "#e9c65d", "#c79a2f")}
${stalks(60, 306, "#9a7320")}${stalks(262, 304, "#9a7320")}`,
    ),
  Tabarka: () =>
    svg(
      "#cfe4e6",
      `<path d="M0 110Q60 60 130 90T200 120V200H0Z" fill="#3e8257"/>
<!-- Cork oak hills meeting the coral coast and the Genoese fort on its rock -->
${olive(30, 120, 1.15, "#1f5440", "#a8653a")}${olive(80, 108, 1, "#2b6a4a", "#a8653a")}${olive(130, 122, 0.95, "#1f5440", "#a8653a")}
<path d="M-10 170Q160 150 340 166V330H-10Z" fill="#3a7fa0"/>
${waves(196, "#9fd1d4", 4)}${waves(236, "#7fbfd0", 4)}
<path d="M222 200q30-70 64-70t50 70Z" fill="#8f8a7a"/>
<g fill="#d8c7a0"><rect x="238" y="104" width="62" height="30"/><rect x="232" y="92" width="16" height="42"/><rect x="290" y="92" width="16" height="42"/></g>
<g fill="#c4b088"><rect x="232" y="86" width="6" height="8"/><rect x="244" y="86" width="6" height="8"/><rect x="290" y="86" width="6" height="8"/><rect x="302" y="86" width="6" height="8"/></g>
<path d="M20 290h70l-10 14H30Z" fill="#f2ecdc"/><path d="M54 290v-34l22 30Z" fill="#fbf6e9"/>`,
    ),
  "Ain Draham": () =>
    svg(
      "#d5e4e4",
      `<path d="M0 100L60 50 120 90 190 40 260 96 330 60V330H0Z" fill="#5f8a74"/>
<!-- Misty Kroumirie mountains thick with cork oak, and a red-roofed chalet -->
<path d="M-10 136Q100 118 200 136T340 130V160Q220 156 120 164T-10 158Z" fill="#eef4f2" opacity=".85"/>
${olive(34, 138, 1.2, "#1f5440", "#a8653a")}${olive(286, 134, 1.25, "#2b6a4a", "#a8653a")}
<path d="M0 180Q80 164 160 178T330 170V330H0Z" fill="#3e8257"/>
<rect x="132" y="226" width="56" height="38" fill="#efe5cf"/><path d="M124 228l36-26 36 26Z" fill="#b8693f"/><rect x="152" y="242" width="14" height="22" fill="#6b4a2c"/>
${olive(54, 300, 1, "#245a42", "#a8653a")}${olive(270, 304, 1.05, "#1f5440", "#a8653a")}`,
    ),
  Carthage: () =>
    svg(
      "#dfe6ea",
      `${sun(70, 60, 20, "#fff6dc")}
<!-- Carthage: tall Roman columns above its old round harbour -->
<g fill="#e7dfc9"><rect x="196" y="52" width="14" height="96"/><rect x="228" y="40" width="14" height="108"/><rect x="260" y="60" width="14" height="88"/><rect x="190" y="46" width="58" height="8"/></g>
<g fill="#aab6c6"><rect x="192" y="144" width="86" height="8"/></g>
<path d="M0 150Q100 132 200 148T330 144V200H0Z" fill="#aab6c6"/>
<path d="M-10 196Q160 180 340 196V330H-10Z" fill="#3a7fa0"/>
<circle cx="160" cy="262" r="40" fill="none" stroke="#e7dfc9" stroke-width="10"/><circle cx="160" cy="262" r="12" fill="#e7dfc9"/>
${waves(220, "#9fd1d4", 4)}
<g fill="#7c8a8f"><rect x="30" y="286" width="40" height="18"/><rect x="250" y="292" width="44" height="16"/></g>`,
    ),
  Dougga: () =>
    svg(
      "#e6dfca",
      `${sun(70, 58, 20, "#fff6dc")}
<path d="M0 150Q90 96 200 120T330 112V330H0Z" fill="#b9ad8e"/>
<!-- Dougga's honey-coloured Capitol: four columns under a pediment on the hilltop -->
<g fill="#e3cfa0"><path d="M188 66l52-26 52 26Z"/><rect x="190" y="66" width="100" height="8"/><rect x="196" y="74" width="12" height="54"/><rect x="222" y="74" width="12" height="54"/><rect x="246" y="74" width="12" height="54"/><rect x="272" y="74" width="12" height="54"/><rect x="186" y="126" width="108" height="10"/></g>
${olive(46, 140, 0.9, "#6b7a32")}
<path d="M0 214Q140 198 330 216V330H0Z" fill="#9aa39a"/>
<g fill="#e7dfc9"><rect x="30" y="246" width="40" height="22"/><rect x="76" y="256" width="30" height="16"/><rect x="236" y="250" width="46" height="24"/></g>
<g fill="#7c8a8f"><rect x="44" y="290" width="34" height="16"/><rect x="250" y="292" width="38" height="16"/></g>`,
    ),
  "El Djem": () =>
    svg(
      "#ece2c8",
      `${sun(254, 56, 20, "#fff6dc")}
<!-- The great Roman amphitheatre of El Djem: stacked rows of arches -->
<path d="M0 150Q100 140 200 150T330 146V330H0Z" fill="#c9bf9f"/>
<path d="M14 150V64q66-22 132 0v86Z" fill="#e3cfa0"/>
<g fill="#a89a77"><rect x="24" y="74" width="12" height="18" rx="6"/><rect x="44" y="70" width="12" height="18" rx="6"/><rect x="64" y="68" width="12" height="18" rx="6"/><rect x="84" y="68" width="12" height="18" rx="6"/><rect x="104" y="70" width="12" height="18" rx="6"/><rect x="124" y="74" width="12" height="18" rx="6"/>
<rect x="24" y="104" width="12" height="20" rx="6"/><rect x="44" y="102" width="12" height="20" rx="6"/><rect x="64" y="100" width="12" height="20" rx="6"/><rect x="84" y="100" width="12" height="20" rx="6"/><rect x="104" y="102" width="12" height="20" rx="6"/><rect x="124" y="104" width="12" height="20" rx="6"/></g>
${olive(220, 236, 1.1, "#7a8a5a")}${olive(282, 246, 0.95, "#6b7a4a")}
<g fill="#7c8a8f"><rect x="34" y="266" width="44" height="20"/><rect x="88" y="280" width="30" height="16"/></g>`,
    ),
  Tozeur: () =>
    svg(
      "#f2d6bb",
      `${sun(70, 58, 20, "#fff1dc")}
<!-- Tozeur's patterned brick facades beside the palm oasis -->
${bricks(176, 64, 130, 86, "#c9824f", "#f0cfb0")}
<g fill="#a85e38"><path d="M196 86l10-10 10 10-10 10Z"/><path d="M226 86l10-10 10 10-10 10Z"/><path d="M256 86l10-10 10 10-10 10Z"/><path d="M286 86l10-10 10 10-10 10Z" opacity=".8"/></g>
<rect x="228" y="112" width="26" height="38" rx="13" fill="#5a2e1a"/>
${palm(46, 150, 1.1, "#3e8257")}${palm(100, 144, 0.9, "#4f9161")}
<path d="M0 150h330V330H0Z" fill="#dd9572"/>
<path d="M0 214Q140 198 330 216V330H0Z" fill="#c98258"/>
${palm(40, 300, 0.85, "#3e8257")}${palm(286, 306, 0.9, "#4f9161")}`,
    ),
  Nabeul: () =>
    svg(
      "#f1d3b6",
      `${sun(250, 58, 20, "#fff1dc")}
<!-- A potters' town: white walls, blue doors and glazed clay jars -->
<g fill="#f6efe2"><rect x="16" y="82" width="70" height="68"/><rect x="86" y="104" width="54" height="46"/></g>
<rect x="38" y="112" width="22" height="38" rx="11" fill="#2f6fa6"/><rect x="104" y="118" width="16" height="16" fill="#2f6fa6"/>
<path d="M0 150Q100 136 200 150T330 144V330H0Z" fill="#dd9572"/>
${jar(212, 128, 1.1, "#b8693f")}${jar(254, 132, 0.9, "#2f6fa6")}${jar(290, 130, 1, "#b8693f")}
<path d="M0 214Q140 198 330 216V330H0Z" fill="#c98258"/>
${jar(52, 286, 1.2, "#a85e38")}${jar(94, 292, 0.9, "#e0b35a")}${jar(240, 290, 1.1, "#a85e38")}${jar(282, 296, 0.85, "#2f6fa6")}`,
    ),
  Djerba: () =>
    svg(
      "#f2d6bb",
      `<!-- Djerba: an island potter's workshop and clay jars by a turquoise sea -->
<path d="M-10 60Q160 44 340 60V130H-10Z" fill="#5fb3c4"/>
${waves(84, "#bfe6ea", 4)}
<path d="M0 120Q100 104 200 120T330 114V330H0Z" fill="#dd9572"/>
<rect x="186" y="112" width="72" height="38" fill="#c98258"/><rect x="182" y="106" width="80" height="8" fill="#b8693f"/><rect x="212" y="126" width="20" height="24" fill="#5a2e1a"/>
${palm(286, 150, 0.95, "#3e8257")}${palm(40, 148, 0.85, "#4f9161")}
<path d="M0 214Q140 198 330 216V330H0Z" fill="#c98258"/>
${jar(50, 288, 1.15, "#b8693f")}${jar(88, 294, 0.85, "#a85e38")}${jar(236, 290, 1.2, "#b8693f")}${jar(278, 296, 0.9, "#a85e38")}`,
    ),
  Kasserine: () =>
    svg(
      "#dbe9c4",
      `<!-- High steppe pastures below Jebel Chambi, Tunisia's highest peak -->
<path d="M0 150L70 70 110 104 170 40 240 110 330 80V330H0Z" fill="#8a9a7a"/>
<path d="M152 58l18-18 18 18-8 4-10-6-10 6Z" fill="#eef1e6"/>
${pine(36, 146, 0.9, "#3e6f4f")}${pine(286, 142, 1, "#3e6f4f")}
<path d="M0 150Q100 132 200 148T330 142V330H0Z" fill="#bcd57e"/>
<path d="M0 220Q120 200 330 222V330H0Z" fill="#8bab61"/>
${sheep(62, 262, 1.1)}${sheep(250, 258, 1.15, true)}${sheep(160, 298, 1)}${sheep(290, 304, 0.8, true)}`,
    ),
  Sbeitla: () =>
    svg(
      "#d4e7c8",
      `${sun(70, 58, 20, "#fff6d4")}
<!-- Spring pasture around Sbeitla's Roman triumphal arch -->
<g fill="#e3cfa0"><path d="M188 150V66h104v84h-30v-40a22 22 0 0 0-44 0v40Z"/><rect x="182" y="58" width="116" height="10"/></g>
<path d="M0 150Q100 132 200 148T330 142V330H0Z" fill="#a9c873"/>
${roundTree(40, 140, 0.9, "#5f8f4a")}
<path d="M0 214Q140 198 330 216V330H0Z" fill="#8bab61"/>
${sheep(60, 262, 1.1)}${sheep(236, 258, 1.15, true)}${sheep(150, 300, 1)}`,
    ),
  Douz: () =>
    svg(
      "#f3d9a8",
      `${sun(250, 64, 30, "#fff0c8")}
<!-- Douz, the gate of the Sahara: a palm grove at the foot of the great dunes -->
${palm(40, 150, 1.1, "#4f7a3c")}${palm(86, 156, 0.9, "#5f8a4a")}
<path d="M-10 160Q80 120 180 156T330 136V330H-10Z" fill="#e2b273"/>
<path d="M-10 214Q120 160 330 206V330H-10Z" fill="#d39c5c"/>
<path d="M-10 266Q160 216 330 276V330H-10Z" fill="#c18648"/>
${camel(222, 196, 1.1, "#7a5432")}${camel(276, 202, 0.9, "#7a5432")}
<path d="M30 300q20-10 40 0M210 306q24-10 48 0" fill="none" stroke="#e8c088" stroke-width="3" stroke-linecap="round"/>`,
    ),
};

for (const [name, draw] of Object.entries(scenes)) {
  fs.writeFileSync(path.join(target, `${slug(name)}.svg`), draw().replace(/<!--[^>]*-->\n?/g, "").replace(/\n/g, ""));
}
console.log(`Wrote ${Object.keys(scenes).length} region scenes to ${target}`);
