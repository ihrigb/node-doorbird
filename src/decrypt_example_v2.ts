import * as chacha from "chacha-js";

const encryptionKey = Buffer.from('BHYGHyRKtGzBjku2t2jX2UKidXYQ3VqmfbKoCtxXJ6O4lgSzpgIwZ6onrSh', 'utf-8');

const msg = Buffer.from([
  0xDE, 0xAD, 0xBE, 0x02, 0x96, 0x13, 0x80, 0xD4, 0x62, 0x2E, 0xBE, 0xE7, 0x2A, 0x9F, 0xC3, 0xFF,
  0x0B, 0xEF, 0x62, 0x64, 0xF2, 0xAE, 0x91, 0x94, 0x92, 0x14, 0x8B, 0xBD, 0x30, 0xEB, 0x05, 0xBD,
  0xCE, 0x36, 0x7C, 0x33, 0xD4, 0x29, 0x3F, 0xAF, 0xE0, 0x60, 0x45, 0x9E, 0x65, 0x10
]);

const identifier = msg.subarray(0, 3);
const version = msg.subarray(3, 4);
const nonce = msg.subarray(4, 12);
const ciphertext = msg.subarray(12, 46);

console.log("Identifier:", identifier.toString('base64'));
console.log("Version:", version[0]);
console.log("Nonce:", nonce);

const decipher = chacha.AeadLegacy(encryptionKey, nonce, true);
const result = decipher.update(ciphertext);
console.log("Deciphered:", result);

const intercomId = result.subarray(0, 6);
const event = result.subarray(6, 14);
const timestamp = result.subarray(14, 18);

console.log("IntercomId:", intercomId.toString("utf-8"));
console.log("Event:", event.toString("utf-8"));
const date = new Date(0);
date.setUTCSeconds(timestamp.readInt32BE());
console.log("Timestamp:", date);
