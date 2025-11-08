// utils/mailer.js (Corrected for CommonJS)

const nodemailer = require("nodemailer");

const sendEmail = async ({ email, subject, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      secure: process.env.MAIL_PORT == 465, 
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"Your App Name" <${process.env.MAIL_USER}>`,
      to: email, 
      subject: subject,
      html: html,
    });

    console.log(`✅ Email sent successfully to ${email}.`);
  } catch (error) {
    console.error("❌ Error sending email via Nodemailer:", error);
    // Throw a standard Error to be consistent with your authController
    throw new Error(
      "Failed to send email. Please check server logs for details."
    );
  }
};

module.exports = sendEmail;
