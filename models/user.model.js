const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const mongoosePaginate = require('mongoose-paginate');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name.'],
      maxLength: [42, 'Name must be under 42 characters.'],
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
      minlength: [8, 'Password must be at least 8 characters long.'],
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
    photo: {
      type: String,
      default: 'default.jpeg',
    },
    tagline: {
      type: String,
      max: [150, 'A user bio cannot exceed 150 characters.'],
    },
    bio: {
      type: String,
      max: [1000, 'A user bio cannot exceed 1000 characters.'],
    },
    interests: {
      type: String,
      max: [500, 'A user bio cannot exceed 500 characters.'],
    },
    favorites: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Event',
      },
    ],
    privateFavorites: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    active: {
      type: Boolean,
      default: true,
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  { selectPopulatedPaths: false }
);

userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret.password;
  },
});

//Plugins
userSchema.plugin(mongoosePaginate);

//VIRTUAL FIELDS
userSchema.virtual('events', {
  ref: 'Event',
  localField: '_id',
  foreignField: 'organizer',
  justOne: false,
});

//MIDDLEWARE
//Hash password
userSchema.pre('save', async function (next) {
  //hash pw only if it was modified
  if (!this.isModified('password')) return next();

  //Hash password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);

  //Clear passwordConfirm field
  this.passwordConfirm = undefined;
  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

//METHODS
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

    return jwtTimestamp < formattedTimestamp + 1000;
  }

  return false;
};

userSchema.methods.updatePassword = function (password, passwordConfirm) {
  this.password = password;
  this.passwordConfirm = passwordConfirm;

  return this;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

userSchema.methods.clearPasswordResetToken = function () {
  this.passwordResetToken = undefined;
  this.passwordResetExpires = undefined;

  return this;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
