const testApp = require('../testApp');
const User = require('../../models/user.model');
const { mockUsers } = require('../mock-data/mockData');

const createAndLogin = (overrides) => async (otherOverrides) => {
  const mockUser = mockUsers(1, {
    overrides: { ...overrides, ...otherOverrides },
  });
  const user = await User.create(mockUser);

  const response = await testApp().post('/api/users/signin').send({
    email: user.email,
    password: mockUser.password,
  });

  const refreshToken = response.header['set-cookie'][0]
    .split(';')[0]
    .split('=')[1];

  const userData = {
    token: response.body.token,
    user: { ...response.body.data.user, password: user.password },
    refreshToken,
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
