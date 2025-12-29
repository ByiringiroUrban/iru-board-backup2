# Database Setup Guide

## 🔴 Current Issue: Database Connection Failed

Your application cannot connect to the database at `tramway.proxy.rlwy.net:50898` (Railway).

## ✅ Quick Fix Options

### Option 1: Fix Railway Database (Recommended if you have Railway account)

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Log in to your account

2. **Check Database Status**
   - Find your PostgreSQL database service
   - If it shows "Paused" or "Sleeping", click **"Resume"** or **"Unpause"**
   - Wait 1-2 minutes for the database to start

3. **Get New Connection String**
   - Click on your database service
   - Go to the "Variables" or "Connect" tab
   - Copy the `DATABASE_URL` connection string
   - It should look like:
     ```
     postgresql://postgres:password@tramway.proxy.rlwy.net:50898/railway?sslmode=require
     ```

4. **Update .env File**
   - Open `backend/.env`
   - Update the `DATABASE_URL` with the new connection string
   - Save the file

5. **Test Connection**
   ```bash
   cd backend
   npm run test:db
   ```

6. **Restart Server**
   ```bash
   npm run dev
   ```

---

### Option 2: Use Local PostgreSQL Database (Best for Development)

#### Step 1: Install PostgreSQL

**Windows:**
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer
3. Remember the password you set for the `postgres` user
4. Default port is `5432`

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

#### Step 2: Create Database

1. **Open PostgreSQL Command Line** (psql)
   - Windows: Search for "SQL Shell (psql)" in Start Menu
   - Or use: `psql -U postgres`

2. **Create Database**
   ```sql
   CREATE DATABASE iru_board;
   ```

3. **Verify Database Created**
   ```sql
   \l
   ```
   You should see `iru_board` in the list

4. **Exit psql**
   ```sql
   \q
   ```

#### Step 3: Update .env File

Open `backend/.env` and set:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/iru_board?schema=public"
```

Replace `YOUR_PASSWORD` with the password you set during PostgreSQL installation.

#### Step 4: Run Migrations

```bash
cd backend
npm run prisma:migrate
```

This will create all the necessary tables in your database.

#### Step 5: Test Connection

```bash
npm run test:db
```

You should see:
```
✅ Successfully connected to database!
✅ Database is working! Found X users.
```

#### Step 6: Start Server

```bash
npm run dev
```

---

### Option 3: Use Free Cloud Database (Alternative)

If Railway isn't working, you can use other free PostgreSQL services:

1. **Supabase** (Recommended)
   - Visit: https://supabase.com
   - Create a free account
   - Create a new project
   - Go to Settings > Database
   - Copy the connection string
   - Update `DATABASE_URL` in `.env`

2. **Neon** (Recommended)
   - Visit: https://neon.tech
   - Create a free account
   - Create a new project
   - Copy the connection string
   - Update `DATABASE_URL` in `.env`

3. **Render**
   - Visit: https://render.com
   - Create a free PostgreSQL database
   - Copy the connection string
   - Update `DATABASE_URL` in `.env`

---

## 🧪 Testing Database Connection

After setting up your database, always test the connection:

```bash
cd backend
npm run test:db
```

**Expected Output (Success):**
```
🔍 Testing database connection...
📡 Database URL: postgresql://postgres:****@localhost:5432/iru_board
✅ Successfully connected to database!
✅ Database is working! Found 0 users.
✅ Connection closed successfully.
```

**Expected Output (Failure):**
```
❌ Database connection failed!
Error: Can't reach database server at...
💡 Possible solutions:
1. Check if your Railway database is paused...
```

---

## 🔧 Troubleshooting

### Error: "Can't reach database server"

**Solutions:**
1. Check if database service is running (Railway/Supabase/etc.)
2. Verify `DATABASE_URL` in `.env` is correct
3. Check firewall/network settings
4. Try using a local database instead

### Error: "password authentication failed"

**Solutions:**
1. Verify the password in `DATABASE_URL` is correct
2. Reset PostgreSQL password if needed

### Error: "database does not exist"

**Solutions:**
1. Create the database: `CREATE DATABASE iru_board;`
2. Or update `DATABASE_URL` to use an existing database

### Error: "relation does not exist"

**Solutions:**
1. Run migrations: `npm run prisma:migrate`
2. This will create all necessary tables

---

## 📝 Environment Variables

Your `backend/.env` file should contain:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/iru_board?schema=public"

# JWT Secret
JWT_SECRET="your-secret-key-here"

# Server
PORT=5000
FRONTEND_URL="http://localhost:8080"
BACKEND_URL="http://localhost:5000"

# Agora (for video calls)
AGORA_APP_ID="your-agora-app-id"
AGORA_APP_CERTIFICATE="your-agora-certificate"
```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Database connection test passes (`npm run test:db`)
- [ ] Migrations completed successfully
- [ ] Server starts without database errors
- [ ] Can register a new user
- [ ] Can login with registered user

---

## 🆘 Still Having Issues?

1. **Check Prisma Client is Generated**
   ```bash
   cd backend
   npx prisma generate
   ```

2. **Reset Database (⚠️ Deletes all data)**
   ```bash
   npx prisma migrate reset
   ```

3. **View Database in Prisma Studio**
   ```bash
   npm run prisma:studio
   ```
   This opens a visual database browser at http://localhost:5555

4. **Check Logs**
   - Look at terminal output for detailed error messages
   - Check browser console for frontend errors
   - Check Network tab in browser DevTools

---

## 📞 Need Help?

If you're still stuck:
1. Run `npm run test:db` and share the output
2. Check your `.env` file (without sharing sensitive data)
3. Verify PostgreSQL is installed and running (if using local)
4. Check Railway/Supabase dashboard (if using cloud)

