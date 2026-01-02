// Quick script to check what's in the database
const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
  name: String,
  url: String,
  email: String,
  currentStatus: String,
  hidden: Boolean
});

const Server = mongoose.model('Server', serverSchema);

async function checkServers() {
  try {
    await mongoose.connect('mongodb://localhost:27017/monitoring');
    console.log('Connected to MongoDB');
    
    const allServers = await Server.find({});
    console.log(`\nTotal servers in database: ${allServers.length}`);
    
    if (allServers.length > 0) {
      console.log('\nServers:');
      allServers.forEach((s, i) => {
        console.log(`${i+1}. ${s.name} - ${s.url} - Status: ${s.currentStatus} - Hidden: ${s.hidden}`);
      });
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkServers();
