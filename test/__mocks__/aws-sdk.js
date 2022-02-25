class S3 {}

const mockPutObject = jest.fn(() => {
  return {
    promise: () => {
      return Promise.resolve({
        etag: '"6805f2cfc46c0f04559748bb039d69ae"',
        Location: 'https://s3.amazonaws.com/event-booking-test/test.jpg',
      });
    },
  };
});

S3.prototype.putObject = mockPutObject;

const awsSdk = {
  S3,
};

module.exports = awsSdk;
module.exports.S3 = awsSdk.S3;
