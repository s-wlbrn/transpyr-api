const mongoose = require('mongoose');
const crypto = require('crypto');

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
    token: String,
    expires: Date,
    created: {
      type: Date,
      default: Date.now,
    },
    //createdByIp: String,
    revoked: Date,
    //revokedByIp: String,
    replacedByToken: String,
  },
  {
    toObject: { virtuals: true },
  }
);

refreshTokenSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
    delete ret.id;
    delete ret.user;
  },
});

//VIRTUAL FIELDS
refreshTokenSchema.virtual('isExpired').get(function () {
  return Date.now() >= this.expires;
});

refreshTokenSchema.virtual('isActive').get(function () {
  return !this.revoked && !this.isExpired;
});

//MIDDLEWARE
refreshTokenSchema.pre('save', function (next) {
  if (this.token) return next();
  this.token = crypto.randomBytes(40).toString('hex');

  next();
});

//METHODS
refreshTokenSchema.methods.revoke = function (newToken) {
  this.revoked = new Date();
  if (newToken) this.replacedBy = newToken;

  return this;
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;
