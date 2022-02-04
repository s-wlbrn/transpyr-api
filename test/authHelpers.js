const testApp = require('./testApp');
const User = require('../models/user.model');

const createAndLogin = (user) => async () => {
  await User.create(user);

  const response = await testApp().post('/api/users/signin').send({
    email: user.email,
    password: user.password,
  });

  const userData = {
    token: response.body.token,
    user: response.body.data.user,
  };

  return userData;
};

exports.createGuest = () => {
  return {
    token: null,
    user: {
      email: 'guest@tester.com',
      name: 'Guest Tester',
    },
  };
};

exports.createUserAndLogin = createAndLogin({
  name: 'Test Tester',
  email: 'test@tester.com',
  password: 'testpassword',
  passwordConfirm: 'testpassword',
});

exports.createAdminAndLogin = createAndLogin({
  name: 'Admin Tester',
  email: 'admin@tester.com',
  password: 'testpassword',
  passwordConfirm: 'testpassword',
  role: 'admin',
});
