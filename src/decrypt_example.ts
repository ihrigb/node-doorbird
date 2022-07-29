import libsodium from 'libsodium-wrappers';
import * as chacha from "chacha-js";

const argonKeyLength = 32;
const username = 'foobar0001';
const password = 'QzT3jeK3JY';

const strech = async (salt: Buffer, opslimit: Buffer, memlimit: Buffer) => {
    await libsodium.ready;
    const sodium = libsodium;
    const streched = Buffer.from(
      sodium.crypto_pwhash(
        argonKeyLength,
        password.substring(0, 5),
        salt,
        opslimit.readInt32BE(),
        memlimit.readInt32BE(),
        sodium.crypto_pwhash_ALG_ARGON2I13
      )
    );
    return streched;
  };

const msg = Buffer.from([
    0xDE, 0xAD, 0xBE, 0x01, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x20, 0x00, 0x77, 0x35, 0x36, 0xDC,
    0xC3, 0x0E, 0x2E, 0x84, 0x7E, 0x0E, 0x75, 0x29, 0xE2, 0x34, 0x60, 0xCF, 0xE3, 0xFF, 0xCC, 0x52,
    0x3F, 0x37, 0xB2, 0xF2, 0xDC, 0x1A, 0x71, 0x80, 0xF2, 0x9B, 0x2E, 0xA0, 0x27, 0xA9, 0x82, 0x41,
    0x9C, 0xCE, 0x45, 0x9D, 0x27, 0x45, 0x2E, 0x42, 0x14, 0xBE, 0x9C, 0x74, 0xE9, 0x33, 0x3A, 0x21,
    0xDB, 0x10, 0x78, 0xB9, 0xF6, 0x7B
]);

const identifier = msg.slice(0, 3);
const version = msg.slice(3, 4);
const opslimit = msg.slice(4, 8);
const memlimit = msg.slice(8, 12);
const salt = msg.slice(12, 28);
const nonce = msg.slice(28, 36);
const ciphertext = msg.slice(36, 70);

console.log("Identifier:", identifier.toString('base64'));
console.log("Version:", version[0]);

strech(salt, opslimit, memlimit).then(streched => {
    console.log("Streched:", streched);

    const decipher = chacha.AeadLegacy(streched, nonce, true);
    const result = decipher.update(ciphertext);
    console.log("Deciphered:", result);
    
    const intercomId = result.slice(0, 6);
    const event = result.slice(6, 14);
    const timestamp = result.slice(14, 18);

    console.log("IntercomId:", intercomId.toString("utf-8"));
    console.log("Event:", event.toString("utf-8"));
    let date = new Date(0);
    date.setUTCSeconds(timestamp.readInt32BE());
    console.log("Timestamp:", date);
});
