const sharp = require('sharp');
const User = require('../models/user.model');

//image upload
exports.processUserPhoto = async (buffer) => {
  const data = await sharp(buffer)
    .resize(500, 500)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toBuffer();

  return data;
};

//queries
exports.createUser = async (name, email, password, passwordConfirm) => {
  const user = await User.create({
    name,
    email,
    password,
    passwordConfirm,
  });

  return user;
};

exports.getUser = async (query, options = {}) => {
  const userQuery = User.findOne(query);

  if (options.password) userQuery.select('+password');

  const user = await userQuery;

  return user;
};

//helpers
exports.paginateUserEventFields = (queryPaginate) => {
  //paginate options
  let pagination = {};
  //conditionally parse JSON
  if (queryPaginate) {
    pagination =
      typeof queryPaginate === 'string'
        ? JSON.parse(queryPaginate)
        : queryPaginate;
  }

  const limit = pagination.limit ? Number(pagination.limit) : 4;
  const skip = pagination.page ? limit * (pagination.page - 1) : 0;

  return { skip, limit };
};

exports.populateUserEventFields = (
  query,
  selectedFields,
  eventFields,
  pagination
) => {
  const { skip, limit } = pagination;
  const userEventFields = ['favorites', 'events'];

  userEventFields.forEach((field) => {
    if (selectedFields.includes(field)) {
      query.populate({
        path: field,
        match: { published: true },
        options: {
          skip,
          limit,
          select: eventFields,
        },
      });
    }
  });

  return query;
};

exports.removePrivateFavorites = (user) => {
  if (user.privateFavorites) {
    user.favorites = undefined;
  }
  user.privateFavorites = undefined;

  return user;
};
