# FindIt — Lost & Found Application

A beginner-friendly but feature-rich Lost & Found web application built with Node.js, Express, MongoDB, Mongoose, EJS and Bootstrap.

## 12 core features
1. User registration and login (bcrypt password hashing)
2. Report a lost item
3. Report a found item
4. Browse all active/returned reports
5. Search and filter by keyword, type, category and status
6. Item details page
7. Contact the report owner through in-app requests (email is not exposed publicly)
8. Personal dashboard and sent/received request history
9. Admin dashboard, user and report management
10. Edit/delete own reports (admins can moderate all reports)
11. Mark an item as returned
12. In-app notifications for contact requests and request status updates

## Requirements
- Node.js 18 or newer
- MongoDB Community Server running locally, or a MongoDB Atlas connection string
- VS Code (recommended)

## Windows PowerShell setup
1. Extract the project folder and open it in VS Code.
2. Open Terminal → PowerShell and enter:

```powershell
cd path	o\lost-and-found
Copy-Item .env.example .env
npm install
```

3. Open `.env` and set a strong `SESSION_SECRET`, plus your admin email/password. The sample admin credentials are only for local testing; change them before use.
4. Make sure MongoDB is running. For a local MongoDB installation, the default URI is already set to `mongodb://127.0.0.1:27017/lost_and_found_mini`.
5. Start the application:

```powershell
npm run dev
```

If nodemon is not installed or the dev command is unavailable, use:

```powershell
npm start
```

6. Open **http://localhost:3000** in your browser.

## Initial administrator
The first server start creates an admin account using `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, if that email does not already exist. Log in with those credentials and open **Admin** from the navigation bar.

## MongoDB database and collections
Database: `lost_and_found_mini`
- `users`
- `items`
- `contactrequests`
- `notifications`

Mongoose creates collections automatically when the first matching document is saved.

## Image uploads
Optional item images are stored in `public/uploads`. Supported formats: JPG, PNG, WEBP and GIF. Maximum file size: 3 MB. Do not upload private documents or sensitive personal information.

## Important security notes
- Passwords are hashed with bcrypt.
- Session cookies are HTTP-only and sessions are stored in MongoDB.
- Users can edit/delete only their own reports; admins can moderate reports.
- The app is intended as a learning project. Before public deployment, use HTTPS, set a strong unique session secret, configure secure cookies, add CSRF protection and rate limiting, validate uploaded image content (not only MIME type), and use a managed production session/database setup.
- Contact is handled through in-app messages; this starter project does not send email or SMS.

## Troubleshooting
- **MongoDB connection refused:** Start MongoDB service, then retry. Check `MONGO_URI` in `.env`.
- **Port already in use:** Change `PORT=3001` in `.env`, then open `http://localhost:3001`.
- **Cannot find module:** Run `npm install` in the project root.
- **Image upload error:** Use JPG/PNG/WEBP/GIF and keep the file below 3 MB.
- **Admin page redirects:** Log in using the admin credentials from `.env`; normal user accounts do not have admin access.
