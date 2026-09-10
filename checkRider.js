const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://admin:admin123@cluster0.j6oxyvz.mongodb.net/woosh?retryWrites=true&w=majority')
.then(async () => {
    const RiderProfile = mongoose.model('RiderProfile', new mongoose.Schema({}, { strict: false }));
    const riders = await RiderProfile.find({});
    console.log(JSON.stringify(riders, null, 2));
    process.exit(0);
});
