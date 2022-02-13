const axios = require('axios');

exports.clearTestMailbox = async () => {
  await axios.patch(
    `https://mailtrap.io/api/v1/inboxes/${process.env.TEST_INBOX_ID}/clean`,
    {},
    { headers: { 'Api-Token': process.env.MAILTRAP_API_KEY } }
  );
};

exports.getTestEmails = async () => {
  const response = await axios.get(
    `https://mailtrap.io/api/v1/inboxes/${process.env.TEST_INBOX_ID}/messages`,
    { headers: { 'Api-Token': process.env.MAILTRAP_API_KEY } }
  );
  return response.data;
};
