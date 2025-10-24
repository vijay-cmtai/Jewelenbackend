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
const userDashboardRoutes = require("./routes/userDashboardRoutes");

const http = require("http");
const { Server } = require("socket.io");
const { startInventorySync } = require("./cron/scheduler");
const blogRoutes = require("./routes/blogRoutes");

connectDB();

const app = express();
const server = http.createServer(app);

// ✅ Allow both local and deployed frontend origins
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://jewelen.vercel.app"
  ],
  credentials: true,
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: corsOptions,
});

app.set("socketio", io);
app.use(express.json());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.get("/", (req, res) => {
  res.json({ message: "API server is running..." });
});

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/user-dashboard", userDashboardRoutes);
app.use("/api/blogs", blogRoutes);

// ✅ Socket.io connection
io.on("connection", (socket) => {
  console.log("✅ A new user connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

// ✅ Start inventory sync
startInventorySync(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}.`);
});
