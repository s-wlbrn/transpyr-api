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
