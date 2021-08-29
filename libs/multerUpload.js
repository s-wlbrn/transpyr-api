const multer = require('multer');
const AppError = require('./AppError');

//Validate image type
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image. Please upload a valid image type', 400));
  }
};

module.exports = multer({
  storage: multer.memoryStorage(),
  fileFilter: multerFilter,
});
