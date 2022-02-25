const testApp = require('../testApp');

const getBodyData = (body, user) => {
  const data = {};
  const keys = Object.keys(body);

  keys.forEach((key) => {
    if (typeof body[key] === 'function') {
      data[key] = body[key](user);
    } else {
      data[key] = body[key];
    }
  });

  return data;
};

module.exports = (users, url, { method, body, headers } = {}) => {
  const requestPromises = users.map((user) => {
    const apiCall = testApp()[method](url);

    if (body) {
      const data = getBodyData(body, user.user);

      apiCall.send(data);
    }

    if (user.token) {
      apiCall.auth(user.token, { type: 'bearer' });
    }

    if (headers) {
      const headerKeys = Object.keys(headers);
      headerKeys.forEach((key) => {
        apiCall.set(key, headers[key]);
      });
    }

    return apiCall;
  });

  return requestPromises;
};
