const os = require("node:os");

// Virtual adapters (WSL, Hyper-V, VPNs, VMs, Docker) are listed after the real
// Wi-Fi or Ethernet address, so the first address is the one to type on a TV.
const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|docker|vpn|tailscale|zerotier|loopback/i;
const rank = ({ name, address }) =>
  (VIRTUAL.test(name) ? 10 : 0) +
  (address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : 2);

function lanAddresses() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) => (entries || []).map((entry) => ({ name, ...entry })))
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .sort((a, b) => rank(a) - rank(b))
    .map((entry) => entry.address);
}

module.exports = { lanAddresses };
