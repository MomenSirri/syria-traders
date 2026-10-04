const fs = require("fs");
const path = require("path");
const selfsigned = require("selfsigned");

const CERT_DIR = path.join(__dirname, "../../../certs");
const KEY_FILE = "dev-key.pem";
const CERT_FILE = "dev-cert.pem";

function getCertificatePaths() {
  return {
    keyPath: path.join(CERT_DIR, KEY_FILE),
    certPath: path.join(CERT_DIR, CERT_FILE),
  };
}

function ensureDevCertificates() {
  const { keyPath, certPath } = getCertificatePaths();

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { keyPath, certPath };
  }

  fs.mkdirSync(CERT_DIR, { recursive: true });

  const attrs = [{ name: "commonName", value: "localhost" }];
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ],
  });

  fs.writeFileSync(keyPath, pems.private, "utf8");
  fs.writeFileSync(certPath, pems.cert, "utf8");

  return { keyPath, certPath };
}

module.exports = {
  ensureDevCertificates,
  getCertificatePaths,
};
