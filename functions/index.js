const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {Resend} = require("resend");

initializeApp();

const resendApiKey = defineSecret("RESEND_API_KEY");
const verifyEmailFrom = defineSecret("VERIFY_EMAIL_FROM");

const APP_NAME = "SehatAI";
const CONTINUE_URL = "https://health-monitoring-system-fff52.web.app";

const buildVerificationEmailHtml = ({displayName, verificationLink}) => `
  <div style="margin:0;padding:24px;background:#f5f8f6;font-family:Arial,sans-serif;color:#163029;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dce9e3;border-radius:20px;overflow:hidden;">
      <div style="padding:24px 24px 10px;background:linear-gradient(135deg,#0f8f61,#1f6d53);color:#ffffff;">
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">${APP_NAME}</div>
        <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Verifikasi email Anda</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Halo ${displayName},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
          Klik tombol di bawah ini untuk mengaktifkan akun Anda dan melanjutkan ke dashboard kesehatan.
        </p>
        <div style="margin:24px 0;">
          <a href="${verificationLink}" style="display:inline-block;padding:14px 22px;background:#0f8f61;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;">
            Verifikasi Email
          </a>
        </div>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#48645c;">
          Jika tombol tidak bisa dibuka, gunakan tautan ini:
        </p>
        <p style="margin:0 0 16px;font-size:13px;line-height:1.7;word-break:break-all;color:#0f8f61;">
          <a href="${verificationLink}" style="color:#0f8f61;">${verificationLink}</a>
        </p>
        <p style="margin:0;font-size:13px;line-height:1.7;color:#6a8179;">
          Jika Anda tidak merasa membuat akun ini, email ini bisa diabaikan.
        </p>
      </div>
    </div>
  </div>
`;

exports.sendCustomVerificationEmail = onCall(
  {
    region: "us-central1",
    secrets: [resendApiKey, verifyEmailFrom],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Anda harus login untuk meminta email verifikasi.");
    }

    const sender = verifyEmailFrom.value();
    const apiKey = resendApiKey.value();

    if (!sender || !apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "RESEND_API_KEY atau VERIFY_EMAIL_FROM belum disetel di Firebase Functions."
      );
    }

    const user = await getAuth().getUser(request.auth.uid);

    if (!user.email) {
      throw new HttpsError("failed-precondition", "Akun ini belum memiliki alamat email.");
    }

    if (user.emailVerified) {
      return {ok: true, alreadyVerified: true, provider: "resend"};
    }

    const verificationLink = await getAuth().generateEmailVerificationLink(user.email, {
      url: CONTINUE_URL,
      handleCodeInApp: false,
    });

    const resend = new Resend(apiKey);
    const displayName = user.displayName || request.data?.displayName || user.email.split("@")[0];
    const emailResponse = await resend.emails.send({
      from: sender,
      to: user.email,
      subject: `Verifikasi email Anda untuk ${APP_NAME}`,
      html: buildVerificationEmailHtml({
        displayName,
        verificationLink,
      }),
    });

    if (emailResponse.error) {
      throw new HttpsError("internal", emailResponse.error.message || "Resend gagal mengirim email.");
    }

    return {
      ok: true,
      provider: "resend",
      alreadyVerified: false,
    };
  }
);
