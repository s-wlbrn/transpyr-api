const aws = require('aws-sdk');

module.exports = async (data, folder, filename) => {
  const s3 = new aws.S3();
  return await s3
    .putObject({
      Bucket: 'transpyr-storage',
      Key: `${folder}/${filename}`,
      Body: data,
    })
    .promise();
};
