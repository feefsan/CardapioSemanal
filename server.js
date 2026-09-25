const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, "data", "menu.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "altere-esta-chave-em-producao";

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

async function readMenu() { return JSON.parse(await fs.readFile(DATA_FILE, "utf8")); }
async function writeMenu(value) {
  const temp = DATA_FILE + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temp, DATA_FILE);
}
function requireAuth(req, res, next) { return req.session.authenticated ? next() : res.status(401).json({ error: "Não autorizado" }); }
function clean(value, max=120) { return String(value ?? "").trim().slice(0, max); }
function validMenu(body) {
  if (!body || !Array.isArray(body.days) || body.days.length !== 7) return null;
  return {
    establishment: clean(body.establishment, 90) || "Serviço de Alimentação",
    weekLabel: clean(body.weekLabel, 90),
    updatedAt: new Date().toISOString(),
    days: body.days.map((d, index) => ({
      id: index,
      date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") ? d.date : "",
      breakfast: clean(d.breakfast, 180),
      main: clean(d.main, 120),
      side: clean(d.side, 120),
      garnish: clean(d.garnish, 120),
      salads: clean(d.salads, 180),
      dessert: clean(d.dessert, 120),
      note: clean(d.note, 200)
    }))
  };
}

app.get("/api/menu", async (_req, res) => { try { res.json(await readMenu()); } catch { res.status(500).json({error:"Não foi possível carregar o cardápio"}); } });
app.get("/api/session", (req, res) => res.json({ authenticated: Boolean(req.session.authenticated) }));
app.post("/api/login", (req, res) => {
  if (String(req.body?.password || "") !== ADMIN_PASSWORD) return res.status(401).json({error:"Senha incorreta"});
  req.session.authenticated = true;
  res.json({ok:true});
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ok:true})));
app.put("/api/menu", requireAuth, async (req, res) => {
  const menu = validMenu(req.body);
  if (!menu) return res.status(400).json({error:"Cardápio inválido"});
  try { await writeMenu(menu); res.json(menu); } catch { res.status(500).json({error:"Não foi possível salvar"}); }
});
app.get("/admin", (_req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.listen(PORT, () => console.log(`Cardápio disponível em http://localhost:${PORT}`));
