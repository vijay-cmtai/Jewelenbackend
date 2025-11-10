// File: controllers/authController.js

const User = require("../models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const sendEmail = require("../utils/mailer");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Name, email, and password are required.");
  }

  const existingUser = await User.findOne({ email });
  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  const emailHtml = `
    <div style="font-family: sans-serif; text-align: center; padding: 20px;">
      <h2>Welcome to Jewelen!</h2>
      <p>Hi ${name}, thank you for registering. Please use the following OTP to verify your email.</p>
      <p style="font-size: 24px; font-weight: bold;">${otp}</p>
      <p>This OTP is valid for 10 minutes.</p>
    </div>
  `;

  if (existingUser) {
    if (existingUser.isVerified) {
      res.status(409);
      throw new Error("User with this email is already registered.");
    }
    existingUser.name = name;
    existingUser.password = password;
    existingUser.otp = otp;
    existingUser.otpExpiry = otpExpiry;
    await existingUser.save();

    await sendEmail({
      email,
      subject: "Verify Your Email Address",
      html: emailHtml,
    });

    return res.status(200).json({
      success: true,
      message: `An OTP has been re-sent to ${email}. Please verify.`,
    });
  }

  // ✅ YAHAN LOGIC CHANGE KIYA GAYA HAI
  const userData = {
    name,
    email,
    password,
    role: role || "User",
    otp,
    otpExpiry,
    isVerified: false,
    // Sirf Supplier ka status 'Pending' rahega
    status: role === "Supplier" ? "Pending" : "Approved",
  };

  if (req.file) {
    userData.profilePicture = {
      public_id: req.file.filename,
      url: req.file.path,
    };
  }

  await User.create(userData);
  await sendEmail({
    email,
    subject: "Verify Your Email Address",
    html: emailHtml,
  });

  // ✅ MESSAGE LOGIC BHI UPDATE KIYA GAYA HAI
  let message;
  if (role === "Supplier") {
    message = `Supplier account request sent! An OTP has been sent to ${email}.`;
  } else {
    message = `Registration successful. An OTP has been sent to ${email}. Please verify.`;
  }

  res.status(201).json({ success: true, message });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and OTP are required.");
  }

  const user = await User.findOne({
    email,
    otp,
    otpExpiry: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  // ✅ YAHAN BHI SIRF SUPPLIER KE LIYE CHECK LAGEGA
  if (user.role === "Supplier" && user.status !== "Approved") {
    return res.status(200).json({
      success: true,
      message: `Email verified successfully. Your Supplier account is pending approval by an administrator.`,
    });
  }

  // Admin aur User ko turant token mil jaayega
  res.status(200).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id),
    message: "Email verified successfully. You are now logged in.",
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  if (!user.isVerified) {
    res.status(403);
    throw new Error("Account not verified. Please verify your email first.");
  }

  if (user.status !== "Approved") {
    res.status(403);
    throw new Error(
      `Your account is currently ${user.status}. Please wait for admin approval.`
    );
  }

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id),
  });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error("There is no user with that email address.");
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.forgotPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.forgotPasswordExpiry = Date.now() + 10 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Password Reset Request</h2>
      <p>You requested a password reset. Please click this link to reset your password:</p>
      <a href="${resetUrl}" style="color: blue;">${resetUrl}</a>
      <p>This link is valid for 10 minutes.</p>
    </div>
  `;

  try {
    await sendEmail({
      email: user.email,
      subject: "Password Reset Request",
      html,
    });
    res.status(200).json({
      success: true,
      message: "Password reset link sent to your email!",
    });
  } catch (err) {
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;
    await user.save({ validateBeforeSave: false });
    res.status(500);
    throw new Error("Email could not be sent. Please try again.");
  }
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    res.status(400);
    throw new Error("Password is required.");
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    forgotPasswordToken: hashedToken,
    forgotPasswordExpiry: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error("Token is invalid or has expired.");
  }

  user.password = password;
  user.forgotPasswordToken = undefined;
  user.forgotPasswordExpiry = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password has been reset successfully.",
    token: generateToken(user._id),
  });
});

exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json(req.user);
});

exports.getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 });
  res.status(200).json(users);
});

exports.getUserDetailsById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  res.status(200).json(user);
});

exports.updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  delete req.body.password;
  const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).select("-password");
  res.status(200).json(updatedUser);
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  await user.deleteOne();
  res
    .status(200)
    .json({ message: "User deleted successfully", userId: req.params.id });
});
