const mongoose = require('mongoose');
const { Admin } = require('./src/models/Admin');
const { generateAccessToken } = require('./src/utils/generateToken');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/woosh').then(async () => {
  const admin = await Admin.findOne({ role: 'superadmin' });
  if (admin) {
    const token = generateAccessToken({ userId: admin._id, role: admin.role });
    console.log(token);
  } else {
    console.log("No superadmin found");
  }
  process.exit(0);
});
