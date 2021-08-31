const dotenv = require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');

//Handle uncaught exception
process.on('uncaughtException', (err) => {
  console.log(err);
  console.log('Uncaught exception! Shutting down.');
  process.exit(1);
});

//Create app
const app = require('./app.js');

//Plug in database username and password from env to connection string
const DB = process.env.DB_URL.replace('<PASSWORD>', process.env.DB_PASS);

//Connect to database
mongoose
  .connect(DB, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('DB connection succesful!');
  });

//Set port from env, default to 3000
const { PORT } = process.env || 3000;

//Create server
const server = app.listen(PORT, () => {
  console.log(`Server started, listening on port ${PORT}...`);
});

//Handle unhandled promise rejection
process.on('unhandledRejection', (err) => {
  console.log(err.name, err.message);
  console.log('Unhandled rejection! Shutting down...');
  server.close(() => {
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated.');
  });
});
