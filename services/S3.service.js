const aws = require('aws-sdk');

exports.uploadImage = async (data, folder, filename) => {
  const s3 = new aws.S3();

  return await s3
    .putObject({
      Bucket: process.env.AWS_BUCKET,
      Key: `${folder}/${filename}`,
      Body: data,
    })
    .promise();
};
exports.getImage = async (folder, filename) => {
  const s3 = new aws.S3();

  const data = await s3
    .getObject({
      Bucket: 'transpyr-storage',
      Key: `${folder}/${filename}`,
    })
    .promise();

  return data.Body;
};
