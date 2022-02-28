const fs = require('fs');

class S3 {}

const mockGetObject = () => {
  return {
    promise: () => {
      return Promise.resolve({
        Body: Buffer.from(fs.readFileSync('./test/mock-data/test-image.jpg')),
      });
    },
  };
};

const mockPutObject = () => {
  return {
    promise: () => {
      return Promise.resolve({
        etag: '"6805f2cfc46c0f04559748bb039d69ae"',
        Location: 'https://s3.amazonaws.com/event-booking-test/test.jpg',
      });
    },
  };
};

S3.prototype.putObject = mockPutObject;
S3.prototype.getObject = mockGetObject;

const awsSdk = {
  S3,
};

module.exports = awsSdk;
module.exports.S3 = awsSdk.S3;
