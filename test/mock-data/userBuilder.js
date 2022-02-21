const { build, fake } = require('@jackfranklin/test-data-bot');

exports.userBuilder = build('User', {
  fields: {
    name: fake((f) => f.name.findName()),
    email: fake((f) => f.internet.email().toLowerCase()),
    tagline: fake((f) => f.lorem.sentence()),
    bio: fake((f) => f.lorem.paragraph()),
    interests: fake((f) => f.lorem.sentence()),
    privateFavorites: fake((f) => f.datatype.boolean()),
    role: 'user',
    password: 'testpassword',
    passwordConfirm: 'testpassword',
  },
});
