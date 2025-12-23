# Backend Restart Instructions

## To Fix the Meeting Table Error:

1. **Stop the backend server** (Press Ctrl+C in the terminal)

2. **Regenerate Prisma Client:**
   ```bash
   npx prisma generate
   ```

3. **Restart the server:**
   ```bash
   npm run dev
   ```

## Why This Is Needed:

The Meeting table was added to the database, but the Prisma client needs to be regenerated to include the new Meeting model. The server locks the Prisma client files while running, so it must be stopped first.

