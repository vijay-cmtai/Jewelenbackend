require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const orderRoutes = require("./routes/orderRoutes");
const addressRoutes = require("./routes/addressRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const userdashboardRoutes = require("./routes/userDashboardRoutes");
const blogRoutes = require("./routes/blogRoutes");

const http = require("http");
const { Server } = require("socket.io");
const { startInventorySync } = require("./cron/scheduler");

connectDB();

const app = express();
const server = http.createServer(app);

// ✅ Allow both localhost & Vercel
const allowedOrigins = [
  "http://localhost:3000",
  "https://jewelen.vercel.app",
];

// ✅ Dynamic CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

// ✅ Apply CORS
app.use(cors(corsOptions));

// ✅ Extra headers for safety
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin,X-Requested-With,Content-Type,Accept,Authorization"
  );
  next();
});

// ✅ Middleware
app.use(express.json());
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ✅ Socket.io setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});
app.set("socketio", io);

// ✅ Base route
app.get("/", (req, res) => {
  res.json({ message: "✅ Jewelen Backend API running successfully 🚀" });
});

// ✅ API routes
app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/user-dashboard", userdashboardRoutes);
app.use("/api/blogs", blogRoutes);

// ✅ Socket.io events
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ✅ Cron job
startInventorySync(io);

// ✅ Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
