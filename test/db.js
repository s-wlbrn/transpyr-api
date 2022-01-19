const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

//Connect to in-memory db
exports.connect = async () => {
  const mongo = await MongoMemoryServer.create();
  const uri = await mongo.getUri();
  global.__MONGOINSTANCE = mongo;

  const mongooseOptions = {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true,
    poolSize: 10,
  };

  await mongoose.connect(uri, mongooseOptions);
};

//Close db connection
exports.closeDatabase = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await global.__MONGOINSTANCE.stop();
};

//delete db collections
exports.clearDatabase = async () => {
  const { collections } = mongoose.connection;
  const collectionKeys = Object.keys(collections);
  collectionKeys.forEach(async (key) => {
    const collection = collections[key];
    await collection.deleteMany({});
  });
};
