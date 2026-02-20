/**
 * パスワード暗号化/復号ユーティリティ
 * AES-256-GCM を使用
 *
 * フォーマット: "enc_v1:<iv_base64>:<ciphertext_base64>:<tag_base64>"
 * - バージョニング可能な形式
 * - iv: 12バイト（GCM推奨）
 * - tag: 16バイト（認証タグ）
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM推奨
const TAG_LENGTH = 16;
const VERSION = 'enc_v1';

/**
 * 暗号化キーを取得（32バイト）
 * 環境変数から読み込み、base64またはhexでデコード
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!keyString) {
    throw new Error('Encryption configuration error');
  }

  let keyBuffer: Buffer;

  // base64またはhexを試行
  if (keyString.length === 64) {
    // hex: 64文字 = 32バイト
    keyBuffer = Buffer.from(keyString, 'hex');
  } else {
    // base64
    keyBuffer = Buffer.from(keyString, 'base64');
  }

  if (keyBuffer.length !== 32) {
    throw new Error('Encryption configuration error');
  }

  return keyBuffer;
}

/**
 * パスワードを暗号化
 * @param plaintext 平文パスワード
 * @returns 暗号化文字列 "enc_v1:<iv>:<ciphertext>:<tag>"
 */
export function encryptPassword(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Invalid input');
  }

  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const tag = cipher.getAuthTag();

    // フォーマット: "enc_v1:<iv>:<ciphertext>:<tag>"
    return `${VERSION}:${iv.toString('base64')}:${ciphertext}:${tag.toString('base64')}`;
  } catch {
    // エラーメッセージに機密情報を含めない
    throw new Error('Encryption failed');
  }
}

/**
 * パスワードを復号
 * @param encrypted 暗号化文字列
 * @returns 平文パスワード
 */
export function decryptPassword(encrypted: string): string {
  if (!encrypted) {
    throw new Error('Invalid input');
  }

  try {
    const parts = encrypted.split(':');

    if (parts.length !== 4) {
      throw new Error('Decryption failed');
    }

    const [version, ivBase64, ciphertextBase64, tagBase64] = parts;

    if (version !== VERSION) {
      throw new Error('Decryption failed');
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const ciphertext = Buffer.from(ciphertextBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');

    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      throw new Error('Decryption failed');
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(ciphertext, undefined, 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch {
    // エラーメッセージに機密情報を含めない
    throw new Error('Decryption failed');
  }
}

/**
 * 暗号化済みかどうかを判定
 * @param value パスワード値
 * @returns 暗号化済みならtrue
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

/**
 * パスワードを安全に取得（復号または平文を返す）
 * - 暗号化済み → 復号して返す
 * - 平文 → そのまま返す（lazy migration用）
 *
 * @param passwordEncrypted 暗号化パスワード（nullable）
 * @param passwordPlain 平文パスワード（nullable、移行期間用）
 * @returns 復号されたパスワード
 */
export function getPlainPassword(
  passwordEncrypted: string | null,
  passwordPlain: string | null
): string | null {
  // 暗号化パスワードが存在する場合
  if (passwordEncrypted) {
    if (isEncrypted(passwordEncrypted)) {
      return decryptPassword(passwordEncrypted);
    }
    // 暗号化フォーマットでない場合はそのまま返す（設定ミスへの対応）
    return passwordEncrypted;
  }

  // 旧平文パスワードを返す（移行期間）
  return passwordPlain;
}
