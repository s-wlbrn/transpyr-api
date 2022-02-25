const mongoose = require('mongoose');
const { build, perBuild, fake } = require('@jackfranklin/test-data-bot');
const { randomInteger } = require('../helpers/randomInteger');

exports.userBuilder = build('User', {
  fields: {
    name: fake((f) => f.name.findName()),
    email: fake((f) => f.internet.email().toLowerCase()),
    tagline: fake((f) => f.lorem.sentence()),
    bio: fake((f) => f.lorem.paragraph()),
    interests: fake((f) => f.lorem.sentence()),
    privateFavorites: fake((f) => f.datatype.boolean()),
    favorites: perBuild(() => {
      const favorites = Array(randomInteger(1, 10))
        .fill(null)
        .map(() => {
          return mongoose.Types.ObjectId().toString();
        });
      return favorites;
    }),
    role: perBuild(() => 'user'),
    password: perBuild(() => 'testpassword'),
    passwordConfirm: perBuild(() => 'testpassword'),
    active: perBuild(() => true),
  },
});
