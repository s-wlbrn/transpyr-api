const testApp = require('../test/testApp');

test('returns 404 when accessing nonexistent endpoint', async () => {
  const response = await testApp().get('/api/random-nonexistent-endpoint');
  expect(response.statusCode).toBe(404);
  expect(response.header['content-type']).toEqual(
    expect.stringContaining('application/json')
  );
  expect(response.body.message).toEqual(expect.stringMatching(/not found/i));
});
