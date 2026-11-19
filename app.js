require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const methodOverride = require('method-override');
const User = require('./models/User');
const Item = require('./models/Item');
const ContactRequest = require('./models/ContactRequest');
const Notification = require('./models/Notification');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lost_and_found_mini';
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'development_secret_change_before_deploying',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1e9) + path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed.'));
  }
});

app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.notice = req.session.notice || null;
  delete req.session.notice;
  res.locals.unreadCount = 0;
  if (req.session.user) {
    try { res.locals.unreadCount = await Notification.countDocuments({ user: req.session.user.id, read: false }); } catch (_) {}
  }
  next();
});
function flash(req, message) { req.session.notice = message; }
function requireLogin(req, res, next) {
  if (!req.session.user) { flash(req, 'Please log in to continue.'); return res.redirect('/login'); }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') { flash(req, 'Administrator access is required.'); return res.redirect('/'); }
  next();
}
function validId(id) { return mongoose.Types.ObjectId.isValid(id); }
function removeUploaded(file) { if (file) fs.unlink(path.join(uploadDir, path.basename(file)), () => {}); }
async function notify(userId, message, link) {
  await Notification.create({ user: userId, message, link: link || '/dashboard' });
}
function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

app.get('/', asyncRoute(async (req, res) => {
  const latestItems = await Item.find({ status: 'active' }).populate('owner', 'name').sort({ createdAt: -1 }).limit(6);
  const totals = { lost: await Item.countDocuments({ type: 'lost', status: 'active' }), found: await Item.countDocuments({ type: 'found', status: 'active' }), returned: await Item.countDocuments({ status: 'returned' }) };
  res.render('home', { latestItems, totals });
}));

app.get('/register', (req, res) => res.render('auth/register'));
app.post('/register', asyncRoute(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  if (!name || !email || !password) { flash(req, 'Please complete all required fields.'); return res.redirect('/register'); }
  if (password.length < 8) { flash(req, 'Password must contain at least 8 characters.'); return res.redirect('/register'); }
  if (password !== confirmPassword) { flash(req, 'Passwords do not match.'); return res.redirect('/register'); }
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) { flash(req, 'An account with this email already exists.'); return res.redirect('/register'); }
  const hash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, password: hash });
  req.session.user = { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
  flash(req, 'Welcome! Your account has been created.');
  res.redirect('/dashboard');
}));
app.get('/login', (req, res) => res.render('auth/login'));
app.post('/login', asyncRoute(async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) { flash(req, 'Invalid email or password.'); return res.redirect('/login'); }
  req.session.user = { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
  flash(req, 'You are now logged in.');
  res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
}));
app.post('/logout', requireLogin, (req, res) => req.session.destroy(() => res.redirect('/')));

app.get('/items', asyncRoute(async (req, res) => {
  const filter = { status: req.query.status === 'returned' ? 'returned' : 'active' };
  if (['lost','found'].includes(req.query.type)) filter.type = req.query.type;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) filter.$or = [ { title: new RegExp(escapeRegex(req.query.q), 'i') }, { description: new RegExp(escapeRegex(req.query.q), 'i') }, { location: new RegExp(escapeRegex(req.query.q), 'i') } ];
  const items = await Item.find(filter).populate('owner', 'name').sort({ createdAt: -1 });
  res.render('items/index', { items, filters: req.query });
}));
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
app.get('/items/new', requireLogin, (req, res) => res.render('items/new'));
app.post('/items', requireLogin, upload.single('image'), asyncRoute(async (req, res) => {
  const { title, description, category, type, location, incidentDate } = req.body;
  if (!title || !description || !category || !type || !location || !incidentDate) {
    removeUploaded(req.file && req.file.filename); flash(req, 'Please complete all required item details.'); return res.redirect('/items/new');
  }
  const item = await Item.create({ title, description, category, type, location, incidentDate, image: req.file ? req.file.filename : '', owner: req.session.user.id });
  flash(req, 'Your item report has been published.'); res.redirect('/items/' + item._id);
}));
app.get('/items/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).render('404');
  const item = await Item.findById(req.params.id).populate('owner', 'name email');
  if (!item) return res.status(404).render('404');
  res.render('items/show', { item });
}));
app.get('/items/:id/edit', requireLogin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).render('404');
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).render('404');
  if (item.owner.toString() !== req.session.user.id && req.session.user.role !== 'admin') return res.status(403).render('403');
  res.render('items/edit', { item });
}));
app.put('/items/:id', requireLogin, upload.single('image'), asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).render('404');
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).render('404');
  if (item.owner.toString() !== req.session.user.id && req.session.user.role !== 'admin') return res.status(403).render('403');
  const { title, description, category, type, location, incidentDate } = req.body;
  if (!title || !description || !category || !type || !location || !incidentDate) { removeUploaded(req.file && req.file.filename); flash(req, 'Please complete all required item details.'); return res.redirect('/items/' + item._id + '/edit'); }
  Object.assign(item, { title, description, category, type, location, incidentDate });
  if (req.file) { removeUploaded(item.image); item.image = req.file.filename; }
  await item.save(); flash(req, 'Item report updated.'); res.redirect('/items/' + item._id);
}));
app.delete('/items/:id', requireLogin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).render('404');
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).render('404');
  if (item.owner.toString() !== req.session.user.id && req.session.user.role !== 'admin') return res.status(403).render('403');
  removeUploaded(item.image); await Item.findByIdAndDelete(item._id); await ContactRequest.deleteMany({ item: item._id });
  flash(req, 'Item report deleted.'); res.redirect(req.session.user.role === 'admin' ? '/admin' : '/dashboard');
}));
app.post('/items/:id/returned', requireLogin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).render('404');
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).render('404');
  if (item.owner.toString() !== req.session.user.id && req.session.user.role !== 'admin') return res.status(403).render('403');
  item.status = 'returned'; await item.save();
  flash(req, 'Great! The item has been marked as returned.'); res.redirect('/items/' + item._id);
}));

app.post('/items/:id/contact', requireLogin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).render('404');
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).render('404');
  if (item.owner.toString() === req.session.user.id) { flash(req, 'You cannot contact yourself about your own report.'); return res.redirect('/items/' + item._id); }
  const message = (req.body.message || '').trim();
  if (message.length < 5 || message.length > 600) { flash(req, 'Message must be between 5 and 600 characters.'); return res.redirect('/items/' + item._id); }
  await ContactRequest.create({ item: item._id, sender: req.session.user.id, recipient: item.owner._id, message });
  await notify(item.owner, `${req.session.user.name} sent a message about “${item.title}”.`, '/dashboard/requests');
  flash(req, 'Your contact request has been sent.'); res.redirect('/items/' + item._id);
}));

app.get('/dashboard', requireLogin, asyncRoute(async (req, res) => {
  const items = await Item.find({ owner: req.session.user.id }).sort({ createdAt: -1 });
  const requests = await ContactRequest.find({ recipient: req.session.user.id }).populate('item', 'title').populate('sender', 'name email').sort({ createdAt: -1 });
  const sentRequests = await ContactRequest.find({ sender: req.session.user.id }).populate('item', 'title').populate('recipient', 'name').sort({ createdAt: -1 });
  res.render('user/dashboard', { items, requests, sentRequests });
}));
app.get('/dashboard/requests', requireLogin, asyncRoute(async (req, res) => {
  const requests = await ContactRequest.find({ recipient: req.session.user.id }).populate('item', 'title').populate('sender', 'name email').sort({ createdAt: -1 });
  res.render('user/requests', { requests });
}));
app.post('/requests/:id/status', requireLogin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).render('404');
  const request = await ContactRequest.findById(req.params.id).populate('item', 'title');
  if (!request || request.recipient.toString() !== req.session.user.id) return res.status(404).render('404');
  if (!['reviewed','closed'].includes(req.body.status)) { flash(req, 'Invalid request status.'); return res.redirect('/dashboard/requests'); }
  request.status = req.body.status; await request.save();
  await notify(request.sender, `Your message about “${request.item.title}” was ${request.status}.`, '/dashboard');
  flash(req, 'Contact request updated.'); res.redirect('/dashboard/requests');
}));
app.get('/notifications', requireLogin, asyncRoute(async (req, res) => {
  const notifications = await Notification.find({ user: req.session.user.id }).sort({ createdAt: -1 }).limit(50);
  await Notification.updateMany({ user: req.session.user.id, read: false }, { read: true });
  res.render('user/notifications', { notifications });
}));

app.get('/admin', requireLogin, requireAdmin, asyncRoute(async (req, res) => {
  const [users, items, lost, found, returned, requests] = await Promise.all([
    User.find().sort({ createdAt: -1 }), Item.find().populate('owner', 'name email').sort({ createdAt: -1 }),
    Item.countDocuments({ type: 'lost', status: 'active' }), Item.countDocuments({ type: 'found', status: 'active' }),
    Item.countDocuments({ status: 'returned' }), ContactRequest.countDocuments()
  ]);
  res.render('admin/index', { users, items, stats: { users: users.length, items: items.length, lost, found, returned, requests } });
}));
app.post('/admin/users/:id/role', requireLogin, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).render('404');
  if (req.params.id === req.session.user.id) { flash(req, 'You cannot change your own administrator role.'); return res.redirect('/admin'); }
  if (!['user','admin'].includes(req.body.role)) { flash(req, 'Invalid role.'); return res.redirect('/admin'); }
  await User.findByIdAndUpdate(req.params.id, { role: req.body.role }); flash(req, 'User role updated.'); res.redirect('/admin');
}));
app.delete('/admin/users/:id', requireLogin, requireAdmin, asyncRoute(async (req, res) => {
  if (!validId(req.params.id) || req.params.id === req.session.user.id) { flash(req, 'That user cannot be deleted.'); return res.redirect('/admin'); }
  const user = await User.findById(req.params.id);
  if (!user) { flash(req, 'User not found.'); return res.redirect('/admin'); }
  const owned = await Item.find({ owner: user._id }); owned.forEach(item => removeUploaded(item.image));
  await Item.deleteMany({ owner: user._id }); await ContactRequest.deleteMany({ $or: [{ sender: user._id }, { recipient: user._id }] }); await Notification.deleteMany({ user: user._id }); await User.findByIdAndDelete(user._id);
  flash(req, 'User and their reports have been deleted.'); res.redirect('/admin');
}));

app.use((req, res) => res.status(404).render('404'));
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  if (req.file) removeUploaded(req.file.filename);
  const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 'Image must be smaller than 3 MB.' : (err.message || 'Something went wrong.');
  if (res.headersSent) return next(err);
  res.status(400).render('error', { message });
});

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected: lost_and_found_mini');
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (adminEmail && adminPassword) {
      const exists = await User.findOne({ email: adminEmail });
      if (!exists) {
        const hash = await bcrypt.hash(adminPassword, 12);
        await User.create({ name: process.env.ADMIN_NAME || 'Application Admin', email: adminEmail, password: hash, role: 'admin' });
        console.log('Initial admin account created from .env settings.');
      }
    }
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  } catch (error) {
    console.error('Startup failed. Check that MongoDB is running and MONGO_URI is correct.');
    console.error(error.message); process.exit(1);
  }
}
start();
