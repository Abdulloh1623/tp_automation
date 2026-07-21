// Backup shifrlash — Telegramga yuboriladigan nusxa uchun.
//
// NEGA: `createBackup` to'liq `pg_dump` ni gzip qilib Telegram kanaliga
// yuboradi. Gzip — siqish, shifr EMAS. Dump ichida barcha mijozlar PII'si
// (ism, telefon, shartnoma, to'lov tarixi) va `User` jadvali (bcrypt hash'lar)
// bor. Shifrlanmasa, butun bazaning maxfiyligi ikki narsaga bog'lanib qoladi:
// kanalning yopiqligi va TELEGRAM_BOT_TOKEN ning sirligi. Token sizsa,
// hujumchi getUpdates/getFile orqali barcha eski dump'larni yuklab oladi.
//
// Format (bitta fayl):
//   "TPBK1"  (5 bayt magic)
//   salt     (16 bayt)   — scrypt uchun, har backupda yangi
//   iv       (12 bayt)   — AES-GCM nonce
//   authTag  (16 bayt)   — butunlik tekshiruvi
//   ciphertext           — qolgani
//
// Kalit `BACKUP_ENCRYPTION_KEY` (parol-ibora) dan scrypt bilan olinadi.
// MUHIM: bu qiymatni serverdagi `.env` da SAQLAMANG — aks holda serverga
// kirgan hujumchi ham dump'ni, ham kalitni oladi. Uni alohida joyda
// (parol menejeri) saqlang va faqat backup jarayoniga bering.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const MAGIC = Buffer.from("TPBK1", "utf8");
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

/** Shifrlash yoqilganmi (kalit berilganmi)? */
export function backupEncryptionEnabled(
  key: string | undefined = process.env.BACKUP_ENCRYPTION_KEY,
): boolean {
  return !!key && key.trim().length >= 12;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  // scrypt — parol-iboradan kalit; N=2^15 sekundning bir qismini oladi,
  // backup kuniga bir marta bo'lgani uchun bu qimmat emas.
  // `maxmem` ni ANIQ berish shart: N=32768, r=8 uchun 128*N*r = 32MB kerak,
  // Node'ning standart chegarasi esa aynan 32MB — busiz "memory limit
  // exceeded" xatosi chiqadi (test bilan qulflangan).
  return scryptSync(passphrase.trim(), salt, KEY_LEN, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}

/** AES-256-GCM bilan shifrlaydi. Kalit bo'lmasa xato beradi. */
export function encryptBackup(data: Buffer, passphrase: string): Buffer {
  if (!backupEncryptionEnabled(passphrase)) {
    throw new Error("BACKUP_ENCRYPTION_KEY kamida 12 belgi bo'lishi kerak");
  }
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}

/** Shifrlangan backupni ochadi. Kalit noto'g'ri bo'lsa xato beradi (GCM tag). */
export function decryptBackup(blob: Buffer, passphrase: string): Buffer {
  const head = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN;
  if (blob.length < head || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Bu fayl TP backup shifri emas (magic mos kelmadi)");
  }
  let o = MAGIC.length;
  const salt = blob.subarray(o, (o += SALT_LEN));
  const iv = blob.subarray(o, (o += IV_LEN));
  const tag = blob.subarray(o, (o += TAG_LEN));
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(o)), decipher.final()]);
}
