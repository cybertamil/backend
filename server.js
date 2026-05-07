const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

app.use(cors());
app.use(bodyParser.json());

/* =========================
   DATABASE CONNECTION
========================= */
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "psn@123",        // change if you have password
  database: "bus"
});

db.connect((err) => {
  if (err) {
    console.log("❌ DB connection failed:", err);
  } else {
    console.log("✅ MySQL Connected Successfully");
  }
});

/* =========================
   TEST ROUTE
========================= */
app.get("/", (req, res) => {
  res.send("Bus API Running 🚍");
});


app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;

  const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";

  db.query(sql, [name, email, password], (err, result) => {
    if (err) return res.status(500).json({ message: "Register failed" });

    res.json({ message: "Register success" });
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ? AND password = ?";

  db.query(sql, [email, password], (err, result) => {
    if (err) return res.status(500).json({ message: "Login error" });

    if (result.length > 0) {
      res.json({
        message: "Login success",
        user: result[0]
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  });
});

app.post("/api/admin", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM admin WHERE email = ? AND password = ?";

  db.query(sql, [email, password], (err, result) => {
    if (err) return res.status(500).json({ message: "Login error" });

    if (result.length > 0) {
      res.json({
        message: "Login success",
        user: result[0]
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  });
});

app.get("/api/details", (req, res) => {
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

      GROUP_CONCAT(s.seat_number ORDER BY s.seat_number) AS seats

    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN booked_seats bs ON b.id = bs.booking_id
    JOIN seats s ON bs.seat_id = s.id

    GROUP BY b.id
    ORDER BY b.id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "❌ Error fetching bookings",
        error: err
      });
    }

    res.json({
      message: "✅ Booking details fetched successfully",
      count: result.length,
      bookings: result
    });
  });
});

app.post("/api/book", (req, res) => {
  const { name, phone, seats, from, to, total_amount } = req.body;

  if (!name || !phone || !seats || seats.length === 0) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  db.beginTransaction((err) => {
    if (err) return res.status(500).json(err);

    // 1️⃣ Check ONLY selected seats
    const checkSql = `
      SELECT id 
      FROM seats 
      WHERE id IN (?) AND is_booked = TRUE
      FOR UPDATE
    `;

    db.query(checkSql, [seats], (err, result) => {
      if (err) {
        return db.rollback(() => res.status(500).json(err));
      }

      if (result.length > 0) {
        return db.rollback(() =>
          res.status(400).json({
            message: "❌ Some seats are already booked"
          })
        );
      }

      // 2️⃣ Insert customer
      const customerSql =
        "INSERT INTO customers (name, phone) VALUES (?, ?)";

      db.query(customerSql, [name, phone], (err, customerResult) => {
        if (err) {
          return db.rollback(() => res.status(500).json(err));
        }

        const customerId = customerResult.insertId;

        // 3️⃣ Insert booking
        const bookingSql = `
          INSERT INTO bookings (customer_id, from_place, to_place, total_amount)
          VALUES (?, ?, ?, ?)
        `;

        db.query(
          bookingSql,
          [customerId, from, to, total_amount],
          (err, bookingResult) => {
            if (err) {
              return db.rollback(() => res.status(500).json(err));
            }

            const bookingId = bookingResult.insertId;

            // 4️⃣ Insert booked seats
            const seatValues = seats.map((seatId) => [
              bookingId,
              seatId
            ]);

            const insertSeatsSql =
              "INSERT INTO booked_seats (booking_id, seat_id) VALUES ?";

            db.query(insertSeatsSql, [seatValues], (err) => {
              if (err) {
                return db.rollback(() => res.status(500).json(err));
              }

              // 5️⃣ Mark selected seats as booked
              const updateSeatsSql = `
                UPDATE seats 
                SET is_booked = TRUE 
                WHERE id IN (?)
              `;

              db.query(updateSeatsSql, [seats], (err) => {
                if (err) {
                  return db.rollback(() => res.status(500).json(err));
                }

                // ✅ Commit transaction
                db.commit((err) => {
                  if (err) {
                    return db.rollback(() =>
                      res.status(500).json(err)
                    );
                  }

                  res.json({
                    message: "✅ Booking successful",
                    bookingId
                  });
                });
              });
            });
          }
        );
      });
    });
  });
});

app.get("/api/bus", (req, res) => {
  const busQuery = "SELECT * FROM bus_info";   
  const seatQuery = "SELECT * FROM seats";

  db.query(busQuery, (err, buses) => {
    if (err) return res.status(500).json(err);

    db.query(seatQuery, (err, seats) => {
      if (err) return res.status(500).json(err);

      res.json({
        buses,
        seats
      });
    });
  });
});

/* =========================
   START SERVER
========================= */
app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});