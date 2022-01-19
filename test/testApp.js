const supertest = require('supertest');
const app = require('../app');

//Simple wrapper to avoid importing app and supertest in every test file.

module.exports = () => {
  return supertest(app);
};
