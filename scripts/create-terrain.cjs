// Original vector terrain, generated locally with no external image requests.
const fs = require("node:fs");
const path = require("node:path");
const target = path.join(__dirname, "../client/public/terrain");
fs.mkdirSync(target, { recursive: true });
const scenes = {
  wheat: {
    sky: "#ecdaa1",
    ground: "#b5ad63",
    art: `<path d="M0 175Q90 100 180 170T360 160V320H0" fill="#c7bd77"/><path d="M0 235Q150 150 320 220V320H0" fill="#a5a465"/><path d="M0 260Q160 200 320 240M0 286Q160 226 320 266M0 310Q160 252 320 292" fill="none" stroke="#e5d394" stroke-width="9"/><path d="M0 200Q120 170 150 235T320 270" fill="none" stroke="#729e9c" stroke-width="17"/><g transform="translate(240 123)" fill="none" stroke="#886b45" stroke-width="7"><circle r="42"/><circle r="34"/><path d="M0-42V42M-42 0H42M-30-30L30 30M-30 30L30-30"/></g><path d="M200 180V144h80v36" fill="#c9ae75"/>`,
  },
  wood: {
    sky: "#a5b9a1",
    ground: "#3e7364",
    art: `<path d="M0 145L70 73 140 127 216 46 320 133V320H0" fill="#668c75"/><path d="M0 245Q160 166 320 224V320H0" fill="#345e52"/>${[30, 90, 158, 235, 286].map((x, i) => `<g transform="translate(${x},${115 + (i % 2) * 70})"><path d="M0-72L-30-24H-19L-43 18H-26L-48 57H48L26 18H43L19-24H30Z" fill="${i % 2 ? "#315e51" : "#487a5d"}" stroke="#abc1a0" stroke-width="2"/><path d="M0 35V87" stroke="#b7b091" stroke-width="7"/></g>`).join("")}`,
  },
  stone: {
    sky: "#c6d4d0",
    ground: "#a2aba2",
    art: `<path d="M-40 265L88 54 185 254" fill="#87988e"/><path d="M72 252L206 38 365 275" fill="#6b8580"/><path d="M206 38L153 124 207 104 245 127Z" fill="#e5e1c9"/><path d="M88 54L50 117 88 104 127 125Z" fill="#e2dbc3"/><path d="M0 274Q150 223 320 265V320H0" fill="#b9b699"/>${[55, 106, 157, 208].map((x) => `<path d="M${x} 254V187h21v67M${x - 5} 181h31M${x - 5} 259h31" fill="#d2c5a4" stroke="#958c75" stroke-width="5"/>`).join("")}<path d="M47 174H242L157 140Z" fill="#ded1af" stroke="#958c75" stroke-width="4"/>`,
  },
  brick: {
    sky: "#e8c5a7",
    ground: "#b66d4f",
    art: `<path d="M0 210H320V320H0" fill="#bf8b69"/>${[12, 70, 142, 220, 278].map((x, i) => `<g><path d="M${x} 254V${125 + (i % 2) * 30}h55v${129 - (i % 2) * 30}Z" fill="${i % 2 ? "#c39b75" : "#d3ac83"}" stroke="#947557" stroke-width="3"/><path d="M${x + 10} 164h12v20h-12M${x + 32} 164h12v20h-12" fill="#7f8270"/></g>`).join("")}<path d="M74 300V205Q160 105 246 205V300H213V209Q160 153 107 209V300Z" fill="#d9b88f" stroke="#976b50" stroke-width="6"/><path d="M109 300V211Q160 160 211 211V300Z" fill="#715e49"/><path d="M114 227h92M130 207v91M155 185v115M181 203v96" stroke="#a18c6d" stroke-width="4"/>`,
  },
  sheep: {
    sky: "#d7dfbc",
    ground: "#9cad73",
    art: `<path d="M0 155Q100 89 210 167T360 145V320H0" fill="#b9c294"/><path d="M0 243Q150 129 320 216V320H0" fill="#869e72"/><path d="M0 289Q160 232 320 274V320H0" fill="#617d58"/>${[
      [56, 211],
      [231, 158],
      [157, 266],
    ]
      .map(
        ([x, y]) =>
          `<g transform="translate(${x},${y})"><path d="M-13 15v14M13 15v14" stroke="#746b50" stroke-width="6"/><ellipse rx="27" ry="19" fill="#f4edd7"/><circle cx="-18" cy="-4" r="15" fill="#f4edd7"/><ellipse cx="27" cy="5" rx="10" ry="13" fill="#6c6b57"/></g>`,
      )
      .join("")}`,
  },
  desert: {
    sky: "#efd2a0",
    ground: "#cd9b66",
    art: `<circle cx="226" cy="75" r="34" fill="#f6e1af"/><path d="M0 183Q120 74 320 183V320H0" fill="#d5ac71"/><path d="M0 218Q185 151 320 114V320H0" fill="#e6c18a"/><path d="M0 260Q156 133 320 282V320H0" fill="#bc8c58"/><path d="M0 299Q170 214 320 243V320H0" fill="#d4a66c"/><path d="M32 262Q149 197 296 265M48 286Q158 229 301 280" fill="none" stroke="#eed3a2" stroke-width="3" opacity=".4"/>`,
  },
};
for (const [name, scene] of Object.entries(scenes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><defs><pattern id="grain" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".8" fill="#4f4936" opacity=".12"/><circle cx="8" cy="9" r=".8" fill="#fff7d9" opacity=".3"/></pattern></defs><rect width="320" height="320" fill="${scene.sky}"/><rect y="180" width="320" height="140" fill="${scene.ground}"/>${scene.art}<rect width="320" height="320" fill="url(#grain)"/></svg>`;
  fs.writeFileSync(path.join(target, `${name}.svg`), svg);
}
