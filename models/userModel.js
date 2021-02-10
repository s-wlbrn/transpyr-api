const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name.'],
  },
  email: {
    type: String,
    required: [true, 'Please enter your email address.'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address.',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please enter a password.'],
    minlength: [8, 'Your password must be at lease 8 characters long.'],
    select: false,
  },
  passwordConfirm: {
    type: String,
    required: [true, 'Please enter your password again to confirm.'],
    validate: {
      validator: function (pw) {
        return pw === this.password;
      },
      message: 'Passwords do not match.',
    },
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  resetTokenExpires: Date,
  //birthday
  ////Date
  photo: {
    type: String,
    default: 'default.jpg',
  },
  active: {
    type: Boolean,
    default: true,
    select: false,
  },
});

userSchema.pre('save', async function (next) {
  //hash pw only if it was modified
  if (!this.isModified('password')) return next();

  //Hash password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);

  //Clear passwordConfirm field
  this.passwordConfirm = undefined;
  next();
});

userSchema.methods.isCorrectPassword = async function (
  passwordAttempt,
  userPassword
) {
  return await bcrypt.compare(passwordAttempt, userPassword);
};

userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
  if (this.passwordChangedAt) {
    const formattedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );

    return jwtTimestamp > formattedTimestamp;
  }

  return false;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
