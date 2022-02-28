const { S3 } = require('aws-sdk');
const testApp = require('../test/testApp');

describe('Unhandled routes', () => {
  it('returns 404 when accessing nonexistent endpoint', async () => {
    const response = await testApp().get('/api/random-nonexistent-endpoint');
    expect(response.statusCode).toBe(404);
    expect(response.header['content-type']).toEqual(
      expect.stringContaining('application/json')
    );
    expect(response.body.message).toEqual(expect.stringMatching(/not found/i));
  });
});

describe('Streaming images', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  class MockAWSError extends Error {
    constructor(message, code, statusCode) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }

  it('calls S3, retrieves image, pipes image data with correct content type', async () => {
    const getObjectMock = jest.spyOn(S3.prototype, 'getObject');

    const response = await testApp().get('/image/test-folder/test-image.jpg');

    expect(getObjectMock).toHaveBeenCalledWith({
      Bucket: 'transpyr-storage',
      Key: 'test-folder/test-image.jpg',
    });

    expect(response.statusCode).toBe(200);
    expect(response.header['content-type']).toEqual(
      expect.stringContaining('image/jpeg')
    );
  });

  it('handles image not found', async () => {
    jest.spyOn(S3.prototype, 'getObject').mockImplementation(() => {
      return {
        promise: () =>
          Promise.reject(
            new MockAWSError(
              'The specified key does not exist.',
              'NoSuchKey',
              404
            )
          ),
      };
    });

    const response = await testApp().get('/image/test-folder/test-image.jpg');

    expect(response.statusCode).toBe(404);
    expect(response.header['content-type']).toEqual(
      expect.stringContaining('application/json')
    );
    expect(response.body.message).toEqual(expect.stringMatching(/not found/i));
  });
});
