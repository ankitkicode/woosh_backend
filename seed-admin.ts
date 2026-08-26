import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { Admin } from './src/models/Admin';
import { UserRole } from './src/config/constants';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/woosh_db';

async function seedAdmin() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!');

    const email = 'admin@woosh.com';
    const password = 'admin'; // We will just set it to admin for simplicity
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    console.log('Clearing all existing admins...');
    await Admin.deleteMany({});
    
    console.log('Creating super admin...');
    await Admin.create({
      name: 'Super Admin',
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    });
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);

  } catch (error) {
    console.error('Error seeding admin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

seedAdmin();
