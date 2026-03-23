const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

const isProd = process.env.NODE_ENV === "production";

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ msg: "name, email and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters" });
    }

    const existing = await User.findByEmail(email.trim().toLowerCase());
    if (existing) {
      return res.status(409).json({ msg: "Email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    const userId = await User.create(name.trim(), email.trim().toLowerCase(), hash);

    return res.status(201).json({ msg: "User registered", userId });
  } catch (error) {
    console.error("Registration failed:", error);
    return res.status(500).json({
      msg: isProd ? "Registration failed" : error.message || "Registration failed",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ msg: "email and password are required" });
    }

    const user = await User.findByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || "dev-secret-change-me",
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({
      msg: isProd ? "Login failed" : error.message || "Login failed",
    });
  }
};
