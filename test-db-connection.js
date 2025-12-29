// Database Connection Test Script
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  console.log('🔍 Testing database connection...');
  console.log('📡 Database URL:', process.env.DATABASE_URL ? 
    process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@') : 'NOT SET');
  
  try {
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Successfully connected to database!');
    
    // Test a simple query
    const userCount = await prisma.user.count();
    console.log(`✅ Database is working! Found ${userCount} users.`);
    
    await prisma.$disconnect();
    console.log('✅ Connection closed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error('Error:', error.message);
    
    if (error.message.includes("Can't reach database server")) {
      console.log('\n💡 Possible solutions:');
      console.log('1. Check if your Railway database is paused (free tier pauses after inactivity)');
      console.log('   → Go to Railway dashboard and unpause your database');
      console.log('2. Verify your DATABASE_URL in .env file is correct');
      console.log('3. Check if the database credentials have expired');
      console.log('4. Try using a local PostgreSQL database for development');
      console.log('\n📝 Example local DATABASE_URL:');
      console.log('   DATABASE_URL="postgresql://username:password@localhost:5432/iru_board?schema=public"');
    }
    
    await prisma.$disconnect();
    process.exit(1);
  }
}

testConnection();


