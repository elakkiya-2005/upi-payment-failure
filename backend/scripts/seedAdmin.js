// Creates or resets the administrator account.
//
//   node scripts/seedAdmin.js [email] [password] [name]
//   npm run seed:admin -- [email] [password]
//
// Defaults: the first address in ADMIN_EMAILS (.env) and the password
// "Admin@123". The password is hashed with bcrypt, exactly like the
// /api/auth/register endpoint, and the role is always "admin".

const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", ".env"),
});

const db = require(path.join(__dirname, "..", "db"));
const auth = require(path.join(__dirname, "..", "auth"));
const { ensureSchema } = require(path.join(__dirname, "..", "schema"));

const email = String(
    process.argv[2] ||
        String(process.env.ADMIN_EMAILS || "").split(",")[0] ||
        "admin@example.com"
)
    .trim()
    .toLowerCase();

const password = String(process.argv[3] || "Admin@123");

const name = String(process.argv[4] || "Administrator");

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("❌ Invalid email address:", email);
    process.exit(1);
}

if (password.length < 6) {
    console.error("❌ Password must be at least 6 characters.");
    process.exit(1);
}

const fail = (message, error) => {
    console.error("❌", message, error ? error.message || error : "");
    process.exit(1);
};

ensureSchema()
    .then(() => auth.hashPassword(password))
    .then(({ salt, hash }) => {
        db.query(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [email],
            (findErr, rows) => {
                if (findErr) fail("Could not read the users table:", findErr);

                const report = (id, action) => {
                    console.log("✅ Admin account", action);
                    console.log("   email:    " + email);
                    console.log("   password: " + password);
                    console.log("   role:     admin");
                    console.log("   user id:  " + id);
                    console.log(
                        "\n   Sign in at http://localhost:3000/admin/login"
                    );

                    const listed = String(process.env.ADMIN_EMAILS || "")
                        .split(",")
                        .map((value) => value.trim().toLowerCase())
                        .filter(Boolean);

                    if (!listed.includes(email)) {
                        console.log(
                            "\n   ⚠ note: this address is not in ADMIN_EMAILS" +
                                " in .env, so new signups with it would get role" +
                                " 'user'. This row is set to admin directly."
                        );
                    }

                    db.end();
                };

                if (rows && rows.length > 0) {
                    db.query(
                        `UPDATE users
                         SET name = ?, password_hash = ?, salt = ?, role = 'admin'
                         WHERE id = ?`,
                        [name, hash, salt, rows[0].id],
                        (updateErr) => {
                            if (updateErr)
                                fail("Could not update the admin row:", updateErr);

                            report(rows[0].id, "updated");
                        }
                    );
                    return;
                }

                db.query(
                    `INSERT INTO users (name, email, password_hash, salt, role)
                     VALUES (?, ?, ?, ?, 'admin')`,
                    [name, email, hash, salt],
                    (insertErr, result) => {
                        if (insertErr)
                            fail("Could not insert the admin row:", insertErr);

                        report(result.insertId, "created");
                    }
                );
            }
        );
    })
    .catch((error) => fail("Seeding failed:", error));
