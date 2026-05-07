const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

app.use(cors());
app.use(bodyParser.json());

/* =========================
   DATABASE CONNECTION
========================= */
const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   family: 4, // 👈 forces IPv4
// });
  host: "db.bgkyntihxncuelwmqnut.supabase.co",
  port: 5432,
  user: "postgres",
  password: "DeEpakMURugan",
  database: "postgres",
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(() => {
    console.log("✅ PostgreSQL Connected Successfully");
  })
  .catch((err) => {
    console.log("❌ DB connection failed:", err);
  });

/* =========================
   TEST ROUTE
========================= */

app.get("/", (req, res) => {
  res.send("Bus API Running 🚍");
});

/* =========================
   USER REGISTER
========================= */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const sql = `
      INSERT INTO users (name, email, password)
      VALUES ($1, $2, $3)
    `;

    await pool.query(sql, [name, email, password]);

    res.json({ message: "Register success" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Register failed" });
  }
});

/* =========================
   USER LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const sql = `
      SELECT * FROM users
      WHERE email = $1 AND password = $2
    `;

    const result = await pool.query(sql, [email, password]);

    if (result.rows.length > 0) {
      res.json({
        message: "Login success",
        user: result.rows[0]
      });
    } else {
      res.status(401).json({
        message: "Invalid credentials"
      });
    }

  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Login error"
    });
  }
});

/* =========================
   ADMIN LOGIN
========================= */

app.post("/api/admin", async (req, res) => {
  try {
    const { email, password } = req.body;

    const sql = `
      SELECT * FROM admin
      WHERE email = $1 AND password = $2
    `;

    const result = await pool.query(sql, [email, password]);

    if (result.rows.length > 0) {
      res.json({
        message: "Login success",
        user: result.rows[0]
      });
    } else {
      res.status(401).json({
        message: "Invalid credentials"
      });
    }

  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "Login error"
    });
  }
});

/* =========================
   BOOKING DETAILS
========================= */

app.get("/api/details", async (req, res) => {
  try {
    const sql = `
      SELECT 
        b.id AS booking_id,
        b.from_place,
        b.to_place,
        b.total_amount,
        b.created_at,

        c.id AS customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,

        STRING_AGG(
          s.seat_number::TEXT,
          ', ' ORDER BY s.seat_number
        ) AS seats

      FROM bookings b

      JOIN customers c
        ON b.customer_id = c.id

      JOIN booked_seats bs
        ON b.id = bs.booking_id

      JOIN seats s
        ON bs.seat_id = s.id

      GROUP BY b.id, c.id

      ORDER BY b.id DESC
    `;

    const result = await pool.query(sql);

    res.json({
      message: "✅ Booking details fetched successfully",
      count: result.rows.length,
      bookings: result.rows
    });

  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: "❌ Error fetching bookings",
      error: err
    });
  }
});

/* =========================
   BOOK SEATS
========================= */

app.post("/api/book", async (req, res) => {
  const client = await pool.connect();

  try {
    const { name, phone, seats, from, to, total_amount } = req.body;

    if (!name || !phone || !seats || seats.length === 0) {
      return res.status(400).json({
        message: "Missing required fields"
      });
    }

    await client.query("BEGIN");

    // 1️⃣ Check selected seats
    const checkSql = `
      SELECT id
      FROM seats
      WHERE id = ANY($1)
      AND is_booked = TRUE
      FOR UPDATE
    `;

    const checkResult = await client.query(checkSql, [seats]);

    if (checkResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "❌ Some seats are already booked"
      });
    }

    // 2️⃣ Insert customer
    const customerSql = `
      INSERT INTO customers (name, phone)
      VALUES ($1, $2)
      RETURNING id
    `;

    const customerResult = await client.query(customerSql, [
      name,
      phone
    ]);

    const customerId = customerResult.rows[0].id;

    // 3️⃣ Insert booking
    const bookingSql = `
      INSERT INTO bookings (
        customer_id,
        from_place,
        to_place,
        total_amount
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const bookingResult = await client.query(bookingSql, [
      customerId,
      from,
      to,
      total_amount
    ]);

    const bookingId = bookingResult.rows[0].id;

    // 4️⃣ Insert booked seats
    for (const seatId of seats) {
      await client.query(
        `
        INSERT INTO booked_seats (
          booking_id,
          seat_id
        )
        VALUES ($1, $2)
        `,
        [bookingId, seatId]
      );
    }

    // 5️⃣ Update seats
    const updateSeatsSql = `
      UPDATE seats
      SET is_booked = TRUE
      WHERE id = ANY($1)
    `;

    await client.query(updateSeatsSql, [seats]);

    await client.query("COMMIT");

    res.json({
      message: "✅ Booking successful",
      bookingId
    });

  } catch (err) {
    await client.query("ROLLBACK");

    console.log(err);

    res.status(500).json({
      message: "Booking failed",
      error: err
    });

  } finally {
    client.release();
  }
});

/* =========================
   BUS + SEATS
========================= */

app.get("/api/bus", async (req, res) => {
  try {
    const busQuery = `SELECT * FROM bus_info`;
    const seatQuery = `SELECT * FROM seats`;

    const buses = await pool.query(busQuery);
    const seats = await pool.query(seatQuery);

    res.json({
      buses: buses.rows,
      seats: seats.rows
    });

  } catch (err) {
    console.log(err);

    res.status(500).json(err);
  }
});

/* =========================
   START SERVER
========================= */

app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});