// Server-side authentication helpers.
//
// The risk history feature needs the backend to know who is calling, so
// identity is decided here and never taken from the request body. Passwords
// are hashed with bcrypt and the session token is HMAC signed.

const crypto = require("crypto");
const db = require("./db");

// Prefer the native bcrypt module when it is installed; bcryptjs is the
// pure-JS drop-in with the same $2b$ hashes and the same hash/compare API,
// so accounts stay interchangeable between the two.
let bcrypt;
try {
    bcrypt = require("bcrypt");
} catch {
    bcrypt = require("bcryptjs");
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// A secret is required to sign tokens. In development a stable fallback keeps
// the app runnable, but AUTH_SECRET in .env should always be set in real use.
const SECRET =
    process.env.AUTH_SECRET || "upi-safeguard-development-secret";

const base64url = (buffer) =>
    Buffer.from(buffer).toString("base64url");


// -------------------------------------------
// PASSWORD HASHING (bcrypt)
// -------------------------------------------

async function hashPassword(password) {
    const hash = await bcrypt.hash(String(password), 10);

    // bcrypt carries its own salt inside the hash; the salt column is kept
    // populated because the schema marks it NOT NULL and legacy scrypt rows
    // still read it.
    const salt = crypto.randomBytes(16).toString("hex");

    return { salt, hash };
}


async function verifyPassword(password, salt, expectedHash) {
    if (!expectedHash) return false;

    // bcrypt rows ($2a$/$2b$/$2y$) are verified with bcrypt.compare.
    if (expectedHash.startsWith("$2")) {
        try {
            return await bcrypt.compare(String(password), expectedHash);
        } catch {
            return false;
        }
    }

    // Legacy rows were hashed with scrypt before bcrypt was introduced.
    if (!salt) return false;

    try {
        const derived = crypto
            .scryptSync(String(password), salt, 64);

        const expected = Buffer.from(expectedHash, "hex");

        if (derived.length !== expected.length) return false;

        return crypto.timingSafeEqual(derived, expected);
    } catch {
        return false;
    }
}


// -------------------------------------------
// SESSION TOKEN
// -------------------------------------------

const sign = (value) =>
    crypto
        .createHmac("sha256", SECRET)
        .update(value)
        .digest("base64url");


// Issues a token bound to the user id. The role is deliberately not encoded:
// it is re-read from the database on every request so a role change takes
// effect immediately instead of waiting for the token to expire.
function createToken(user) {
    const payload = {
        sub: user.id,
        email: user.email,
        exp: Date.now() + TOKEN_TTL_MS,
    };

    const body = base64url(JSON.stringify(payload));

    return `${body}.${sign(body)}`;
}


// Returns the payload when the signature is valid and the token has not
// expired, otherwise null.
function readToken(token) {
    if (!token || typeof token !== "string") return null;

    const [body, signature] = token.split(".");

    if (!body || !signature) return null;

    const expected = sign(body);

    const given = Buffer.from(signature);
    const want = Buffer.from(expected);

    if (given.length !== want.length) return null;

    if (!crypto.timingSafeEqual(given, want)) return null;

    let payload;

    try {
        payload = JSON.parse(
            Buffer.from(body, "base64url").toString("utf8")
        );
    } catch {
        return null;
    }

    if (!payload || !payload.sub) return null;

    if (!payload.exp || payload.exp < Date.now()) return null;

    return payload;
}


// -------------------------------------------
// ROLE ASSIGNMENT
// -------------------------------------------

// Admin access is granted by listing addresses in ADMIN_EMAILS in .env.
// There is no hardcoded account, so every admin is a real registration.
function roleForEmail(email) {
    const admins = String(process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return admins.includes(String(email).toLowerCase().trim())
        ? "admin"
        : "user";
}


// -------------------------------------------
// MIDDLEWARE
// -------------------------------------------

const bearerToken = (req) => {
    const header = req.headers.authorization || "";

    return header.startsWith("Bearer ")
        ? header.slice(7).trim()
        : null;
};


// Loads the signed-in user from the database using only the token's user id.
// Any user_id in the query string or body is ignored.
const resolveUser = (payload) =>
    new Promise((resolve) => {
        db.query(
            "SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1",
            [payload.sub],
            (err, rows) => {
                if (err || !rows || rows.length === 0) {
                    return resolve(null);
                }

                resolve(rows[0]);
            }
        );
    });


// Rejects the request unless a valid token is present.
async function requireAuth(req, res, next) {
    const payload = readToken(bearerToken(req));

    if (!payload) {
        return res.status(401).json({
            error: "Authentication required. Please sign in again.",
        });
    }

    const user = await resolveUser(payload);

    if (!user) {
        return res.status(401).json({
            error: "Your session is no longer valid. Please sign in again.",
        });
    }

    req.user = user;
    req.token = payload;

    next();
}


// Attaches req.user when a valid token is present but allows the request
// through when it is not. Used by endpoints that must keep working for
// visitors while still recording history for signed-in users.
async function optionalAuth(req, res, next) {
    const payload = readToken(bearerToken(req));

    if (payload) {
        const user = await resolveUser(payload);

        if (user) {
            req.user = user;
            req.token = payload;
        }
    }

    next();
}


module.exports = {
    hashPassword,
    verifyPassword,
    createToken,
    readToken,
    roleForEmail,
    requireAuth,
    optionalAuth,
};
