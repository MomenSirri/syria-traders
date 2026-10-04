const { ensureDevCertificates } = require("../utils/certificates");

const paths = ensureDevCertificates();
console.log("Development certificates are ready:");
console.log(`- Key: ${paths.keyPath}`);
console.log(`- Cert: ${paths.certPath}`);
