const testApp = require('../testApp');
const User = require('../../models/user.model');
const { mockUsers } = require('../mock-data/mockData');

const createAndLogin = (overrides) => async () => {
  const mockUser = mockUsers(1, { overrides });
  await User.create(mockUser);

  const response = await testApp().post('/api/users/signin').send({
    email: mockUser.email,
    password: mockUser.password,
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

exports.createUserAndLogin = createAndLogin();

exports.createAdminAndLogin = createAndLogin({
  role: 'admin',
});
