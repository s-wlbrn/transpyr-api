const testApp = require('./testApp');
const User = require('../models/user.model');

exports.createUserAndLogin = async () => {
  await User.create({
    name: 'Test Tester',
    email: 'test@tester.com',
    password: 'testpassword',
    passwordConfirm: 'testpassword',
  });

  const response = await testApp().post('/api/users/signin').send({
    email: 'test@tester.com',
    password: 'testpassword',
  });

  return response.body.token;
};
