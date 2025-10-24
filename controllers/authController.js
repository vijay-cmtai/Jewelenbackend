const User = require("../models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// --- AUTHENTICATION ---
exports.register = asyncHandler(async (req, res) => {
  const { role, name, email, password, ...businessData } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400);
    throw new Error("Name, email, password, and role are required.");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(400);
    throw new Error("An account with this email already exists.");
  }

  const userData = {
    name,
    email,
    password,
    role,
    status: role === "Admin" ? "Approved" : "Pending",
    ...businessData,
  };

  if (req.file) {
    userData.businessDocument = {
      public_id: req.file.filename,
      url: req.file.path,
    };
  }

  await User.create(userData);

  res.status(201).json({
    message:
      role === "Admin"
        ? "Admin registered successfully!"
        : "Registration request submitted. Waiting for admin approval.",
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  if (user.status !== "Approved") {
    res.status(403);
    throw new Error(`Your account is currently ${user.status}.`);
  }

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id),
  });
});

exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json(req.user);
});

// --- USER MANAGEMENT (ADMIN) ---
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
