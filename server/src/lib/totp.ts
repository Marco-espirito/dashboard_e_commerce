import { authenticator } from "otplib";
import QRCode from "qrcode";

// Tolérance d'une fenêtre (±30 s) pour absorber un léger décalage d'horloge
// entre le serveur et l'app d'authentification du téléphone.
authenticator.options = { window: 1 };

/** Nom affiché dans l'app d'authentification (Google Authenticator, etc.). */
const ISSUER = "E-Shop Admin";

/** Génère un nouveau secret TOTP (base32). */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** URL otpauth:// à encoder dans un QR code, liée au compte de l'utilisateur. */
export function buildOtpAuthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

/** Génère une image QR code (data URL PNG) à partir d'une URL otpauth. */
export function buildQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

/** Vérifie qu'un code à 6 chiffres correspond au secret. */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
