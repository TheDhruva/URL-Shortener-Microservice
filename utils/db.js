const mongoose = require('mongoose');

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  const db = await mongoose.connect(process.env.MONGO_URI);
  cachedDb = db;
  return db;
}

module.exports = connectToDatabase;
