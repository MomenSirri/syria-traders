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
};

for (const [name, draw] of Object.entries(scenes)) {
  fs.writeFileSync(path.join(target, `${slug(name)}.svg`), draw().replace(/<!--[^>]*-->\n?/g, "").replace(/\n/g, ""));
}
console.log(`Wrote ${Object.keys(scenes).length} region scenes to ${target}`);
